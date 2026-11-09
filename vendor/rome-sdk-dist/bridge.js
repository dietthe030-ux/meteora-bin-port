// Typed client + pure flow logic for the Rome bridge API (`/v1`) — the
// off-chain orchestrator + fee-sponsor for cross-chain transfers (CORS *, no
// key; it holds no funds).
//
// The load-bearing contract (equality-only verification): clients sign the
// QUOTE'S `unsignedTxs` VERBATIM — never locally-built calldata — and submit the
// quote object back UNMODIFIED. For the trustless gas settle the wallet signs a
// filled COPY of the quote's EIP-712 SettleAuthorization (sourceTxHash = the
// burn tx); the API overlays the hash itself at verify time, so the quote stays
// pristine. `domain.chainId` stays NUMERIC over JSON — a string yields a
// different domain separator and a signer mismatch on-chain.
//
// Pass your bridge API endpoint per call via `opts.base`.
// ── Errors ───────────────────────────────────────────────────────────────────
/** Bridge API errors are problem+json: {code, title, status, detail}. */
export class BridgeApiError extends Error {
    code;
    status;
    detail;
    constructor(p) {
        super(p.detail ?? p.title ?? p.code);
        this.name = "BridgeApiError";
        this.code = p.code;
        this.status = p.status;
        if (p.detail !== undefined)
            this.detail = p.detail;
    }
}
async function request(path, opts, init) {
    const res = await fetch(`${opts.base}${path}`, { cache: "no-store", ...init });
    if (res.ok)
        return (await res.json());
    let problem = null;
    try {
        problem = await res.json();
    }
    catch {
        /* non-JSON failure body (gateway/proxy) — fall through to the generic code */
    }
    throw new BridgeApiError({
        code: typeof problem?.code === "string" ? problem.code : "rome.bridge.http-error",
        status: res.status,
        ...(problem?.title !== undefined ? { title: problem.title } : {}),
        ...(problem?.detail !== undefined ? { detail: problem.detail } : {}),
    });
}
function postJson(path, body, opts) {
    return request(path, opts, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}
// ── The four /v1 calls ───────────────────────────────────────────────────────
export function requestQuote(req, opts) {
    return postJson("/v1/quote", req, opts);
}
/**
 * Register the transfer AFTER the source tx is broadcast. `quote` must be the
 * object `/v1/quote` returned, verbatim; `userSettleSig` only on gas-intent CCTP
 * inbound (absent = wormhole / wrapper / outbound).
 */
export function registerTransfer(p, opts) {
    return postJson("/v1/transfers", {
        quote: p.quote,
        step1TxHash: p.step1TxHash,
        ...(p.userSettleSig !== undefined ? { userSettleSig: p.userSettleSig } : {}),
    }, opts);
}
export function getTransfer(id, opts) {
    return request(`/v1/transfers/${encodeURIComponent(id)}`, opts);
}
/** Report a user-executed step tx (e.g. the outbound destination claim). */
export function reportStep(id, n, txHash, opts) {
    return postJson(`/v1/transfers/${encodeURIComponent(id)}/steps/${n}`, { txHash }, opts);
}
/**
 * The typed-data the wallet signs for the trustless gas settle: the quote's
 * SettleAuthorization with the burn tx hash filled into `message.sourceTxHash`.
 * Returns a COPY — the quote object stays pristine for registerTransfer. Null
 * when the quote carries no settle authorization (wormhole inbound, wrapper
 * intent, outbound).
 */
export function settleTypedDataWithBurn(quote, burnTxHash) {
    const req = quote.signatureRequests?.[0];
    if (!req?.typedData)
        return null;
    const fillField = req.fillFromBurn ?? "sourceTxHash";
    return {
        ...req.typedData,
        message: { ...req.typedData.message, [fillField]: burnTxHash },
    };
}
// ── Pure flow logic (no wallet, no framework) ────────────────────────────────
export class BridgeFlowError extends Error {
    constructor(message) {
        super(message);
        this.name = "BridgeFlowError";
    }
}
export function inboundCctpQuoteRequest(p) {
    return {
        asset: "USDC",
        direction: "to-rome",
        sourceChain: "ethereum",
        sourceChainId: p.sourceChainId,
        romeChainId: String(p.romeChainId),
        intent: "gas",
        ...(p.speed !== undefined ? { speed: p.speed } : {}),
        amount: p.amount.toString(),
        sender: { ethereum: p.evmAddress },
        recipient: p.evmAddress,
    };
}
export function inboundWhQuoteRequest(p) {
    return {
        asset: "ETH",
        direction: "to-rome",
        sourceChain: "ethereum",
        sourceChainId: p.sourceChainId,
        romeChainId: String(p.romeChainId),
        amount: p.amount.toString(),
        sender: { ethereum: p.evmAddress },
        recipient: p.evmAddress,
    };
}
export function outboundCctpQuoteRequest(p) {
    return {
        asset: "USDC",
        direction: "from-rome",
        sourceChain: "ethereum",
        destinationChainId: p.destinationChainId,
        romeChainId: String(p.romeChainId),
        amount: p.amount.toString(),
        sender: { rome: p.evmAddress },
        recipient: p.recipient,
    };
}
export function outboundWhQuoteRequest(p) {
    return {
        asset: "ETH",
        direction: "from-rome",
        sourceChain: "ethereum",
        romeChainId: String(p.romeChainId),
        amount: p.amount.toString(),
        sender: { rome: p.evmAddress },
        recipient: p.recipient,
    };
}
/**
 * The txs the USER signs, verbatim from the quote, ordered by step. Sponsor
 * steps (no `unsignedTxs`) are skipped. Route is asserted so a surprising quote
 * can never put the wallet on the wrong flow.
 */
export function userSignedTxs(quote, expectedRoute) {
    if (quote.route !== expectedRoute) {
        throw new BridgeFlowError(`quote route ${quote.route} != expected ${expectedRoute}`);
    }
    const out = [];
    for (const step of [...quote.steps].sort((a, b) => a.n - b.n)) {
        if (!step.unsignedTxs?.length)
            continue;
        for (const tx of step.unsignedTxs)
            out.push({ stepN: step.n, tx });
    }
    if (out.length === 0) {
        throw new BridgeFlowError(`quote for ${expectedRoute} carries no user-signed txs`);
    }
    return out;
}
/**
 * Index (into userSignedTxs' result) of the tx whose hash is `step1TxHash` at
 * registration: the LAST tx of the FIRST step (e.g. CCTP-in [approve,
 * depositForBurn] → the burn). The API verifies `step1TxHash` against the last
 * unsignedTx of the quote's first step.
 */
export function step1BindingTxIndex(items) {
    const firstStep = items[0].stepN;
    let idx = 0;
    for (let i = 0; i < items.length; i++) {
        if (items[i].stepN === firstStep)
            idx = i;
    }
    return idx;
}
/** Map a TransferRecord to a coarse phase/outcome for status display. */
export function transferFlowStatus(record) {
    const steps = record.steps ?? [];
    if (record.outcome === "failed" || steps.some((s) => s.status === "failed")) {
        return { phase: "failed" };
    }
    if (record.outcome === "complete") {
        if (record.degradation === "settle-skipped")
            return { phase: "complete", outcome: "settle-skipped" };
        const settle = steps.find((s) => s.kind === "settle-inbound-bridge-sponsored");
        if (settle && settle.status === "confirmed" && !settle.skipped)
            return { phase: "complete", outcome: "all-gas" };
        return { phase: "complete", outcome: "wrapper-only" };
    }
    if (steps.some((s) => s.status === "ready" || (s.status === "submitted" && s.n !== 1))) {
        return { phase: "submitting" };
    }
    const blockers = steps.filter((s) => s.status === "blocked").flatMap((s) => s.blockedBy ?? []);
    if (blockers.includes("circle-attestation"))
        return { phase: "awaiting-attestation" };
    if (blockers.includes("wormhole-vaa"))
        return { phase: "awaiting-vaa" };
    return { phase: "registered" };
}
