declare module "@rome-protocol/registry" {
  export function listChains(): Array<Record<string, any>>;
  export function getChain(chainId: number): Record<string, any> | null;
  export function getTokens(chainId: number): Record<string, any> | null;
  export function getContracts(chainId: number): Record<string, any> | null;
  export function getOracle(chainId: number): Record<string, any> | null;
  export function getBridge(chainId: number): Record<string, any> | null;
  export function getAlts(chainId: number): Record<string, any> | null;
  export function getCompoundDeployment(chainId: number): Record<string, any> | null;
  export function getAaveDeployment(chainId: number): Record<string, any> | null;
  export function getPrograms(network: "mainnet" | "devnet"): Record<string, string>;
  export function getLstMints(): Record<string, any>;
}
