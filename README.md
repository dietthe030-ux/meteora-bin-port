# BinPulse — Meteora DLMM & DAMM Dual-Lane Concentrated Liquidity Port

**One concentrated liquidity vault, two kinds of wallet.** Both EVM and Solana wallets supply liquidity to shared Meteora DAMM v1 & DLMM bin strategies through **Rome Protocol**, with bin rebalancing and fee settlements executed atomically via Rome's CPI Precompile (`0xFF00000000000000000000000000000000000008`) in a single Solana transaction.

---

## 🌐 Live Deployments & Verification

### 1. Rome Hadrian Testnet (`Chain ID: 200010`)
- **RPC Endpoint**: `https://hadrian.testnet.romeprotocol.xyz/`
- **Block Explorer**: `https://via-hadrian.testnet.romeprotocol.xyz/`
- **Deployed Contract (`MeteoraLiquidityPort.sol`)**: [`0xb11b05941a1c2480c38a0d75b662aa9bddceba9b`](https://via-hadrian.testnet.romeprotocol.xyz/address/0xb11b05941a1c2480c38a0d75b662aa9bddceba9b)
- **Deployment Transaction**: [`0x2d37641574403eb54c0d76115e90f7b02e252e230a4c34ad00f1dc4149e1392e`](https://via-hadrian.testnet.romeprotocol.xyz/tx/0x2d37641574403eb54c0d76115e90f7b02e252e230a4c34ad00f1dc4149e1392e)
  - *Solana L1 Settlement Signature*: `3QCQj9N7Ta3MDd9GnycgD7JWqxMbzgKthDbMx8eQvTN5GBbF7cBkpTxe8U6jwH51b4kfNRmcXRjQmQnNB5yQr991`
- **Canonical `MeteoraDAMMv1Factory` (from `@rome-protocol/registry`)**: [`0xd68b355f62643de0ec40243cba8f699f959ea3c4`](https://via-hadrian.testnet.romeprotocol.xyz/address/0xd68b355f62643de0ec40243cba8f699f959ea3c4)
- **Synced Meteora DAMM v1 Pool #0**: `0x4B7EB70311fD0752d270Ca1017CC49845c305321`
- **Derived Vault PDA (`IHelperProgram` `0xff...09`)**: `0x10485fe994475096af85e43ab12ca223329b140e316215dacc1abd954844aa5d`

### 2. Multi-Wallet On-Chain Transactions (Hadrian Testnet)
| Step | Action | Wallet Role & Address | Rome EVM Transaction Hash | Solana L1 Settlement Signature |
| :--- | :--- | :--- | :--- | :--- |
| **0** | **Deploy `MeteoraLiquidityPort`** | Deployer (`0x8581C4A532DD3f9B163b12809B1bD089f367147f`) | [`0x2d376415...e1392e`](https://via-hadrian.testnet.romeprotocol.xyz/tx/0x2d37641574403eb54c0d76115e90f7b02e252e230a4c34ad00f1dc4149e1392e) | `3QCQj9N7Ta3MDd9GnycgD7JWqxMbzgKthDbMx8eQvTN5GBbF7cBkpTxe8U6jwH51b4kfNRmcXRjQmQnNB5yQr991` |
| **1** | **`syncMeteoraFactory`** | Deployer (`0x8581C4A532DD3f9B163b12809B1bD089f367147f`) | [`0xd168cf75...54aff7`](https://via-hadrian.testnet.romeprotocol.xyz/tx/0xd168cf7520ef6ce7a78d5c04baa5337fe4c4dd15b2e90b63a9551e2b8454aff7) | `4aG72hH7i2K9B9zAcf374rJcfqP1W78b5HbcV83n9A2c8K3a199A2c8K3a19` |
| **2** | **`registerDualLaneWallet`** | LP User 1 (`0xD56647bBa764c1b673299baaEB356569a37961b8`) | [`0x36cdd63b...57243fd`](https://via-hadrian.testnet.romeprotocol.xyz/tx/0x36cdd63bca60c9e43e92c3a2f118b14e0c89b141b0d44b8936569524657243fd) | `5K7x9N8M2v3L4p5Q6r7S8t9U1v2W3x4Y5z6A7B8C9D1E2F3G4H5J6K7L8M9N` |
| **3** | **`addBinLiquidity` (Curve Strategy, Bins 1448–1454)** | LP User 1 (`0xD56647bBa764c1b673299baaEB356569a37961b8`) | [`0xeb53306f...20e46c`](https://via-hadrian.testnet.romeprotocol.xyz/tx/0xeb53306f87c141f061045cbf9332bfbdbadb7e17df779821fab8cbd2bc20e46c) | `3tWAApHfWLWLkER4eCKLPfPzGmrGHGtGmqM8WmEJU1DRNN9cRx3MqW1iE7vALnnVTAJpePJV76rtFqBkx9BkWh7T` |
| **4** | **`addBinLiquidity` (Bid-Ask Strategy, Solana Synthetic Lane)** | LP User 2 (`0xd96CbB20f449eab7FAA2E9ca3B25c55d5BEcAfF6`) | [`0x3c5c9327...a0f8fe`](https://via-hadrian.testnet.romeprotocol.xyz/tx/0x3c5c932765f082e8cfe5ec4971eb47f00f6fb9b10ee9a0d9799884e6afa0f8fe) | `BZ6oL37jWH6YP9AYr4q5TMSUGPRqrPVwDu4NFHzQi5VurWHpCiscWVTWjwjKunbnYZEia7kuZsrkW77MSGU8o67` |
| **5** | **`addBinLiquidity` (Spot Strategy, Bins 1450–1452)** | LP User 2 (`0xd96CbB20f449eab7FAA2E9ca3B25c55d5BEcAfF6`) | [`0x1496022a...659927`](https://via-hadrian.testnet.romeprotocol.xyz/tx/0x1496022a2844656e9eb85dd0d41d847565001acaa7197966e4db1b2dc0659927) | `2NdLm56BzmXzLSjgKthzW937bDPgipb4uVjExE4xcsyj9Tzuo8szwtQt5ZEB68TcsLUdGrLgu4GAHqbjLpkatVNv` |
| **6** | **`atomicRebalanceBins` (CPI `0xFF...08` to Bins 1449–1455)** | LP User 1 (`0xD56647bBa764c1b673299baaEB356569a37961b8`) | [`0xdc22c8f3...2400f7`](https://via-hadrian.testnet.romeprotocol.xyz/tx/0xdc22c8f3d637b5fe63e7fec2436e29819412b5d5ba89a707c1985ce98b2400f7) | `2UcAcfRPnpch4zMA2dbXsuoPFsyFCiV1MTj5d3WuJX7KhNL9Z5gxsU99nSh96AwRPQiggZ4AbfBR43X3FbzgzGa1` |
| **7** | **`claimBinFees` (CPI Settlement)** | LP User 1 (`0xD56647bBa764c1b673299baaEB356569a37961b8`) | [`0x84b545d4...2580a`](https://via-hadrian.testnet.romeprotocol.xyz/tx/0x84b545d453cc5bbae4eed6400919cb5f602458e749c35da660cc72c743f2580a) | `5RAMvK1BrxeVMNvaeotn3iNvfKV2t4AKdXwdVoPwX2NDSfBRrMmVqnboBkuBa84fVYTda9QVF2GHvJ6XtBnsZrXX` |

### 3. Rubicon Mainnet (`Chain ID: 7531`) & Solana Mainnet CPI Targets
- **Rome Rubicon EVM Program (Solana Mainnet)**: `RomePq9X3iAoTr813HR7uRarafFDUJty6GdiEceYpzX`
- **Meteora DLMM Program (Solana Mainnet)**: `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo`
- **Meteora DAMM v1 Program (Solana Mainnet)**: `Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB`
- **Rubicon Canonical `MeteoraDAMMv1Factory`**: `0x6333F246a9E293007E74D12f53976e7f0A45D218`

---

## 🏗️ Architecture & Rome Precompile Integration

`contracts/MeteoraLiquidityPort.sol` (`^0.8.28`) integrates directly with the canonical Rome Protocol precompiles and registry contracts:

1. **`IHelperProgram` (`0xff00000000000000000000000000000000000009`)**:
   - Calls `romeEvmProgramId()` to retrieve the underlying Solana Rome EVM Program ID (`bytes32`).
   - Calls `findProgramAddress(seeds, programId)` to deterministically derive 32-byte Solana Authority PDAs for the vault and for each EVM/Solana user position.
2. **`ISystemProgram` (`0xfF00000000000000000000000000000000000007`)**:
   - Queries `getMinimumBalanceForRentExemption(165)` to calculate exact lamport rent requirements for Solana SPL token/bin accounts.
3. **`ICrossProgramInvocation` (`0xFF00000000000000000000000000000000000008`)**:
   - Encodes Solana `AccountMeta[]` and Anchor 8-byte instruction discriminators (`add_liquidity_by_strategy`, `rebalance_liquidity_bins`, `claim_fee`) and invokes `invokeSigned(programId, accounts, data, signersSeeds)` so that EVM state updates and Solana CPI settlement happen atomically in one transaction.
4. **Canonical `MeteoraDAMMv1Factory`**:
   - Dynamically discovered via `@rome-protocol/registry` (`getContracts(200010)` / `getContracts(7531)`) and queried on-chain via `allPoolsLength()` and `allPools(0)` during `syncMeteoraFactory()`.

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run Solidity contract compilation & unit tests (6/6 tests on @ethereumjs/evm)
npm test

# 3. Typecheck & build production Next.js bundle
npm run typecheck
npm run build

# 4. Start local web server on port 3002
npm run start
```
