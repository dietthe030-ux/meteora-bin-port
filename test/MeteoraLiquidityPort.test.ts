import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll } from "vitest";
import { EVM } from "@ethereumjs/evm";
import { Address, Account, hexToBytes, bytesToHex } from "@ethereumjs/util";
import {
  encodeDeployData,
  encodeFunctionData,
  decodeFunctionResult,
  keccak256,
  encodePacked,
  type Abi,
} from "viem";
import { compileContracts } from "../scripts/compile";

describe("MeteoraLiquidityPort (BinPulse) — Unit Tests & Rome Precompile Suite", () => {
  let evm: EVM;
  let abi: Abi;
  let bytecode: `0x${string}`;
  let contractAddr: `0x${string}`;

  const deployer = "0x8581C4A532DD3f9B163b12809B1bD089f367147f" as const;
  const lpUser1 = "0xD56647bBa764c1b673299baaEB356569a37961b8" as const;
  const lpUser2 = "0xd96CbB20f449eab7FAA2E9ca3B25c55d5BEcAfF6" as const;
  const mockFactoryAddr = "0xd68b355f62643de0ec40243cba8f699f959ea3c4" as const;

  const meteoraDlmmProgramId =
    "0x04e9e12d9276138c4e581492f7b13d3f358380388182e2b5450342525124c9d3" as const;
  const meteoraDammV1ProgramId =
    "0x051f6d9a15c1377b4752a2b61a90c2f746b4292136513493a32419a7e4a8b301" as const;
  const defaultSolanaLbPair =
    "0x77112233445566778899aabbccddeeff00112233445566778899aabbccddeeff" as const;

  async function callView<T = unknown>(fnName: string, args: unknown[] = [], from: `0x${string}` = deployer): Promise<T> {
    const data = encodeFunctionData({ abi, functionName: fnName, args });
    const res = await evm.runCall({
      caller: new Address(hexToBytes(from)),
      to: new Address(hexToBytes(contractAddr)),
      data: hexToBytes(data),
      gasLimit: 15_000_000n,
    });
    if (res.execResult.exceptionError) {
      throw new Error(`View call ${fnName} reverted: ${res.execResult.exceptionError.error}`);
    }
    return decodeFunctionResult({
      abi,
      functionName: fnName,
      data: bytesToHex(res.execResult.returnValue),
    }) as T;
  }

  async function sendTx<T = unknown>(
    fnName: string,
    args: unknown[] = [],
    from: `0x${string}` = deployer,
    value = 0n
  ): Promise<{ decoded: T; logsCount: number }> {
    const data = encodeFunctionData({ abi, functionName: fnName, args });
    const res = await evm.runCall({
      caller: new Address(hexToBytes(from)),
      to: new Address(hexToBytes(contractAddr)),
      data: hexToBytes(data),
      value,
      gasLimit: 20_000_000n,
    });
    if (res.execResult.exceptionError) {
      throw new Error(`Tx ${fnName} reverted: ${res.execResult.exceptionError.error}`);
    }
    let decoded: unknown = undefined;
    if (res.execResult.returnValue.length > 0) {
      try {
        decoded = decodeFunctionResult({
          abi,
          functionName: fnName,
          data: bytesToHex(res.execResult.returnValue),
        });
      } catch {
        // void return
      }
    }
    return {
      decoded: decoded as T,
      logsCount: res.execResult.logs?.length ?? 0,
    };
  }

  beforeAll(async () => {
    const artifactPath = path.join(process.cwd(), "artifacts", "MeteoraLiquidityPort.json");
    const artifact = fs.existsSync(artifactPath)
      ? JSON.parse(fs.readFileSync(artifactPath, "utf8"))
      : compileContracts();
    abi = artifact.abi as Abi;
    bytecode = artifact.bytecode as `0x${string}`;

    evm = await EVM.create();

    // Fund accounts in EVM state
    for (const addr of [deployer, lpUser1, lpUser2]) {
      const addressObj = new Address(hexToBytes(addr));
      await evm.stateManager.putAccount(
        addressObj,
        Account.fromAccountData({ nonce: 0n, balance: 100_000_000_000_000_000_000n })
      );
    }

    // Deploy MeteoraLiquidityPort
    const deployData = encodeDeployData({
      abi,
      bytecode,
      args: [
        mockFactoryAddr,
        meteoraDlmmProgramId,
        meteoraDammV1ProgramId,
        defaultSolanaLbPair,
        1450, // Active Bin ID (center SOL/USDC price bin)
        20,   // 20 bps bin step
      ],
    });

    const deployRes = await evm.runCall({
      caller: new Address(hexToBytes(deployer)),
      data: hexToBytes(deployData),
      gasLimit: 25_000_000n,
    });

    if (deployRes.execResult.exceptionError || !deployRes.createdAddress) {
      throw new Error(`Contract deploy failed: ${deployRes.execResult.exceptionError?.error}`);
    }

    contractAddr = deployRes.createdAddress.toString() as `0x${string}`;
  });

  it("initializes port metrics, active bin reserves, and Rome precompile fallbacks", async () => {
    const metrics = await callView<{
      activeBinId: number;
      binStepBps: number;
      totalValueLockedX: bigint;
      totalValueLockedY: bigint;
      totalPositions: bigint;
      totalRebalances: bigint;
      totalCpiCalls: bigint;
      vaultAuthorityPda: `0x${string}`;
      romeProgramId: `0x${string}`;
    }>("getPortMetrics");

    expect(Number(metrics.activeBinId)).toBe(1450);
    expect(Number(metrics.binStepBps)).toBe(20);
    expect(metrics.totalPositions).toBe(0n);
    expect(metrics.vaultAuthorityPda).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(metrics.romeProgramId).toMatch(/^0x[0-9a-fA-F]{64}$/);

    // Verify seeded bins [-5..+5] around 1450
    const range = await callView<[number[], bigint[], bigint[], bigint[], number[]]>(
      "getBinRangeState",
      [1445, 1455]
    );
    expect(range[0].length).toBe(11);
    expect(range[1][5]).toBeGreaterThan(0n); // Active bin X reserve
    expect(range[2][5]).toBeGreaterThan(0n); // Active bin Y reserve
  });

  it("derives Solana synthetic EVM addresses matching Rome SDK keccak256(pubkey)[12:]", async () => {
    const sampleSolanaPubkey =
      "0x11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff" as const;
    const expectedHash = keccak256(encodePacked(["bytes32"], [sampleSolanaPubkey]));
    const expectedSynthetic = `0x${expectedHash.slice(-40)}`.toLowerCase();

    const onChainSynthetic = await callView<`0x${string}`>("deriveSolanaSynthetic", [
      sampleSolanaPubkey,
    ]);
    expect(onChainSynthetic.toLowerCase()).toBe(expectedSynthetic);

    // Link dual-lane wallet for LP User 1
    const linkRes = await sendTx<[string, string]>(
      "registerDualLaneWallet",
      [sampleSolanaPubkey],
      lpUser1
    );
    expect(linkRes.decoded[0].toLowerCase()).toBe(expectedSynthetic);
    expect(linkRes.logsCount).toBe(1);
  });

  it("adds concentrated bin liquidity across SPOT, CURVE, and BID_ASK strategies for both EVM & Solana lanes", async () => {
    // 1. LP User 1 adds CURVE (1) liquidity on EVM lane (0)
    const tx1 = await sendTx<bigint>(
      "addBinLiquidity",
      [
        1448, // lowerBinId (-2)
        1452, // upperBinId (+2)
        1,    // Strategy.CURVE
        0,    // LaneType.EVM
        5_000_000_000n, // 5 SOL (9 decimals)
        750_000_000n,   // 750 USDC (6 decimals)
        defaultSolanaLbPair,
        "0x",
      ],
      lpUser1
    );
    expect(tx1.decoded).toBe(1n);
    expect(tx1.logsCount).toBe(2); // AtomicCpiDispatched + BinLiquidityAdded

    // 2. LP User 2 adds BID_ASK (2) liquidity on SOLANA_SYNTHETIC lane (1)
    const tx2 = await sendTx<bigint>(
      "addBinLiquidity",
      [
        1447, // lowerBinId (-3)
        1453, // upperBinId (+3)
        2,    // Strategy.BID_ASK
        1,    // LaneType.SOLANA_SYNTHETIC
        8_000_000_000n,
        1_200_000_000n,
        defaultSolanaLbPair,
        "0x",
      ],
      lpUser2
    );
    expect(tx2.decoded).toBe(2n);

    // Verify user positions and TVL
    const user1Positions = await callView<Array<{ id: bigint; strategy: number; liquidityX: bigint }>>(
      "getUserPositions",
      [lpUser1]
    );
    expect(user1Positions.length).toBe(1);
    expect(user1Positions[0].id).toBe(1n);
    expect(Number(user1Positions[0].strategy)).toBe(1);

    const metrics = await callView<{
      totalValueLockedX: bigint;
      totalValueLockedY: bigint;
      totalPositions: bigint;
      totalCpiCalls: bigint;
    }>("getPortMetrics");
    expect(metrics.totalValueLockedX).toBe(13_000_000_000n);
    expect(metrics.totalValueLockedY).toBe(1_950_000_000n);
    expect(metrics.totalPositions).toBe(2n);
    expect(metrics.totalCpiCalls).toBe(2n);
  });

  it("atomically rebalances price bins, shifts strategy, and compounds surge fees via CPI", async () => {
    const rebalRes = await sendTx<[bigint, bigint]>(
      "atomicRebalanceBins",
      [
        1n,   // positionId
        1449, // newLowerBinId
        1454, // newUpperBinId
        0,    // newStrategy: Strategy.SPOT
        1451, // newActiveBinId (+1 shift)
        "0x",
      ],
      lpUser1
    );

    expect(rebalRes.decoded[0]).toBeGreaterThan(0n); // compoundedFeeX
    expect(rebalRes.decoded[1]).toBeGreaterThan(0n); // compoundedFeeY
    expect(rebalRes.logsCount).toBe(2); // AtomicCpiDispatched + BinsRebalancedAtomically

    const metrics = await callView<{
      activeBinId: number;
      totalRebalances: bigint;
      totalCpiCalls: bigint;
    }>("getPortMetrics");
    expect(Number(metrics.activeBinId)).toBe(1451);
    expect(metrics.totalRebalances).toBe(1n);
    expect(metrics.totalCpiCalls).toBe(3n);
  });

  it("claims accrued dynamic DLMM & DAMM v1 fees and updates claimed totals", async () => {
    const claimRes = await sendTx<[bigint, bigint]>("claimBinFees", [1n], lpUser1);
    expect(claimRes.decoded[0]).toBeGreaterThan(0n);
    expect(claimRes.decoded[1]).toBeGreaterThan(0n);

    // Second immediate claim should revert with NoFeesToClaim
    await expect(sendTx("claimBinFees", [1n], lpUser1)).rejects.toThrow();
  });

  it("enforces bin range and ownership guards", async () => {
    // Lower > Upper should revert
    await expect(
      sendTx(
        "addBinLiquidity",
        [1455, 1445, 0, 0, 1000n, 1000n, defaultSolanaLbPair, "0x"],
        lpUser1
      )
    ).rejects.toThrow();

    // Non-owner attempting to rebalance LP User 1's position should revert
    await expect(
      sendTx("atomicRebalanceBins", [1n, 1448, 1452, 0, 1450, "0x"], lpUser2)
    ).rejects.toThrow();
  });
});
