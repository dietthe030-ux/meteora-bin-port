# 🏆 ROME ARENA — OFFICIAL SUBMISSION: BINPULSE

## 1. App Name
**BinPulse**

## 2. One Line
A dual-lane Meteora DLMM & DAMM liquidity port for EVM and Solana wallets

## 3. What Are You Building?
One concentrated liquidity vault, two kinds of wallet. Both EVM and Solana wallets supply liquidity to shared Meteora DAMM v1 and DLMM bin strategies (Spot, Curve, and Bid-Ask) through Rome Protocol. Position authorities are deterministically derived on-chain via Rome's `IHelperProgram` precompile (`0xff...09`), SPL account rent is calculated via `ISystemProgram` (`0xfF...07`), and bin liquidity deposits, atomic range rebalances, and fee claims are settled atomically via Rome's `ICrossProgramInvocation` precompile (`0xFF...08`) in a single Solana transaction.

## 4. What Kind of App Is It?
**Both** (EVM Smart Contract + Solana Program CPI Integration via Rome Precompiles)

## 5. Links
- **Website (Vercel Production)**: https://binpulse-meteora-dlmm-port.vercel.app
- **GitHub Repository**: https://github.com/dietthe030-ux/meteora-bin-port
- **X**: https://x.com/romeprotocol

## 6. On-Chain Verification & Milestone Links

### A. Rome Hadrian Testnet (`Chain ID: 200010`)
- **Contract Explorer (`MeteoraLiquidityPort.sol`)**:
  https://via-hadrian.testnet.romeprotocol.xyz/address/0xb11b05941a1c2480c38a0d75b662aa9bddceba9b
- **Deployment Transaction**:
  https://via-hadrian.testnet.romeprotocol.xyz/tx/0x2d37641574403eb54c0d76115e90f7b02e252e230a4c34ad00f1dc4149e1392e
  - *Solana L1 Settlement Signature*: `3QCQj9N7Ta3MDd9GnycgD7JWqxMbzgKthDbMx8eQvTN5GBbF7cBkpTxe8U6jwH51b4kfNRmcXRjQmQnNB5yQr991`
- **Canonical `MeteoraDAMMv1Factory` (Resolved from `@rome-protocol/registry`)**:
  https://via-hadrian.testnet.romeprotocol.xyz/address/0xd68b355f62643de0ec40243cba8f699f959ea3c4

### B. Used on Testnet (Multi-Wallet Activity & Real Transactions)
- **Contract Activity (Wallets & Txs)**:
  https://via-hadrian.testnet.romeprotocol.xyz/address/0xb11b05941a1c2480c38a0d75b662aa9bddceba9b
- **Participating Wallets (Randomly Selected from `wallets.txt`)**:
  - **Deployer**: `0x8581C4A532DD3f9B163b12809B1bD089f367147f`
  - **LP User 1**: `0xD56647bBa764c1b673299baaEB356569a37961b8` (Linked Solana Pubkey: `7aP6G83V114H7mUYQe9BwYEXjESu3ppyaByrRUgoM4rx`)
  - **LP User 2**: `0xd96CbB20f449eab7FAA2E9ca3B25c55d5BEcAfF6`
- **On-Chain Transactions**:
  1. **Tx 1 — `syncMeteoraFactory` (Deployer)**:
     https://via-hadrian.testnet.romeprotocol.xyz/tx/0xd168cf7520ef6ce7a78d5c04baa5337fe4c4dd15b2e90b63a9551e2b8454aff7
  2. **Tx 2 — `registerDualLaneWallet` (LP User 1)**:
     https://via-hadrian.testnet.romeprotocol.xyz/tx/0x36cdd63bca60c9e43e92c3a2f118b14e0c89b141b0d44b8936569524657243fd
  3. **Tx 3 — `addBinLiquidity` Curve Strategy (LP User 1)**:
     https://via-hadrian.testnet.romeprotocol.xyz/tx/0xeb53306f87c141f061045cbf9332bfbdbadb7e17df779821fab8cbd2bc20e46c
  4. **Tx 4 — `addBinLiquidity` Bid-Ask Strategy, Solana Synthetic Lane (LP User 2)**:
     https://via-hadrian.testnet.romeprotocol.xyz/tx/0x3c5c932765f082e8cfe5ec4971eb47f00f6fb9b10ee9a0d9799884e6afa0f8fe
  5. **Tx 5 — `addBinLiquidity` Spot Strategy (LP User 2)**:
     https://via-hadrian.testnet.romeprotocol.xyz/tx/0x1496022a2844656e9eb85dd0d41d847565001acaa7197966e4db1b2dc0659927
  6. **Tx 6 — `atomicRebalanceBins` via CPI `0xFF...08` (LP User 1)**:
     https://via-hadrian.testnet.romeprotocol.xyz/tx/0xdc22c8f3d637b5fe63e7fec2436e29819412b5d5ba89a707c1985ce98b2400f7
  7. **Tx 7 — `claimBinFees` via CPI `0xFF...08` (LP User 1)**:
     https://via-hadrian.testnet.romeprotocol.xyz/tx/0x84b545d453cc5bbae4eed6400919cb5f602458e749c35da660cc72c743f2580a

### C. Rubicon Mainnet (`Chain ID: 7531`) & Solana Mainnet CPI Integration
- **Rome Rubicon EVM Program (Solana Mainnet)**: `RomePq9X3iAoTr813HR7uRarafFDUJty6GdiEceYpzX` (https://solscan.io/account/RomePq9X3iAoTr813HR7uRarafFDUJty6GdiEceYpzX)
- **Meteora DLMM Program (Solana Mainnet CPI Target)**: `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo` (https://solscan.io/account/LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo)
- **Meteora DAMM v1 Program (Solana Mainnet CPI Target)**: `Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB` (https://solscan.io/account/Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB)
- **Rubicon Canonical `MeteoraDAMMv1Factory`**: `0x6333F246a9E293007E74D12f53976e7f0A45D218`
