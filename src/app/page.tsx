import { getChain, getContracts, getPrograms } from "@rome-protocol/registry";
import BinPulseDashboard from "@/components/BinPulseDashboard";

export default function HomePage() {
  // Dynamically resolve live chain facts from @rome-protocol/registry on the server
  const hadrian = getChain(200010) as {
    chainId: number;
    name: string;
    rpcUrl: string;
    explorerUrl: string;
    romeEvmProgramId: string;
  } | null;

  const rawContracts = getContracts(200010) as unknown;
  const contractsList = (
    Array.isArray(rawContracts)
      ? rawContracts
      : ((rawContracts as { contracts?: unknown[] })?.contracts ?? [])
  ) as Array<{ name: string; versions: Array<{ address: string; status: string }> }>;

  const meteoraFactory =
    contractsList
      .find((c) => c.name === "MeteoraDAMMv1Factory")
      ?.versions.find((v) => v.status === "live")?.address ??
    "0xd68b355f62643de0ec40243cba8f699f959ea3c4";

  const devnetPrograms = (getPrograms("devnet") ?? {}) as Record<string, string>;

  const registrySnapshot = {
    hadrianName: hadrian?.name ?? "Rome Hadrian",
    chainId: hadrian?.chainId ?? 200010,
    rpcUrl: hadrian?.rpcUrl ?? "https://hadrian.testnet.romeprotocol.xyz/",
    explorerUrl: (hadrian?.explorerUrl ?? "https://via-hadrian.testnet.romeprotocol.xyz").replace(
      /\/$/,
      ""
    ),
    romeEvmProgramId:
      hadrian?.romeEvmProgramId ?? "RPTWwELXAY4KC9ZPHhaxp7Sq1hHtU3HNEgLbSegCcWf",
    meteoraFactoryAddress: meteoraFactory,
    meteoraDlmmProgramId:
      devnetPrograms.meteoraDlmm ?? "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
    meteoraDammV1ProgramId:
      devnetPrograms.meteoraDammV1 ?? "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB",
  };

  return <BinPulseDashboard registrySnapshot={registrySnapshot} />;
}
