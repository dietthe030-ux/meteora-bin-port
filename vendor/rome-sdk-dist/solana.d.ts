/**
 * @rome-protocol/sdk — the **Solana lane** (v1.1): the mirror of `submitRomeTx`.
 *
 * Let a **Solana wallet drive an EVM contract on Rome**, with no Ethereum key.
 * A Solana-native user's EVM identity is their SYNTHETIC ADDRESS
 * (`keccak256(pubkey)[12:]`), where their balance + nonce live. A `DoTxUnsigned`
 * Solana instruction carries an unsigned EIP-1559 RLP payload; the Solana signer
 * (the tx fee-payer) authorizes it, and the program derives `from` from that
 * signer — no ECDSA signature.
 *
 * `submitRomeTxSolanaLane(deps, call)` is the one-call path (mirrors
 * `submitRomeTx`): size nonce + fees → discover accounts → assemble → wallet
 * signs → submit to the Solana RPC → confirm.
 *
 * It handles two requirements that are NOT in the prose docs and that a
 * hand-built `DoTxUnsigned` will fault without:
 *  - **ComputeBudget** — Rome's EVM needs a raised CU limit (~1.35M) AND a large
 *    heap frame (250 KB); Solana's 200K-CU / 32-KB defaults fault.
 *  - **Treasure wallet** — execution pays a per-chain treasure PDA ~5000
 *    lamports; account discovery (`eth_estimateGas`) omits it, so it's appended.
 */
import { Connection, PublicKey, Transaction, TransactionInstruction, type AccountMeta } from "@solana/web3.js";
import { type Hex } from "viem";
export type SolanaPubkeyInput = Uint8Array | PublicKey | string;
/**
 * Synthetic EVM address for a Solana pubkey — `keccak256(pubkey)[12:]`. The EVM
 * identity (balance + nonce) a Solana-native user controls on Rome.
 * Byte-identical to the on-chain `do_tx_unsigned::derive_sender`.
 */
export declare function syntheticAddress(pubkey: SolanaPubkeyInput): Hex;
export interface UnsignedEip1559 {
    chainId: number | bigint;
    nonce: number | bigint;
    maxPriorityFeePerGas: bigint;
    maxFeePerGas: bigint;
    gasLimit: bigint;
    /** undefined = contract creation */
    to?: Hex;
    value?: bigint;
    data?: Hex;
}
/**
 * Bare RLP-encoded unsigned EIP-1559 payload the Rome program decodes inside a
 * `DoTxUnsigned` instruction: the 9-item list, with viem's leading `0x02` type
 * byte removed (the on-chain decoder wants the bare list, not the typed
 * envelope). No signature — the Solana signer authorizes.
 */
export declare function buildUnsignedEip1559Rlp(tx: UnsignedEip1559): Hex;
/**
 * The `DoTxUnsigned` Solana instruction: `data = [tag(17), ...unsignedRlp]`,
 * `keys = accounts` (the list from {@link emulateCallAccounts}; order +
 * signer/writable flags are authoritative and passed through unchanged).
 */
export declare function buildDoTxUnsigned(params: {
    programId: PublicKey | string;
    unsignedRlp: Hex;
    accounts: AccountMeta[];
}): TransactionInstruction;
/** Shape the proxy returns per account (`rome_emulateCallAccounts`, snake_case). */
export interface RawAccountMetaB58 {
    pubkey: string;
    is_signer: boolean;
    is_writable: boolean;
}
export declare function toAccountMeta(raw: RawAccountMetaB58): AccountMeta;
export interface DiscoveryCall {
    from: Hex;
    to: Hex;
    data?: Hex;
    value?: Hex;
}
/**
 * Ask the Rome proxy which Solana accounts an EVM call from `from` would touch,
 * via `rome_emulateCallAccounts`. The returned metas feed {@link buildDoTxUnsigned}
 * directly. `payer` must be an existing on-chain account (the user's wallet),
 * else the proxy errors "Signer not found".
 */
export declare function emulateCallAccounts(rpcUrl: string, call: DiscoveryCall, payer: string, fetchImpl?: typeof fetch): Promise<AccountMeta[]>;
/**
 * Per-chain treasure (gas/fee) PDA — seeds `[chainId u64-LE, "TREASURE_SEED",
 * index u64-LE]`. The `DoTxUnsigned` execution pays it ~5000 lamports, but
 * account discovery omits it, so it's appended to the account list. `index` is
 * reliably 0.
 */
export declare function treasureWallet(programId: PublicKey | string, chainId: number, index?: number): PublicKey;
/**
 * The address's EVM-state PDA (nonce / balance / code) — seeds `[chainId u64-LE,
 * "ACCOUN_SEED", addr20]` ("ACCOUN_SEED" is the on-chain spelling). If absent
 * from a `DoTxUnsigned` account list the program panics ("error to get nonce");
 * pass it via `extraAccounts` when discovery truncates it.
 */
export declare function balanceKeyPda(programId: PublicKey | string, chainId: number, address: Hex): PublicKey;
/** Default CU limit: above Solana's 200K default (Rome's EVM exceeds it), below the 1.4M max. */
export declare const DEFAULT_DOTX_CU_LIMIT = 1350000;
/** Default heap frame: Rome's EVM heap ceiling; the 32-KB default faults. */
export declare const DEFAULT_DOTX_HEAP_BYTES: number;
/** The two ComputeBudget instructions every `DoTxUnsigned` needs (heap frame + CU limit). */
export declare function computeBudgetIxs(cuLimit?: number, heapBytes?: number): TransactionInstruction[];
/**
 * Client-side nonce sequencer for a synthetic address. Seed from the address's
 * on-chain count (`eth_getTransactionCount`), then `reserve()` a nonce per
 * `DoTxUnsigned` in a multi-step chain so later steps don't collide with
 * earlier-but-unconfirmed ones.
 */
export declare class SyntheticNonceTracker {
    private next;
    constructor(seed: bigint | number);
    peek(): bigint;
    reserve(): bigint;
    reset(seed: bigint | number): void;
}
export interface FeeFields {
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
    gasLimit: bigint;
}
/**
 * Size `gasLimit` + EIP-1559 fees for a Solana-lane call via the Rome proxy's
 * EVM JSON-RPC — mirrors `submitRomeTx`: a padded `eth_estimateGas` (1.3×) with
 * a fallback ceiling on revert, plus real base + tip fee fields.
 */
export declare function sizeSolanaLaneFee(rpcUrl: string, call: DiscoveryCall, opts?: {
    fallbackGas?: bigint;
    fetchImpl?: typeof fetch;
}): Promise<FeeFields>;
export interface EvmCall {
    to: Hex;
    data?: Hex;
    value?: bigint;
}
export interface AssembleDeps {
    proxyUrl: string;
    programId: PublicKey | string;
    chainId: number;
    fetchImpl?: typeof fetch;
}
/**
 * Build the (unsigned) Solana `Transaction` for an EVM call from a Solana-native
 * user: discover accounts → append the treasure wallet (+ any `extraAccounts`
 * discovery can't surface) → RLP + `DoTxUnsigned` + the two ComputeBudget
 * instructions. Caller supplies `recentBlockhash` (keeps this off the network
 * beyond discovery).
 */
export declare function assembleDoTxUnsignedTx(params: {
    call: EvmCall;
    payer: PublicKey;
    nonce: bigint;
    fee: FeeFields;
    recentBlockhash: string;
    extraAccounts?: AccountMeta[];
}, deps: AssembleDeps): Promise<Transaction>;
export interface SolanaLaneDeps {
    /** Solana RPC connection (submit + confirm go here, NOT the proxy). */
    connection: Connection;
    /** Rome proxy URL — the EVM JSON-RPC + `rome_emulateCallAccounts`. */
    proxyUrl: string;
    programId: PublicKey | string;
    chainId: number;
    /** The Solana wallet pubkey — fee-payer and authorizing signer. */
    payer: PublicKey;
    /** The wallet's `signTransaction` (e.g. Phantom's adapter). */
    signTransaction: (tx: Transaction) => Promise<Transaction>;
    fetchImpl?: typeof fetch;
}
/**
 * The Solana-lane mirror of `submitRomeTx`: a Solana wallet drives an EVM
 * contract on Rome. Auto-sizes the nonce (`eth_getTransactionCount` on the
 * synthetic address) and gas/fees, discovers accounts, assembles the
 * `DoTxUnsigned` tx (with the mandatory ComputeBudget + treasure wallet), has
 * the wallet sign, submits to the Solana RPC, and polls confirmation over HTTP.
 * Pass `nonce` / `fee` / `extraAccounts` to override auto-sizing.
 */
export declare function submitRomeTxSolanaLane(deps: SolanaLaneDeps, call: EvmCall & {
    nonce?: bigint;
    fee?: FeeFields;
    extraAccounts?: AccountMeta[];
    autoProvision?: boolean;
}): Promise<{
    signature: string;
    from: Hex;
}>;
/** Chain OwnerInfo/config PDA — single seed `[OWNER_INFO]`. Required by ActivateAta. */
export declare function ownerInfoPda(programId: PublicKey | string): PublicKey;
/**
 * ActivateAta instruction data: `[tag(18), chainId u64-LE, mint(32), tokens u64-LE]`.
 * `tokens` is in the MINT's decimals. NOT a DoTxUnsigned (no VM / ComputeBudget).
 */
export declare function buildActivateAtaData(params: {
    chainId: number | bigint;
    mint: PublicKey;
    tokens: bigint;
}): Buffer;
/** Full ActivateAta instruction. Accounts: signer(s+w), owner_info(r), mint(r), fromAta(w), toAta(w), tokenProgram(r). */
export declare function buildActivateAtaInstruction(params: {
    programId: PublicKey | string;
    chainId: number | bigint;
    mint: PublicKey;
    tokens: bigint;
    signer: PublicKey;
    fromAta: PublicKey;
    toAta: PublicKey;
    tokenProgram?: PublicKey;
}): TransactionInstruction;
/**
 * FUND LEG (wallet → synthetic): ensure the synthetic's ATA exists, then move
 * `amount` (in the mint's decimals) of the gas token from the wallet's ATA into
 * it (ActivateAta, wallet-signed). Returns native instructions for one
 * wallet-signed tx; the subsequent {@link submitRomeTxSolanaLane} spends it.
 */
export declare function buildFundLeg(params: {
    programId: PublicKey | string;
    chainId: number | bigint;
    mint: PublicKey;
    amount: bigint;
    wallet: PublicKey;
    synthetic: Hex;
    tokenProgram?: PublicKey;
}): TransactionInstruction[];
/** Submit native (non-DoTxUnsigned) instructions in one wallet-signed Solana tx (e.g. the fund leg). */
export declare function submitSolanaInstructions(instructions: TransactionInstruction[], deps: {
    connection: Connection;
    feePayer: PublicKey;
    signTransaction: (tx: Transaction) => Promise<Transaction>;
}): Promise<{
    signature: string;
}>;
/** HelperProgram precompile (`0xFF…09`) — home of `transfer_spl` (PDA-signed SPL move). */
export declare const HELPER_PROGRAM: Hex;
export interface SweepLeg {
    /** Idempotent create of the wallet's dest ATA (native ix; `transfer_spl` reverts without it). */
    ensureWalletAtaIx: TransactionInstruction;
    /** The `DoTxUnsigned` target — the HelperProgram precompile. */
    helperTo: Hex;
    /** `transfer_spl(walletAta, amount, mint)` calldata for the `DoTxUnsigned` call. */
    calldata: Hex;
    /** Source (synth ATA) + dest (wallet ATA) — append to the discovered accounts (both writable). */
    extraAccounts: AccountMeta[];
}
/**
 * SWEEP LEG (synthetic → wallet): after value lands in the synthetic (e.g. a
 * withdraw / borrow / claim), push `amount` of `mint` back to the user's own
 * wallet ATA via `HelperProgram.transfer_spl`, so the synthetic holds nothing at
 * rest. Wire it as: submit `ensureWalletAtaIx` (native, via
 * {@link submitSolanaInstructions}), then
 * `submitRomeTxSolanaLane({ to: helperTo, data: calldata, extraAccounts })`.
 */
export declare function buildSweepLeg(params: {
    programId: PublicKey | string;
    mint: PublicKey;
    amount: bigint;
    wallet: PublicKey;
    synthetic: Hex;
    tokenProgram?: PublicKey;
}): SweepLeg;
/**
 * The one-time provisioning call — `create_pda(synthetic)` on the HelperProgram
 * (`0xFF…09`). Submit once (via {@link submitRomeTxSolanaLane}) before the
 * synthetic's first value-moving write; gate on {@link isSyntheticProvisioned}.
 */
export declare function buildCreatePdaCall(synthetic: Hex): EvmCall;
/**
 * Whether the synthetic's external-auth PDA already exists on-chain (i.e. it's
 * been provisioned). One Solana-RPC account read.
 */
export declare function isSyntheticProvisioned(connection: Connection, programId: PublicKey | string, synthetic: Hex): Promise<boolean>;
/**
 * Provision a fresh synthetic if needed: create its external-auth PDA via
 * `create_pda`. Returns the signature if it created one, else
 * `{ alreadyProvisioned: true }`. The explicit form of what
 * {@link submitRomeTxSolanaLane}'s default `autoProvision` does — call it once
 * for an app "Activate" step, then submit writes with `autoProvision: false`.
 */
export declare function provisionSynthetic(deps: SolanaLaneDeps): Promise<{
    signature?: string;
    alreadyProvisioned: boolean;
}>;
