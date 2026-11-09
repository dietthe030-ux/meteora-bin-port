/** Gas-estimate safety factor (1.3x) covering Rome's SPL-CPI undercount. */
export declare const ROME_GAS_PAD_NUMERATOR = 13n;
export declare const ROME_GAS_PAD_DENOMINATOR = 10n;
export declare const DEFAULT_ROME_GAS_FALLBACK = 250000000n;
/**
 * Pad an `eth_estimateGas` result by the Rome safety factor (1.3x) to cover
 * Rome's SPL-CPI undercount. Integer bigint math; truncates the fractional unit.
 */
export declare function padRomeGas(estimate: bigint): bigint;
/**
 * Size gas for a Rome write whose `eth_estimateGas` may be UNUSABLE. Most writes
 * estimate fine and just need the {@link padRomeGas} 1.3x bump; a few (e.g. a
 * constructor that CPIs to load an SPL mint) REVERT under estimation, so there's
 * nothing to pad. Prefer the real (padded) estimate when the chain can produce
 * one; fall back to a caller-supplied ceiling when it can't. Over-provisioning
 * is free on Rome's cost model.
 *
 * @param estimate        returns the raw `eth_estimateGas` result (bigint)
 * @param fallbackCeiling explicit gas to use when `estimate` throws
 */
export declare function romeWriteGas(estimate: () => Promise<bigint>, fallbackCeiling: bigint): Promise<bigint>;
export declare const ROME_MAX_FEE_HEADROOM_NUMERATOR = 11n;
export declare const ROME_MAX_FEE_HEADROOM_DENOMINATOR = 10n;
/**
 * Build STANDARD EIP-1559 fee fields for a Rome write from the live 1559
 * context. Rome maps the Solana cu-price market onto the standard fee RPCs:
 * `eth_maxPriorityFeePerGas` (a single suggested tip, 0 on a quiet cluster) and
 * a real, non-zero block `baseFeePerGas`. So the correct construction is the one
 * every wallet uses:
 *
 *     maxPriorityFeePerGas = suggested tip          (0 when the market is idle)
 *     maxFeePerGas         = baseFee * 1.1 + tip    (small headroom for base drift)
 *
 * WHY ~1.1x and not a wallet-style 2x: Rome's baseFee is an oracle-derived
 * near-constant — contention moves the TIP, not base — so 2x base-movement
 * headroom guards against movement that can't happen, and makes wallets flag
 * "site suggested a fee higher than the network estimate". 1.1x only covers
 * oracle ticks between the fee read and inclusion. Display-only either way — the
 * proxy charges baseFee + tip on gasUsed, never maxFee.
 *
 * WHY declare the real tip: setting BOTH fields to `eth_gasPrice` (where
 * gasPrice == baseFee today) declares a `maxPriorityFeePerGas` == baseFee — a
 * real tip the proxy folds into the charge (a measurable overcharge that scales
 * with the tx's Solana CU). Declaring the REAL suggested tip (0 when idle)
 * removes that and still auto-tracks contention.
 *
 * LEGACY fallback: a proxy that still reports `baseFeePerGas == 0` needs the old
 * workaround — a wallet's own 1559 estimate collapses to maxFee = 0 → "Network
 * fee: Unavailable", so both fields fall back to `gasPrice`. Returns `{}` when
 * nothing usable is available so a 0 fee is never submitted.
 */
export declare function buildRome1559Fees(ctx: {
    baseFeePerGas?: bigint;
    suggestedPriorityFee?: bigint;
    gasPrice?: bigint;
}): {
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
} | Record<string, never>;
/**
 * Back-compat thin wrapper: standard (EIP-1559) fee fields from a bare
 * `gasPrice`. Prefer {@link buildRome1559Fees} with the full 1559 context (base
 * + suggested tip) so the tip isn't over-declared. Apply ONLY on Rome chains —
 * source chains (e.g. Sepolia) have a healthy baseFee; pass their own price.
 */
export declare function romeFeeFields(gasPrice: bigint | undefined): {
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
} | Record<string, never>;
export interface RomeTxRequest {
    from: string;
    to: string;
    data: string;
    /** Native value in wei; serialized to a hex quantity when present. */
    value?: bigint;
    /**
     * Explicit gas ceiling used ONLY when `eth_estimateGas` throws. Without it, an
     * estimate revert makes submitRomeTx omit `gas`, the wallet runs its own
     * (same-reverting) estimation, and the wallet renders "Network fee:
     * Unavailable" and blocks the tx. A USABLE estimate always wins (padded 1.3x);
     * this is a last resort. When omitted, {@link DEFAULT_ROME_GAS_FALLBACK} is
     * used on estimate failure (never left unset). Pass a value only to override
     * the default (e.g. an op heavier than the default ceiling).
     */
    fallbackGas?: bigint;
    /**
     * Floor applied to the FINAL gas value (padded estimate OR fallback), for
     * writes where Rome's emulator under-estimates so badly that even the 1.3x pad
     * sits below real on-chain cost. The floor only raises, never lowers.
     */
    minGas?: bigint;
}
interface EthRequestProvider {
    request?: (args: {
        method: string;
        params?: unknown[];
    }) => Promise<unknown>;
}
/**
 * Submit a Rome write via `eth_sendTransaction`, sizing gas from
 * `eth_estimateGas` padded by {@link padRomeGas} (1.3x), falling back to an
 * explicit ceiling when estimation throws, and supplying standard EIP-1559 fee
 * fields from the live 1559 context. Returns the tx hash.
 *
 * Adopt this for any Rome write instead of calling `eth_sendTransaction` raw.
 * Accepts the wallet's EIP-1193 provider and throws if it has no `request`.
 */
export declare function submitRomeTx(provider: EthRequestProvider | null | undefined, tx: RomeTxRequest): Promise<`0x${string}`>;
export {};
