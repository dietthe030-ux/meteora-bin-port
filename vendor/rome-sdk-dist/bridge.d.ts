export interface BridgeApiOpts {
    /** Bridge API base URL, e.g. "https://bridge-api.example". Required. */
    base: string;
}
export interface QuoteRequest {
    asset: "USDC" | "ETH" | "SOL" | "SPL" | "TOKEN";
    splAsset?: {
        mint: string;
        decimals: number;
        symbol?: string;
        wrapper?: string;
    };
    direction: "to-rome" | "from-rome";
    /** Legacy symbolic rail ("ethereum") or CAIP-2 ("eip155:11155111"). */
    sourceChain: string;
    sourceChainId?: number;
    destinationChainId?: number;
    speed?: "standard" | "fast";
    simulate?: boolean;
    deadlineSec?: number;
    romeChainId: string;
    intent?: "gas" | "wrapper";
    /** Base units, decimal string. */
    amount: string;
    sender: {
        ethereum?: string;
        solana?: string;
        rome?: string;
    };
    recipient: string;
}
export interface UnsignedTx {
    to: `0x${string}`;
    data: `0x${string}`;
    value?: string;
    estimatedGas?: string;
    description?: string;
    simulation?: {
        ok: boolean;
        revertReason?: string;
    };
}
export interface QuoteStep {
    n: number;
    chain: string;
    kind: string;
    /** Present on user-signed steps — sign these VERBATIM. */
    unsignedTxs?: UnsignedTx[];
    unsignedTx?: null;
    blockedBy?: string[];
    userSigns?: boolean;
    sponsor?: "user" | "rome" | "partner";
    chainRef?: string;
    chainName?: string;
    recipientAta?: string;
    recipientPdaOwner?: string;
    /** Settle step only: the Rome recipient the authorization must recover to. */
    user?: string;
}
export interface SettleTypedData {
    domain: {
        name: string;
        version: string;
        chainId: number;
        [k: string]: unknown;
    };
    types: Record<string, Array<{
        name: string;
        type: string;
    }>>;
    primaryType: string;
    message: Record<string, string>;
}
export interface SettleSignatureRequest {
    kind: "settle-authorization-eip712";
    /** Which message field the client fills from the burn tx hash. */
    fillFromBurn: "sourceTxHash";
    typedData: SettleTypedData;
}
export interface Quote {
    route: string;
    direction: "to-rome" | "from-rome";
    amountIn: string;
    amountOut: string;
    fee?: {
        bps: number;
        absolute: string;
        asset: string;
    };
    etaSeconds?: number;
    steps: QuoteStep[];
    signatureRequests?: SettleSignatureRequest[];
    outputs?: Array<{
        kind: string;
        chainId?: string;
    }>;
    cctpVersion?: number;
    sourceChainId?: number;
    sourceChainRef?: string;
    [k: string]: unknown;
}
export type TransferStepStatus = "blocked" | "ready" | "submitted" | "confirmed" | "failed";
export interface TransferStep extends Omit<QuoteStep, "unsignedTxs" | "unsignedTx"> {
    status: TransferStepStatus;
    txHashes?: string[];
    skipped?: boolean;
    attestation?: unknown;
    vaa?: unknown;
    confirmedAt?: string;
}
export interface TransferRecord {
    id: string;
    route: string;
    direction: "to-rome" | "from-rome";
    amountIn: string;
    amountOut: string;
    sender: {
        ethereum?: string;
        solana?: string;
        rome?: string;
    };
    recipient: string;
    steps: TransferStep[];
    outcome: "pending" | "complete" | "failed";
    degradation?: string;
    degradationReason?: string;
    settleAuthorized?: boolean;
    [k: string]: unknown;
}
/** Bridge API errors are problem+json: {code, title, status, detail}. */
export declare class BridgeApiError extends Error {
    readonly code: string;
    readonly status: number;
    readonly detail?: string;
    constructor(p: {
        code: string;
        status: number;
        title?: string;
        detail?: string;
    });
}
export declare function requestQuote(req: QuoteRequest, opts: BridgeApiOpts): Promise<Quote>;
/**
 * Register the transfer AFTER the source tx is broadcast. `quote` must be the
 * object `/v1/quote` returned, verbatim; `userSettleSig` only on gas-intent CCTP
 * inbound (absent = wormhole / wrapper / outbound).
 */
export declare function registerTransfer(p: {
    quote: Quote;
    step1TxHash: string;
    userSettleSig?: string;
}, opts: BridgeApiOpts): Promise<TransferRecord>;
export declare function getTransfer(id: string, opts: BridgeApiOpts): Promise<TransferRecord>;
/** Report a user-executed step tx (e.g. the outbound destination claim). */
export declare function reportStep(id: string, n: number, txHash: string, opts: BridgeApiOpts): Promise<TransferRecord>;
/**
 * The typed-data the wallet signs for the trustless gas settle: the quote's
 * SettleAuthorization with the burn tx hash filled into `message.sourceTxHash`.
 * Returns a COPY — the quote object stays pristine for registerTransfer. Null
 * when the quote carries no settle authorization (wormhole inbound, wrapper
 * intent, outbound).
 */
export declare function settleTypedDataWithBurn(quote: Quote, burnTxHash: string): SettleTypedData | null;
export declare class BridgeFlowError extends Error {
    constructor(message: string);
}
export declare function inboundCctpQuoteRequest(p: {
    sourceChainId: number;
    romeChainId: number | string;
    amount: bigint;
    evmAddress: string;
    speed?: "standard" | "fast";
}): QuoteRequest;
export declare function inboundWhQuoteRequest(p: {
    sourceChainId: number;
    romeChainId: number | string;
    amount: bigint;
    evmAddress: string;
}): QuoteRequest;
export declare function outboundCctpQuoteRequest(p: {
    destinationChainId: number;
    romeChainId: number | string;
    amount: bigint;
    evmAddress: string;
    recipient: string;
}): QuoteRequest;
export declare function outboundWhQuoteRequest(p: {
    romeChainId: number | string;
    amount: bigint;
    evmAddress: string;
    recipient: string;
}): QuoteRequest;
export interface UserSignedTx {
    stepN: number;
    tx: UnsignedTx;
}
/**
 * The txs the USER signs, verbatim from the quote, ordered by step. Sponsor
 * steps (no `unsignedTxs`) are skipped. Route is asserted so a surprising quote
 * can never put the wallet on the wrong flow.
 */
export declare function userSignedTxs(quote: Quote, expectedRoute: string): UserSignedTx[];
/**
 * Index (into userSignedTxs' result) of the tx whose hash is `step1TxHash` at
 * registration: the LAST tx of the FIRST step (e.g. CCTP-in [approve,
 * depositForBurn] → the burn). The API verifies `step1TxHash` against the last
 * unsignedTx of the quote's first step.
 */
export declare function step1BindingTxIndex(items: UserSignedTx[]): number;
export interface FlowStatus {
    /** registered | awaiting-attestation | awaiting-vaa | submitting | complete | failed */
    phase: string;
    /** only on `complete`: all-gas | wrapper-only | settle-skipped */
    outcome?: string;
}
/** Map a TransferRecord to a coarse phase/outcome for status display. */
export declare function transferFlowStatus(record: TransferRecord): FlowStatus;
