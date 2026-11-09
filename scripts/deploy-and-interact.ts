import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  type Hex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getChain, getContracts, getTokens, getPrograms } from "@rome-protocol/registry";
import { submitRomeTx, pubkeyToBytes32 } from "@rome-protocol/sdk";
import { Keypair } from "@solana/web3.js";

dotenv.config();

/** Build an EIP-1193 provider from a viem local PrivateKeyAccount for submitRomeTx */
function createEip1193Provider(account: ReturnType<typeof privateKeyToAccount>, rpcUrl: string, chainId: number) {
  const pub = createPublicClient({ transport: http(rpcUrl) });
  const wallet = createWalletClient({ account, transport: http(rpcUrl) });

  return {
    async request({ method, params = [] }: { method: string; params?: unknown[] }): Promise<unknown> {
      if (method === "eth_chainId") return `0x${chainId.toString(16)}`;
      if (method === "eth_accounts" || method === "eth_requestAccounts") return [account.address];
      if (method === "eth_sendTransaction") {
        const tx = (params[0] ?? {}) as Record<string, Hex | undefined>;
        const to = tx.to as Address | undefined;
        const data = tx.data;
        const value = tx.value ? BigInt(tx.value) : 0n;
        const gas = tx.gas ? BigInt(tx.gas) : 5_000_000n;
        const maxFeePerGas = tx.maxFeePerGas ? BigInt(tx.maxFeePerGas) : undefined;
        const maxPriorityFeePerGas = tx.maxPriorityFeePerGas ? BigInt(tx.maxPriorityFeePerGas) : 0n;

        return wallet.sendTransaction({
          account,
          to,
          data,
          value,
          gas,
          maxFeePerGas,
          maxPriorityFeePerGas,
          chain: {
            id: chainId,
            name: `rome-${chainId}`,
            nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
            rpcUrls: { default: { http: [rpcUrl] } },
          },
        });
      }
      // Forward all other JSON-RPC calls (eth_estimateGas, eth_gasPrice, eth_getBlockByNumber, etc.)
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const json = (await res.json()) as { result?: unknown; error?: { message?: string } };
      if (json.error) throw new Error(json.error.message ?? "RPC Error");
      return json.result;
    },
  };
}

async function resolveSolanaSettlement(rpcUrl: string, evmTxHash: string): Promise<string | null> {
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "rome_solanaTxForEvmTx",
        params: [evmTxHash],
      }),
    });
    const json = (await res.json()) as { result?: string | string[] | { signature?: string } };
    if (Array.isArray(json.result)) return json.result[0] ?? null;
    if (typeof json.result === "string") return json.result;
    if (json.result && typeof json.result === "object" && json.result.signature) {
      return json.result.signature;
    }
    return null;
  } catch {
    return null;
  }
}

async function main() {
  // 1. Dynamically resolve Hadrian & Solana Devnet facts from @rome-protocol/registry
  const hadrianChain = getChain(200010) as {
    chainId: number;
    name: string;
    rpcUrl: string;
    explorerUrl: string;
    romeEvmProgramId: string;
  };
  const rawContracts = getContracts(200010) as unknown;
  const contractsList = (
    Array.isArray(rawContracts)
      ? rawContracts
      : ((rawContracts as { contracts?: unknown[] })?.contracts ?? [])
  ) as Array<{ name: string; versions: Array<{ address: string; version: string; status: string }> }>;

  const rawTokens = getTokens(200010) as unknown;
  const tokensList = (
    Array.isArray(rawTokens)
      ? rawTokens
      : ((rawTokens as { tokens?: unknown[] })?.tokens ?? [])
  ) as Array<{ address: string; symbol: string; name: string; decimals: number; mintId?: string }>;

  const devnetPrograms = (getPrograms("devnet") ?? {}) as Record<string, string>;
  const mainnetPrograms = (getPrograms("mainnet") ?? {}) as Record<string, string>;

  const meteoraFactoryEntry = contractsList.find((c) => c.name === "MeteoraDAMMv1Factory");
  const liveFactoryAddr = (meteoraFactoryEntry?.versions.find((v) => v.status === "live")?.address ??
    "0xd68b355f62643de0ec40243cba8f699f959ea3c4") as Address;

  const meteoraDlmmBase58 = devnetPrograms.meteoraDlmm ?? "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo";
  const meteoraDammV1Base58 = devnetPrograms.meteoraDammV1 ?? "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB";
  const meteoraDammV2Base58 = devnetPrograms.meteoraDammV2 ?? "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG";

  const meteoraDlmmBytes32 = pubkeyToBytes32(meteoraDlmmBase58) as Hex;
  const meteoraDammV1Bytes32 = pubkeyToBytes32(meteoraDammV1Base58) as Hex;

  // Deterministic Solana LB Pair pubkey for SOL/USDC DLMM Pool
  const lbPairKeypair = Keypair.fromSeed(
    new Uint8Array(Buffer.from("binpulse-meteora-dlmm-sol-usdc-1"))
  );
  const defaultSolanaLbPairBase58 = lbPairKeypair.publicKey.toBase58();
  const defaultSolanaLbPairBytes32 = pubkeyToBytes32(defaultSolanaLbPairBase58) as Hex;

  console.log("=== Resolved from @rome-protocol/registry ===");
  console.log("Chain:", hadrianChain.name, `(${hadrianChain.chainId})`);
  console.log("RPC:", hadrianChain.rpcUrl);
  console.log("Rome EVM Program:", hadrianChain.romeEvmProgramId);
  console.log("MeteoraDAMMv1Factory:", liveFactoryAddr);
  console.log("Solana Meteora DLMM Program:", meteoraDlmmBase58, "->", meteoraDlmmBytes32);
  console.log("Solana Meteora DAMM v1 Program:", meteoraDammV1Base58, "->", meteoraDammV1Bytes32);

  // 2. Load 3 Random Wallets from .env
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY as Hex;
  const lpUser1Key = process.env.LP_USER1_PRIVATE_KEY as Hex;
  const lpUser2Key = process.env.LP_USER2_PRIVATE_KEY as Hex;

  if (!deployerKey || !lpUser1Key || !lpUser2Key) {
    throw new Error("Missing private keys in .env");
  }

  const deployerAccount = privateKeyToAccount(deployerKey);
  const lpUser1Account = privateKeyToAccount(lpUser1Key);
  const lpUser2Account = privateKeyToAccount(lpUser2Key);

  console.log("\n=== Active Wallets ===");
  console.log("Deployer :", deployerAccount.address);
  console.log("LP User 1:", lpUser1Account.address);
  console.log("LP User 2:", lpUser2Account.address);

  const pub = createPublicClient({ transport: http(hadrianChain.rpcUrl) });
  const deployerWallet = createWalletClient({
    account: deployerAccount,
    transport: http(hadrianChain.rpcUrl),
  });
  const lpUser2Wallet = createWalletClient({
    account: lpUser2Account,
    transport: http(hadrianChain.rpcUrl),
  });

  // Ensure Deployer has >= 16 USDC for contract deployment + factory sync
  const deployerBal = await pub.getBalance({ address: deployerAccount.address });
  console.log("Deployer initial balance (wei):", deployerBal.toString());
  if (deployerBal < 15_500_000_000_000_000_000n) {
    console.log("Topping up Deployer with 6.5 USDC from LP User 2...");
    const gp0 = await pub.getGasPrice();
    const topupHash = await lpUser2Wallet.sendTransaction({
      account: lpUser2Account,
      to: deployerAccount.address,
      value: 6_500_000_000_000_000_000n,
      gas: 2_000_000n,
      maxFeePerGas: (gp0 * 12n) / 10n,
      maxPriorityFeePerGas: 0n,
      chain: null,
    });
    await pub.waitForTransactionReceipt({ hash: topupHash });
    console.log("Top-up complete:", topupHash);
  }

  // 3. Load compiled artifact
  const artifactPath = path.join(process.cwd(), "artifacts", "MeteoraLiquidityPort.json");
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const abi = artifact.abi;
  const bytecode = artifact.bytecode as Hex;

  // 4. Deploy MeteoraLiquidityPort on Hadrian (200010)
  console.log("\n[1/7] Deploying MeteoraLiquidityPort.sol to Hadrian Testnet (200010)...");
  const gasPrice = await pub.getGasPrice();
  const deployTxHash = await deployerWallet.deployContract({
    abi,
    bytecode,
    args: [
      liveFactoryAddr,
      meteoraDlmmBytes32,
      meteoraDammV1Bytes32,
      defaultSolanaLbPairBytes32,
      1450, // Active Bin ID ($145.00 SOL/USDC equivalent)
      20,   // 20 bps bin step
    ],
    chain: null,
    gas: 75_000_000n,
    maxFeePerGas: (gasPrice * 11n) / 10n,
    maxPriorityFeePerGas: 0n,
  });

  console.log("Deploy Tx Hash:", deployTxHash);
  const deployReceipt = await pub.waitForTransactionReceipt({ hash: deployTxHash });
  const contractAddress = deployReceipt.contractAddress as Address;
  const deploySolanaSig = await resolveSolanaSettlement(hadrianChain.rpcUrl, deployTxHash);
  console.log("Deployed MeteoraLiquidityPort at:", contractAddress);
  console.log("Deploy Solana Settlement Sig:", deploySolanaSig);

  const deployerProvider = createEip1193Provider(deployerAccount, hadrianChain.rpcUrl, hadrianChain.chainId);
  const lpUser1Provider = createEip1193Provider(lpUser1Account, hadrianChain.rpcUrl, hadrianChain.chainId);
  const lpUser2Provider = createEip1193Provider(lpUser2Account, hadrianChain.rpcUrl, hadrianChain.chainId);

  const txRecords: Array<{
    step: number;
    label: string;
    functionName: string;
    walletRole: string;
    sender: string;
    lane: "EVM" | "Solana Synthetic";
    strategy?: string;
    binRange?: string;
    txHash: string;
    explorerUrl: string;
    solanaSig: string | null;
    timestamp: string;
  }> = [];

  async function executeWrite(
    step: number,
    label: string,
    walletRole: string,
    account: ReturnType<typeof privateKeyToAccount>,
    provider: ReturnType<typeof createEip1193Provider>,
    functionName: string,
    args: unknown[],
    lane: "EVM" | "Solana Synthetic",
    strategy?: string,
    binRange?: string
  ) {
    console.log(`\n[${step}/8] ${label} (${walletRole}: ${account.address})...`);
    const data = encodeFunctionData({ abi, functionName, args });
    const txHash = (await submitRomeTx(provider, {
      from: account.address,
      to: contractAddress,
      data,
    })) as Hex;
    const rcpt = await pub.waitForTransactionReceipt({ hash: txHash });
    const solanaSig = await resolveSolanaSettlement(hadrianChain.rpcUrl, txHash);
    console.log(`  -> Tx Hash: ${txHash} (status: ${rcpt.status})`);
    if (solanaSig) console.log(`  -> Solana L1 Settlement: ${solanaSig}`);

    txRecords.push({
      step,
      label,
      functionName,
      walletRole,
      sender: account.address,
      lane,
      strategy,
      binRange,
      txHash,
      explorerUrl: `${hadrianChain.explorerUrl.replace(/\/$/, "")}/tx/${txHash}`,
      solanaSig,
      timestamp: new Date().toISOString(),
    });
    return txHash;
  }

  // 5. Execute Real Multi-Wallet Transactions on Hadrian
  // Tx 1: Sync MeteoraDAMMv1Factory & Rome Precompiles (0xFF...07, 0xFF...09)
  await executeWrite(
    2,
    "Sync MeteoraDAMMv1Factory & Rome Precompiles (0xFF...07 / 0xFF...09)",
    "Deployer",
    deployerAccount,
    deployerProvider,
    "syncMeteoraFactory",
    [],
    "EVM",
    "Factory & PDA Sync",
    "Pool #0 Synced"
  );

  // Tx 2: LP User 1 links Dual-Lane Solana Wallet Identity
  const user1SolanaKeypair = Keypair.fromSeed(
    new Uint8Array(Buffer.from("binpulse-lp-user-1-solana-wallet"))
  );
  const user1SolanaBytes32 = pubkeyToBytes32(user1SolanaKeypair.publicKey.toBase58());
  await executeWrite(
    3,
    "Link Dual-Lane Solana Wallet Identity (keccak256 synthetic)",
    "LP User 1",
    lpUser1Account,
    lpUser1Provider,
    "registerDualLaneWallet",
    [user1SolanaBytes32],
    "Solana Synthetic",
    "Dual-Lane Parity",
    "Solana -> EVM Synthetic"
  );

  // Tx 3: LP User 1 Adds Concentrated Bin Liquidity (CURVE Strategy, Bins 1449..1451)
  await executeWrite(
    4,
    "Add Concentrated Bin Liquidity (CURVE Strategy — 5.0 SOL + 750 USDC)",
    "LP User 1",
    lpUser1Account,
    lpUser1Provider,
    "addBinLiquidity",
    [
      1449,
      1451,
      1, // Strategy.CURVE
      0, // LaneType.EVM
      5_000_000_000n,
      750_000_000n,
      defaultSolanaLbPairBytes32,
      "0x",
    ],
    "EVM",
    "Curve (Gaussian Bell)",
    "1449 – 1451"
  );

  // Tx 4: LP User 2 Adds Concentrated Bin Liquidity (BID-ASK Strategy, Bins 1448..1450, Solana Synthetic Lane)
  await executeWrite(
    5,
    "Add Concentrated Bin Liquidity (BID-ASK Strategy — 8.5 SOL + 1,250 USDC)",
    "LP User 2",
    lpUser2Account,
    lpUser2Provider,
    "addBinLiquidity",
    [
      1448,
      1450,
      2, // Strategy.BID_ASK
      1, // LaneType.SOLANA_SYNTHETIC
      8_500_000_000n,
      1_250_000_000n,
      defaultSolanaLbPairBytes32,
      "0x",
    ],
    "Solana Synthetic",
    "Bid-Ask (Volatility Edge)",
    "1448 – 1450"
  );

  // Tx 5: LP User 2 Adds Concentrated Bin Liquidity (SPOT Strategy, Bins 1450..1452, EVM Lane)
  await executeWrite(
    6,
    "Add Concentrated Bin Liquidity (SPOT Strategy — 4.2 SOL + 620 USDC)",
    "LP User 2",
    lpUser2Account,
    lpUser2Provider,
    "addBinLiquidity",
    [
      1450,
      1452,
      0, // Strategy.SPOT
      0, // LaneType.EVM
      4_200_000_000n,
      620_000_000n,
      defaultSolanaLbPairBytes32,
      "0x",
    ],
    "EVM",
    "Spot (Uniform)",
    "1450 – 1452"
  );

  // Tx 6: LP User 1 Executes Atomic Rebalance Bins via CPI (0xFF...08)
  await executeWrite(
    7,
    "Atomic Rebalance Bins & Compound Surge Fees via CPI (0xFF...08)",
    "LP User 1",
    lpUser1Account,
    lpUser1Provider,
    "atomicRebalanceBins",
    [
      1n,   // positionId #1
      1450, // newLowerBinId
      1452, // newUpperBinId
      0,    // shift to Strategy.SPOT
      1451, // shift active bin to 1451
      "0x",
    ],
    "EVM",
    "Rebalance: Curve -> Spot",
    "1450 – 1452 (Active: 1451)"
  );

  // Tx 7: LP User 1 Claims Accrued DLMM + DAMM v1 Fees via CPI
  await executeWrite(
    8,
    "Claim Dynamic DLMM & DAMM v1 Bin Fees via CPI",
    "LP User 1",
    lpUser1Account,
    lpUser1Provider,
    "claimBinFees",
    [1n],
    "EVM",
    "Dynamic Fee Harvest",
    "Position #1"
  );

  // 6. Read back live on-chain PortMetrics from Hadrian
  const onChainMetrics = (await pub.readContract({
    address: contractAddress,
    abi,
    functionName: "getPortMetrics",
  })) as {
    activeBinId: number;
    binStepBps: number;
    totalValueLockedX: bigint;
    totalValueLockedY: bigint;
    totalPositions: bigint;
    totalRebalances: bigint;
    totalCpiCalls: bigint;
    syncedDammPoolsCount: bigint;
    primaryDammPool: string;
    vaultAuthorityPda: string;
    romeProgramId: string;
  };

  console.log("\n=== On-Chain PortMetrics Verified on Hadrian ===");
  console.log("Active Bin ID:", onChainMetrics.activeBinId);
  console.log("Total Positions:", onChainMetrics.totalPositions.toString());
  console.log("Total Rebalances:", onChainMetrics.totalRebalances.toString());
  console.log("Total Atomic CPI Calls:", onChainMetrics.totalCpiCalls.toString());
  console.log("Synced Meteora DAMM v1 Pools:", onChainMetrics.syncedDammPoolsCount.toString());
  console.log("Primary DAMM Pool:", onChainMetrics.primaryDammPool);
  console.log("Vault Authority PDA (0xFF...09):", onChainMetrics.vaultAuthorityPda);
  console.log("Rome EVM Program ID (0xFF...07):", onChainMetrics.romeProgramId);

  // 7. Save full deployment & transaction manifest for the Next.js Web App
  const deploymentManifest = {
    appName: "BinPulse",
    deployedAt: new Date().toISOString(),
    hadrian: {
      chainId: hadrianChain.chainId,
      name: hadrianChain.name,
      rpcUrl: hadrianChain.rpcUrl,
      explorerUrl: hadrianChain.explorerUrl.replace(/\/$/, ""),
      romeEvmProgramId: hadrianChain.romeEvmProgramId,
      contractAddress,
      contractExplorerUrl: `${hadrianChain.explorerUrl.replace(/\/$/, "")}/address/${contractAddress}`,
      deployTxHash,
      deployTxExplorerUrl: `${hadrianChain.explorerUrl.replace(/\/$/, "")}/tx/${deployTxHash}`,
      deploySolanaSig,
      meteoraDammFactory: liveFactoryAddr,
      primaryDammPool: onChainMetrics.primaryDammPool,
      syncedDammPoolsCount: Number(onChainMetrics.syncedDammPoolsCount),
      vaultAuthorityPda: onChainMetrics.vaultAuthorityPda,
      romeProgramIdBytes32: onChainMetrics.romeProgramId,
      tokens: tokensList,
    },
    rubiconMainnet: {
      chainId: 7531,
      name: "Rome Rubicon Mainnet",
      rpcUrl: "https://rubicon.mainnet.romeprotocol.xyz/",
      explorerUrl: "https://via.mainnet.romeprotocol.xyz",
      romeEvmProgramId: "RomePq9X3iAoTr813HR7uRarafFDUJty6GdiEceYpzX",
      solanaMeteoraDlmmProgramId: mainnetPrograms.meteoraDlmm ?? meteoraDlmmBase58,
      solanaMeteoraDammV1ProgramId: mainnetPrograms.meteoraDammV1 ?? meteoraDammV1Base58,
      solanaMeteoraDammV2ProgramId: mainnetPrograms.meteoraDammV2 ?? meteoraDammV2Base58,
      precompiles: {
        system: "0xfF00000000000000000000000000000000000007",
        cpi: "0xFF00000000000000000000000000000000000008",
        helper: "0xff00000000000000000000000000000000000009",
      },
    },
    solanaPrograms: {
      meteoraDlmm: meteoraDlmmBase58,
      meteoraDlmmBytes32,
      meteoraDammV1: meteoraDammV1Base58,
      meteoraDammV1Bytes32,
      meteoraDammV2: meteoraDammV2Base58,
      defaultSolanaLbPair: defaultSolanaLbPairBase58,
      defaultSolanaLbPairBytes32,
    },
    wallets: {
      deployer: deployerAccount.address,
      lpUser1: lpUser1Account.address,
      lpUser2: lpUser2Account.address,
      lpUser1LinkedSolanaPubkey: user1SolanaKeypair.publicKey.toBase58(),
    },
    transactions: txRecords,
  };

  const manifestPath = path.join(process.cwd(), "src", "lib", "deployment.json");
  fs.writeFileSync(manifestPath, JSON.stringify(deploymentManifest, null, 2));
  console.log(`\nSaved deployment manifest -> ${manifestPath}`);
}

main().catch((err) => {
  console.error("Deployment script failed:", err);
  process.exit(1);
});
