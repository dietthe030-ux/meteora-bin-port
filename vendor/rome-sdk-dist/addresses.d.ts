/**
 * Rome EVM exposes Solana programs as EVM precompiles at fixed addresses.
 *
 * Addresses are LOWERCASE on purpose: passed mixed-case, viem's EIP-55 checksum
 * rejects them inside `signTransaction` / `writeContract` (observed in production
 * for the Helper precompile). Keep them lowercase everywhere.
 *
 * Source of truth: the canonical Rome precompile interface (`interface.sol`,
 * shipped in this package), mirroring Rome EVM's on-chain dispatch table.
 */
export declare const PRECOMPILE_ADDRESSES: {
    /** Cached (revertable) system-program ops — PDA create, allocate, assign, lamport transfer. */
    readonly systemCached: "0xff00000000000000000000000000000000000004";
    /** Cached (revertable) SPL Token / Token-2022 transfers, ATA init, account reads. */
    readonly splCached: "0xff00000000000000000000000000000000000005";
    /** Cached (revertable) idempotent ATA-create variants. */
    readonly associatedSplCached: "0xff00000000000000000000000000000000000006";
    /** System Program — PDA derivation, base58, mint/operator/program-id getters. */
    readonly system: "0xff00000000000000000000000000000000000007";
    /** CpiProgram — arbitrary Solana CPI (invoke / invoke_signed) + read shortcuts. */
    readonly cpi: "0xff00000000000000000000000000000000000008";
    /** HelperProgram — SPL / PDA / ATA / lamports / gas-token plumbing, signed by the caller's PDA. */
    readonly helper: "0xff00000000000000000000000000000000000009";
    /** Cached (revertable) counterpart of Withdraw. */
    readonly withdrawCached: "0xff0000000000000000000000000000000000000b";
    /** Withdraw — SOL withdrawal + the two gas-token wrap/unwrap legs. */
    readonly withdraw: "0x4200000000000000000000000000000000000016";
};
export type PrecompileName = keyof typeof PRECOMPILE_ADDRESSES;
