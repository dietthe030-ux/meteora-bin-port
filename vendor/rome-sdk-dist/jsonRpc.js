// The one JSON-RPC call both Solana lanes use. Internal: not exported from the package index.
/** POST one JSON-RPC call and return its `result`; an error answer throws. */
export async function jsonRpc(rpcUrl, method, params, fetchImpl) {
    const res = await fetchImpl(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const json = (await res.json());
    if (json.error)
        throw new Error(`${method}: ${json.error.message} (code ${json.error.code})`);
    return json.result;
}
