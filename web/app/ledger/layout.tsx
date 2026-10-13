import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ledger",
  description: "The contract's totals: every fee held, paid out and returned, and every verdict the network reached.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
