import { NextResponse } from "next/server";
import { getChain, getContracts, getTokens, getPrograms } from "@rome-protocol/registry";
import deployment from "@/lib/deployment.json";

export async function GET() {
  const hadrian = getChain(200010);
  const contracts = getContracts(200010);
  const tokens = getTokens(200010);
  const devnetPrograms = getPrograms("devnet");
  const mainnetPrograms = getPrograms("mainnet");

  return NextResponse.json({
    source: "@rome-protocol/registry (live runtime resolution)",
    resolvedAt: new Date().toISOString(),
    hadrian,
    contracts,
    tokens,
    solanaPrograms: {
      devnet: devnetPrograms,
      mainnet: mainnetPrograms,
    },
    deployment,
  });
}
