import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BinPulse | Meteora DLMM & DAMM Dual-Lane Liquidity Port on Rome EVM",
  description:
    "One concentrated liquidity vault, two kinds of wallet. EVM and Solana wallets supply Spot, Curve, and Bid-Ask bin liquidity to Meteora DLMM & DAMM v1 via Rome Atomic CPI (0xFF...08).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#090b10] text-slate-100 antialiased selection:bg-amber-500/30 selection:text-amber-200">
        {children}
      </body>
    </html>
  );
}
