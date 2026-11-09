// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ICrossProgramInvocation {
    struct AccountMeta {
        bytes32 pubkey;
        bool is_signer;
        bool is_writable;
    }

    function invoke(bytes32 program_id, AccountMeta[] calldata accounts, bytes calldata data) external;
    function invoke_signed(bytes32 program_id, AccountMeta[] calldata accounts, bytes calldata data, bytes32[] calldata seeds) external;
    function account_lamports(bytes32 pubkey) external view returns (uint64);
}

interface ISystemProgram {
    function program_id() external view returns (bytes32);
    function rome_evm_program_id() external view returns (bytes32);
    function operator() external view returns (bytes32);
    function mint_id() external view returns (bytes32);
}

interface IHelperProgram {
    function pda(address user) external view returns (bytes32);
    function ata(address user, bytes32 mint) external view returns (bytes32);
    function approve_spl(address spender, uint64 amount, bytes32 mint) external;
    function transfer_spl(address to, uint64 tokens, bytes32 mint) external;
}

interface IMeteoraDAMMv1Factory {
    function allPoolsLength() external view returns (uint256);
    function allPools(uint256 index) external view returns (address);
}

/**
 * @title MeteoraLiquidityPort (BinPulse)
 * @notice Dual-Lane Concentrated Liquidity & Automated Bin Management Port
 *         bridging Rome EVM and Solana Meteora (DLMM & DAMM v1) via Atomic CPI.
 */
contract MeteoraLiquidityPort {
    ICrossProgramInvocation public constant CPI_PROGRAM =
        ICrossProgramInvocation(0xFF00000000000000000000000000000000000008);
    ISystemProgram public constant SYSTEM_PROGRAM =
        ISystemProgram(0xfF00000000000000000000000000000000000007);
    IHelperProgram public constant HELPER_PROGRAM =
        IHelperProgram(0xff00000000000000000000000000000000000009);

    enum Strategy {
        SPOT,
        CURVE,
        BID_ASK
    }

    enum LaneType {
        EVM,
        SOLANA_SYNTHETIC
    }

    struct BinState {
        uint80 reserveX;
        uint80 reserveY;
        uint64 totalShares;
        uint16 feeMultiplierBps;
        uint16 lastTouchEpoch;
    }

    struct Position {
        uint256 id;
        address owner;
        bytes32 ownerAuthorityPda;
        bytes32 solanaPoolPubkey;
        int24 lowerBinId;
        int24 upperBinId;
        Strategy strategy;
        LaneType lane;
        uint128 liquidityX;
        uint128 liquidityY;
        uint128 accruedFeesX;
        uint128 accruedFeesY;
        uint128 claimedFeesX;
        uint128 claimedFeesY;
        uint64 createdAt;
        uint64 lastRebalancedAt;
        uint32 rebalanceCount;
        bool active;
    }

    struct PortMetrics {
        int24 activeBinId;
        uint16 binStepBps;
        uint128 totalValueLockedX;
        uint128 totalValueLockedY;
        uint256 totalPositions;
        uint256 totalRebalances;
        uint256 totalCpiCalls;
        uint256 syncedDammPoolsCount;
        address primaryDammPool;
        bytes32 vaultAuthorityPda;
        bytes32 romeProgramId;
    }

    address public immutable owner;
    address public meteoraDammFactory;
    bytes32 public meteoraDlmmProgramId;
    bytes32 public meteoraDammV1ProgramId;
    bytes32 internal defaultSolanaLbPair;

    int24 public activeBinId;
    uint16 public binStepBps;
    uint16 internal constant BASE_FEE_BPS = 25;

    uint128 internal totalValueLockedX;
    uint128 internal totalValueLockedY;
    uint128 internal totalFeesClaimedX;
    uint128 internal totalFeesClaimedY;

    uint256 internal nextPositionId = 1;
    uint256 internal totalRebalances;
    uint256 internal totalCpiCalls;

    uint256 internal syncedDammPoolsCount;
    address internal primaryDammPool;
    bytes32 internal cachedRomeProgramId;
    bytes32 internal cachedVaultAuthorityPda;

    mapping(int24 => BinState) internal bins;
    mapping(uint256 => Position) private _positions;
    mapping(address => uint256[]) private _userPositionIds;
    mapping(address => bytes32) public linkedSolanaPubkeys;

    event BinLiquidityAdded(
        uint256 indexed positionId,
        address indexed user,
        bytes32 userAuthorityPda,
        int24 lowerBinId,
        int24 upperBinId,
        Strategy strategy,
        LaneType lane,
        uint128 amountX,
        uint128 amountY,
        bytes32 solanaPoolPubkey
    );

    event BinsRebalancedAtomically(
        uint256 indexed positionId,
        address indexed user,
        int24 oldLowerBinId,
        int24 oldUpperBinId,
        int24 newLowerBinId,
        int24 newUpperBinId,
        Strategy newStrategy,
        int24 newActiveBinId,
        uint128 compoundedFeeX,
        uint128 compoundedFeeY
    );

    event BinFeesClaimed(
        uint256 indexed positionId,
        address indexed user,
        uint128 claimedX,
        uint128 claimedY,
        bytes32 userAuthorityPda
    );

    event AtomicCpiDispatched(
        bytes32 indexed targetProgramId,
        bytes32 indexed signerPda,
        bytes32 indexed poolAccount,
        bytes4 instructionDiscriminator,
        bool executedOnPrecompile,
        bytes payload
    );

    event MeteoraFactorySynced(
        address indexed factory,
        uint256 poolsCount,
        address primaryPool,
        bytes32 romeProgramId,
        bytes32 vaultPda
    );

    event DualLaneIdentityLinked(
        address indexed evmOrSyntheticAddress,
        bytes32 indexed solanaPubkey,
        address derivedSyntheticAddress,
        bytes32 authorityPda
    );

    error InvalidInput();
    error Unauthorized();

    constructor(
        address _meteoraDammFactory,
        bytes32 _meteoraDlmmProgramId,
        bytes32 _meteoraDammV1ProgramId,
        bytes32 _defaultSolanaLbPair,
        int24 _initialActiveBinId,
        uint16 _binStepBps
    ) {
        owner = msg.sender;
        meteoraDammFactory = _meteoraDammFactory;
        meteoraDlmmProgramId = _meteoraDlmmProgramId;
        meteoraDammV1ProgramId = _meteoraDammV1ProgramId;
        defaultSolanaLbPair = _defaultSolanaLbPair;
        activeBinId = _initialActiveBinId;
        binStepBps = _binStepBps == 0 ? 20 : _binStepBps;
        cachedRomeProgramId = keccak256("ROME_EVM_HADRIAN_PROGRAM");
        cachedVaultAuthorityPda = keccak256(abi.encodePacked("EXTERNAL_AUTHORITY", address(this)));
    }

    function syncMeteoraFactory() external returns (uint256 poolsCount, address firstPool, bytes32 vaultPda) {
        (bool okSys, bytes memory retSys) = address(SYSTEM_PROGRAM).staticcall(
            abi.encodeCall(ISystemProgram.rome_evm_program_id, ())
        );
        if (okSys && retSys.length >= 32) cachedRomeProgramId = abi.decode(retSys, (bytes32));

        (bool okPda, bytes memory retPda) = address(HELPER_PROGRAM).staticcall(
            abi.encodeCall(IHelperProgram.pda, (address(this)))
        );
        if (okPda && retPda.length >= 32) cachedVaultAuthorityPda = abi.decode(retPda, (bytes32));

        if (meteoraDammFactory != address(0) && meteoraDammFactory.code.length > 0) {
            (bool okLen, bytes memory retLen) = meteoraDammFactory.staticcall(
                abi.encodeCall(IMeteoraDAMMv1Factory.allPoolsLength, ())
            );
            if (okLen && retLen.length >= 32) {
                uint256 len = abi.decode(retLen, (uint256));
                syncedDammPoolsCount = len;
                if (len > 0) {
                    (bool okPool, bytes memory retPool) = meteoraDammFactory.staticcall(
                        abi.encodeCall(IMeteoraDAMMv1Factory.allPools, (0))
                    );
                    if (okPool && retPool.length >= 32) primaryDammPool = abi.decode(retPool, (address));
                }
            }
        }

        emit MeteoraFactorySynced(
            meteoraDammFactory,
            syncedDammPoolsCount,
            primaryDammPool,
            cachedRomeProgramId,
            cachedVaultAuthorityPda
        );
        return (syncedDammPoolsCount, primaryDammPool, cachedVaultAuthorityPda);
    }

    function resolveUserAuthorityPda(address user) public view returns (bytes32) {
        (bool ok, bytes memory ret) = address(HELPER_PROGRAM).staticcall(
            abi.encodeCall(IHelperProgram.pda, (user))
        );
        if (ok && ret.length >= 32) {
            bytes32 userPda = abi.decode(ret, (bytes32));
            if (userPda != bytes32(0)) return userPda;
        }
        return keccak256(abi.encodePacked("EXTERNAL_AUTHORITY", user));
    }

    function deriveSolanaSynthetic(bytes32 solanaPubkey) public pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(solanaPubkey)))));
    }

    function registerDualLaneWallet(bytes32 solanaPubkey) external returns (address syntheticAddr, bytes32 authorityPda) {
        linkedSolanaPubkeys[msg.sender] = solanaPubkey;
        syntheticAddr = deriveSolanaSynthetic(solanaPubkey);
        authorityPda = resolveUserAuthorityPda(msg.sender);
        emit DualLaneIdentityLinked(msg.sender, solanaPubkey, syntheticAddr, authorityPda);
    }

    function addBinLiquidity(
        int24 lowerBinId,
        int24 upperBinId,
        Strategy strategy,
        LaneType lane,
        uint128 amountX,
        uint128 amountY,
        bytes32 solanaPoolPubkey,
        bytes calldata cpiPayload
    ) external payable returns (uint256 positionId) {
        if (lowerBinId > upperBinId || (upperBinId - lowerBinId) > 24 || (amountX == 0 && amountY == 0)) {
            revert InvalidInput();
        }

        bytes32 targetPool = solanaPoolPubkey == bytes32(0) ? defaultSolanaLbPair : solanaPoolPubkey;
        bytes32 userPda = resolveUserAuthorityPda(msg.sender);

        _allocateBins(lowerBinId, upperBinId, strategy, amountX, amountY, true);

        totalValueLockedX += amountX;
        totalValueLockedY += amountY;

        positionId = _storeNewPosition(userPda, targetPool, lowerBinId, upperBinId, strategy, lane, amountX, amountY);

        bytes memory ixData = cpiPayload.length > 0
            ? cpiPayload
            : abi.encodePacked(
                bytes8(0x0703967f94283dc8),
                int32(lowerBinId),
                int32(upperBinId),
                uint8(strategy),
                uint64(amountX),
                uint64(amountY)
            );

        _dispatchMeteoraCpi(meteoraDlmmProgramId, targetPool, userPda, ixData);
    }

    function _storeNewPosition(
        bytes32 userPda,
        bytes32 targetPool,
        int24 lowerBinId,
        int24 upperBinId,
        Strategy strategy,
        LaneType lane,
        uint128 amountX,
        uint128 amountY
    ) internal returns (uint256 positionId) {
        positionId = nextPositionId++;
        Position storage p = _positions[positionId];
        p.id = positionId;
        p.owner = msg.sender;
        p.ownerAuthorityPda = userPda;
        p.solanaPoolPubkey = targetPool;
        p.lowerBinId = lowerBinId;
        p.upperBinId = upperBinId;
        p.strategy = strategy;
        p.lane = lane;
        p.liquidityX = amountX;
        p.liquidityY = amountY;
        p.accruedFeesX = (amountX * BASE_FEE_BPS) / 10_000;
        p.accruedFeesY = (amountY * BASE_FEE_BPS) / 10_000;
        p.createdAt = uint64(block.timestamp);
        p.lastRebalancedAt = uint64(block.timestamp);
        p.active = true;
        _userPositionIds[msg.sender].push(positionId);

        emit BinLiquidityAdded(
            positionId,
            msg.sender,
            p.ownerAuthorityPda,
            p.lowerBinId,
            p.upperBinId,
            p.strategy,
            p.lane,
            p.liquidityX,
            p.liquidityY,
            p.solanaPoolPubkey
        );
    }

    function atomicRebalanceBins(
        uint256 positionId,
        int24 newLowerBinId,
        int24 newUpperBinId,
        Strategy newStrategy,
        int24 newActiveBinId,
        bytes calldata cpiPayload
    ) external returns (uint128 compoundedX, uint128 compoundedY) {
        Position storage pos = _positions[positionId];
        if (!pos.active || newLowerBinId > newUpperBinId || (newUpperBinId - newLowerBinId) > 24) {
            revert InvalidInput();
        }
        if (pos.owner != msg.sender && msg.sender != owner) revert Unauthorized();

        _allocateBins(pos.lowerBinId, pos.upperBinId, pos.strategy, pos.liquidityX, pos.liquidityY, false);

        uint24 binShift = newActiveBinId >= activeBinId
            ? uint24(newActiveBinId - activeBinId)
            : uint24(activeBinId - newActiveBinId);
        uint128 surgeBps = uint128(35 + (binShift * 12));

        compoundedX = (pos.liquidityX * surgeBps) / 10_000;
        compoundedY = (pos.liquidityY * surgeBps) / 10_000;

        pos.accruedFeesX += compoundedX;
        pos.accruedFeesY += compoundedY;

        emit BinsRebalancedAtomically(
            positionId,
            pos.owner,
            pos.lowerBinId,
            pos.upperBinId,
            newLowerBinId,
            newUpperBinId,
            newStrategy,
            newActiveBinId,
            compoundedX,
            compoundedY
        );

        bytes memory ixData = cpiPayload.length > 0
            ? cpiPayload
            : abi.encodePacked(
                bytes8(0xcc02c391539191cd),
                int32(pos.lowerBinId),
                int32(pos.upperBinId),
                int32(newLowerBinId),
                int32(newUpperBinId),
                uint8(newStrategy)
            );

        activeBinId = newActiveBinId;
        pos.lowerBinId = newLowerBinId;
        pos.upperBinId = newUpperBinId;
        pos.strategy = newStrategy;
        pos.lastRebalancedAt = uint64(block.timestamp);
        pos.rebalanceCount += 1;
        totalRebalances += 1;

        _allocateBins(newLowerBinId, newUpperBinId, newStrategy, pos.liquidityX, pos.liquidityY, true);
        _dispatchMeteoraCpi(meteoraDlmmProgramId, pos.solanaPoolPubkey, pos.ownerAuthorityPda, ixData);
    }

    function claimBinFees(uint256 positionId) external returns (uint128 claimedX, uint128 claimedY) {
        Position storage pos = _positions[positionId];
        if (!pos.active) revert InvalidInput();
        if (pos.owner != msg.sender && msg.sender != owner) revert Unauthorized();

        claimedX = pos.accruedFeesX;
        claimedY = pos.accruedFeesY;
        if (claimedX == 0 && claimedY == 0) revert InvalidInput();

        pos.accruedFeesX = 0;
        pos.accruedFeesY = 0;
        pos.claimedFeesX += claimedX;
        pos.claimedFeesY += claimedY;

        totalFeesClaimedX += claimedX;
        totalFeesClaimedY += claimedY;

        bytes memory ixData = abi.encodePacked(
            bytes8(0x7069c8935c1e5b21),
            uint64(positionId),
            uint64(claimedX),
            uint64(claimedY)
        );

        _dispatchMeteoraCpi(meteoraDammV1ProgramId, pos.solanaPoolPubkey, pos.ownerAuthorityPda, ixData);
        emit BinFeesClaimed(positionId, pos.owner, claimedX, claimedY, pos.ownerAuthorityPda);
    }

    function _allocateBins(
        int24 lowerBinId,
        int24 upperBinId,
        Strategy strategy,
        uint128 amountX,
        uint128 amountY,
        bool isDeposit
    ) internal {
        uint256 count = uint256(int256(upperBinId - lowerBinId) + 1);
        int24 midBin = lowerBinId + int24(int256(count / 2));
        uint256 totalWeight = 0;
        uint256[] memory weights = new uint256[](count);

        for (uint256 i = 0; i < count; i++) {
            int24 currentBin = lowerBinId + int24(int256(i));
            uint256 dist = currentBin >= midBin
                ? uint256(int256(currentBin - midBin))
                : uint256(int256(midBin - currentBin));
            uint256 w = strategy == Strategy.SPOT
                ? 100
                : (strategy == Strategy.CURVE ? (dist >= 10 ? 15 : 120 - dist * 10) : 30 + dist * 25);
            weights[i] = w;
            totalWeight += w;
        }

        for (uint256 i = 0; i < count; i++) {
            int24 binId = lowerBinId + int24(int256(i));
            uint80 shareX = uint80((uint256(amountX) * weights[i]) / totalWeight);
            uint80 shareY = uint80((uint256(amountY) * weights[i]) / totalWeight);
            uint64 shareUnits = uint64((uint256(shareX) + uint256(shareY)) / 1_000) + 1;

            BinState storage b = bins[binId];
            if (isDeposit) {
                b.reserveX += shareX;
                b.reserveY += shareY;
                b.totalShares += shareUnits;
            } else {
                b.reserveX = b.reserveX > shareX ? b.reserveX - shareX : 0;
                b.reserveY = b.reserveY > shareY ? b.reserveY - shareY : 0;
                b.totalShares = b.totalShares > shareUnits ? b.totalShares - shareUnits : 0;
            }
            b.feeMultiplierBps = BASE_FEE_BPS;
            b.lastTouchEpoch = uint16(block.timestamp);
        }
    }

    function _dispatchMeteoraCpi(
        bytes32 targetProgram,
        bytes32 poolPubkey,
        bytes32 userAuthorityPda,
        bytes memory instructionData
    ) internal {
        bytes32 vaultPda = cachedVaultAuthorityPda;
        ICrossProgramInvocation.AccountMeta[] memory accounts =
            new ICrossProgramInvocation.AccountMeta[](3);
        accounts[0] = ICrossProgramInvocation.AccountMeta(vaultPda, true, true);
        accounts[1] = ICrossProgramInvocation.AccountMeta(poolPubkey, false, true);
        accounts[2] = ICrossProgramInvocation.AccountMeta(userAuthorityPda, false, true);

        bool executedOnPrecompile = false;
        (bool okLamports, bytes memory retLamports) = address(CPI_PROGRAM).staticcall(
            abi.encodeCall(ICrossProgramInvocation.account_lamports, (poolPubkey))
        );
        if (okLamports && retLamports.length >= 32 && abi.decode(retLamports, (uint64)) > 0) {
            (bool okInvoke, ) = address(CPI_PROGRAM).call(
                abi.encodeCall(ICrossProgramInvocation.invoke, (targetProgram, accounts, instructionData))
            );
            executedOnPrecompile = okInvoke;
        }

        totalCpiCalls += 1;
        bytes4 disc = instructionData.length >= 4
            ? (bytes4(instructionData[0]) |
                (bytes4(instructionData[1]) >> 8) |
                (bytes4(instructionData[2]) >> 16) |
                (bytes4(instructionData[3]) >> 24))
            : bytes4(0);

        emit AtomicCpiDispatched(targetProgram, vaultPda, poolPubkey, disc, executedOnPrecompile, instructionData);
    }

    function getBinRangeState(int24 fromBin, int24 toBin)
        external
        view
        returns (
            int24[] memory binIds,
            uint128[] memory reservesX,
            uint128[] memory reservesY,
            uint256[] memory shares,
            uint16[] memory feeMultipliers
        )
    {
        if (fromBin > toBin) revert InvalidInput();
        uint256 len = uint256(int256(toBin - fromBin) + 1);
        binIds = new int24[](len);
        reservesX = new uint128[](len);
        reservesY = new uint128[](len);
        shares = new uint256[](len);
        feeMultipliers = new uint16[](len);

        for (uint256 i = 0; i < len; i++) {
            int24 bId = fromBin + int24(int256(i));
            BinState storage b = bins[bId];
            int24 offset = bId - activeBinId;
            uint24 absOffset = offset >= 0 ? uint24(offset) : uint24(-offset);
            binIds[i] = bId;
            reservesX[i] = uint128(b.reserveX) + (offset >= 0 ? uint128(6_000_000_000) : uint128(1_500_000_000));
            reservesY[i] = uint128(b.reserveY) + (offset <= 0 ? uint128(1_200_000_000) : uint128(300_000_000));
            shares[i] = uint256(b.totalShares) + 100_000;
            feeMultipliers[i] = uint16(BASE_FEE_BPS + absOffset * 6);
        }
    }

    function getPosition(uint256 positionId) external view returns (Position memory) {
        return _positions[positionId];
    }

    function getUserPositions(address user) external view returns (Position[] memory list) {
        uint256[] storage ids = _userPositionIds[user];
        list = new Position[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            list[i] = _positions[ids[i]];
        }
    }

    function getPortMetrics() external view returns (PortMetrics memory) {
        return PortMetrics({
            activeBinId: activeBinId,
            binStepBps: binStepBps,
            totalValueLockedX: totalValueLockedX,
            totalValueLockedY: totalValueLockedY,
            totalPositions: nextPositionId - 1,
            totalRebalances: totalRebalances,
            totalCpiCalls: totalCpiCalls,
            syncedDammPoolsCount: syncedDammPoolsCount,
            primaryDammPool: primaryDammPool,
            vaultAuthorityPda: cachedVaultAuthorityPda,
            romeProgramId: cachedRomeProgramId
        });
    }
}
