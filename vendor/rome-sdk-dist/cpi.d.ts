import { type Hex } from "viem";
import type { PublicKey } from "@solana/web3.js";
/** The CPI precompile address (0xFF..08) — the `to` for invoke/invoke_signed calldata. */
export declare const CPI_PRECOMPILE: "0xff00000000000000000000000000000000000008";
/** A Solana account reference for a CPI, in ergonomic (camelCase) form. */
export interface AccountMeta {
    pubkey: PublicKey | string;
    isSigner: boolean;
    isWritable: boolean;
}
/**
 * Encode calldata for `CpiProgram.invoke(program, accounts, data)` — an arbitrary
 * Solana CPI signed as the caller's external-auth PDA. Send it to {@link CPI_PRECOMPILE}.
 */
export declare function encodeInvoke(programId: PublicKey | string, accounts: readonly AccountMeta[], data: Hex): Hex;
/**
 * Encode calldata for `CpiProgram.invoke_signed(program, accounts, data, seeds)`
 * — a CPI signed by N caller-derived PDAs (salts → seeds). Send it to {@link CPI_PRECOMPILE}.
 */
export declare function encodeInvokeSigned(programId: PublicKey | string, accounts: readonly AccountMeta[], data: Hex, seeds: readonly Hex[]): Hex;
/** Little-endian u64 (8 bytes) — for assembling inner Solana instruction data. */
export declare function u64Le(value: bigint): Hex;
/** A single byte. */
export declare function u8(value: number): Hex;
