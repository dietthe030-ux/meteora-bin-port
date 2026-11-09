import { PublicKey } from "@solana/web3.js";
import { type Hex } from "viem";
/**
 * Derive a user's **external-authority PDA** — the Solana account the Rome
 * precompiles sign as on the user's behalf:
 *
 *   find_program_address(["EXTERNAL_AUTHORITY", evmAddress20], romeEvmProgramId)
 *
 * Byte-identical to the on-chain `HelperProgram.pda(address)` and to the
 * derivation every Rome app uses. `evmAddress` is a standard 20-byte hex address.
 */
export declare function deriveAuthorityPda(evmAddress: string, romeEvmProgramId: PublicKey | string): PublicKey;
/**
 * The associated token account of any owner + mint. `allowOwnerOffCurve` is
 * true because Rome owners are usually PDAs (off the ed25519 curve).
 */
export declare function deriveAta(owner: PublicKey | string, mint: PublicKey | string): PublicKey;
/** A user's PDA-owned ATA for a mint: `ATA(authorityPda(evmAddress), mint)`. */
export declare function deriveUserAta(evmAddress: string, mint: PublicKey | string, romeEvmProgramId: PublicKey | string): PublicKey;
/** A Solana pubkey as the 0x-prefixed 32-byte hex the precompiles take (`bytes32`). */
export declare function pubkeyToBytes32(pubkey: PublicKey | string): Hex;
