/** POST one JSON-RPC call and return its `result`; an error answer throws. */
export declare function jsonRpc<T>(rpcUrl: string, method: string, params: unknown[], fetchImpl: typeof fetch): Promise<T>;
