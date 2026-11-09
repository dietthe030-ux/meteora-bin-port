/**
 * The **v1 Solana lane**: a Solana wallet drives an EVM contract on Rome with
 * one Solana v1 transaction (4096 bytes, up to 64 accounts, no lookup table).
 *
 * The proxy emulates the call and composes the whole transaction, so the client
 * sends no ComputeBudget instructions, treasure wallet or account list. The same
 * wallet key signs twice, over two different messages:
 *  1. an authorization over the readable text `Rome authorization\n0x<hash>`
 *     (`<hash>` = the EVM transaction hash), sent with the compose request;
 *  2. the Solana transaction signature over the composed v1 message.
 *
 * A call too large for one atomic transaction is refused by the composer; the
 * proxy can then relay it with the same authorization signature. A sender short
 * of native gas can top up from the wallet's gas-token account with {@link fundSyntheticGas}.
 *
 * `submitRomeTxSolanaLane` (`./solana.ts`) is the older legacy-transaction path.
 * The one-time `create_pda` step is still `provisionSynthetic` from that module.
 */
import { Keypair, PublicKey, type Connection } from "@solana/web3.js";
import { type Hex } from "viem";
import { type EvmCall, type FeeFields } from "./solana.js";
/** The text a wallet shows for the authorization signature, up to the hash. */
export declare const ED25519_AUTH_MESSAGE_PREFIX = "Rome authorization\n0x";
/** The EVM transaction hash of an unsigned EIP-1559 payload: `keccak256(0x02 ‖ rlp)`. */
export declare function authHashFor(unsignedRlp: Hex): Uint8Array;
/** The bytes the wallet signs: the prefix, then the hash as 64 lowercase hex characters (85 bytes). */
export declare function ed25519AuthMessage(hash: Uint8Array): Uint8Array;
/**
 * What the lane needs from a wallet. Both methods return a raw 64-byte ed25519
 * signature from the key behind `payer`.
 */
export interface LaneSigner {
    payer: PublicKey;
    /**
     * Sign the readable authorization message exactly as given. A Wallet Standard
     * wallet does this with `solana:signMessage`.
     */
    signAuthHash(message: Uint8Array): Promise<Uint8Array>;
    /**
     * Sign a v1 wire (the message followed by one zero signature slot) and return
     * only the 64-byte signature for that slot, not the signed wire. A Wallet
     * Standard wallet's `solana:signTransaction` returns the whole signed wire as
     * `signedTransaction`, so return `signedTransaction.slice(-64)`.
     */
    signV1Wire(unsignedWire: Uint8Array): Promise<Uint8Array>;
}
export type SignerLike = LaneSigner | Keypair;
/** Wrap a `Keypair` as a {@link LaneSigner}; a `LaneSigner` is returned as is. */
export declare function toLaneSigner(signer: SignerLike): LaneSigner;
/** Split a v1 wire into its message and signature count. Only single-signer wires are accepted. */
export declare function splitV1Wire(wire: Uint8Array): {
    message: Uint8Array;
    numRequiredSignatures: number;
};
/** The wire to broadcast: the message followed by the 64-byte signature. */
export declare function packSignedV1Wire(message: Uint8Array, signature: Uint8Array): Uint8Array;
export interface V1Instruction {
    programIdIndex: number;
    accountIndices: number[];
    data: Uint8Array;
}
export interface ParsedV1Message {
    header: {
        numRequiredSignatures: number;
        numReadonlySignedAccounts: number;
        numReadonlyUnsignedAccounts: number;
    };
    accountKeys: PublicKey[];
    instructions: V1Instruction[];
    /** Set only when the message's config mask carries a priority fee (micro-lamports per compute unit). */
    priorityFeeMicroLamports?: bigint;
    /** Set only when the message's config mask carries a compute-unit limit. */
    computeUnitLimit?: number;
    /** Set only when the message's config mask carries a heap size. */
    heapBytes?: number;
}
/**
 * Decode a v1 message (no signatures). Layout: version(1) header(3) config mask
 * u32 blockhash(32) instruction count(1) account count(1), the account keys,
 * the config values the mask selects (priority fee u64 needs both of its bits,
 * then compute-unit limit u32, loaded-accounts size u32, heap size u32), the
 * 4-byte instruction headers (program index, account count, data length u16),
 * then each instruction's account indices and data. Throws on a wrong version,
 * unknown mask bits, a half-set priority fee, or a truncated message.
 */
export declare function parseV1Message(message: Uint8Array): ParsedV1Message;
/** The composer's answer for a call that does not fit one atomic transaction. */
export declare const ATOMIC_REFUSAL_TEXT = "external atomic plan requires iterative composition";
/** True when `err` (an Error or a string) is the composer's refusal; no other failure qualifies. */
export declare function isAtomicRefusal(err: unknown): boolean;
export interface TransactionReceiptLike {
    status?: Hex;
    blockNumber?: Hex;
    transactionHash?: Hex;
    [key: string]: unknown;
}
export interface SolanaLaneV1Deps {
    /** Solana RPC connection: the signed transaction is sent and confirmed here, not on the proxy. */
    connection: Connection;
    proxyUrl: string;
    /** The chain's Rome EVM program. A composed transaction may call only this program and the Ed25519 verifier. */
    programId: PublicKey | string;
    chainId: number;
    signer: SignerLike;
    fetchImpl?: typeof fetch;
    /** How long to wait for the EVM receipt. Default 90 000 ms. */
    receiptTimeoutMs?: number;
    /** How long to wait for the Solana transaction to confirm. Default 90 000 ms. */
    confirmTimeoutMs?: number;
}
export interface SolanaLaneV1Result {
    hash: Hex;
    from: Hex;
    route: "atomic" | "relay";
    /** The Solana signature; atomic route only. */
    signature?: string;
    /**
     * `null` when the receipt did not appear in time. A reverted EVM call does
     * not throw on the relay route: it resolves with `receipt.status === "0x0"`,
     * so check `receipt?.status === "0x1"` before treating the call as done.
     */
    receipt: TransactionReceiptLike | null;
}
type V1Call = EvmCall & {
    nonce?: bigint;
    fee?: FeeFields;
};
/**
 * Run an EVM call from a Solana wallet as one v1 transaction. Sizes the nonce and
 * fees, asks the wallet for the authorization signature (one prompt), has the
 * proxy compose the transaction, checks it, asks for the transaction signature,
 * sends it to the Solana RPC and waits for the EVM receipt.
 *
 * When the composer refuses the call, it is relayed through the proxy with the
 * same authorization signature (no second prompt); pass `relayOnRefusal: false`
 * to get the refusal as an error instead. That option only controls what this
 * function does: the proxy holds the authorization signature and can run the
 * payload by either route, up to `gasLimit × maxFeePerGas`.
 */
export declare function submitRomeTxV1(deps: SolanaLaneV1Deps, call: V1Call & {
    relayOnRefusal?: boolean;
}): Promise<SolanaLaneV1Result>;
/**
 * Relay an EVM call through the proxy, which composes, submits and pays for the
 * Solana transaction itself; the sender pays gas in the chain's native token.
 * The wallet signs only the authorization message, unless `authSig` is passed;
 * a passed signature covers one payload, so pin `nonce` and `fee` with it.
 */
export declare function relayV1(deps: SolanaLaneV1Deps, call: V1Call & {
    authSig?: Uint8Array;
}): Promise<SolanaLaneV1Result>;
/**
 * Top up the sender's native gas balance from the wallet's own token account of
 * the chain's gas token (USDC on Hadrian and Rubicon). `amountWei` is
 * in the chain's wei and must be a multiple of 10^12 (the proxy refuses any
 * other amount). The wallet signs one plain v1 transaction.
 */
export declare function fundSyntheticGas(deps: SolanaLaneV1Deps, amountWei: bigint): Promise<{
    signature: string;
}>;
/** Poll `eth_getTransactionReceipt` until it returns a receipt; `null` after `timeoutMs` (default 90 000). */
export declare function waitForReceipt(proxyUrl: string, hash: Hex, opts?: {
    timeoutMs?: number;
    intervalMs?: number;
    fetchImpl?: typeof fetch;
}): Promise<TransactionReceiptLike | null>;
export {};
