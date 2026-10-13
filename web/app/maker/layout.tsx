import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Maker's desk",
  description: "Open a studio with your own terms, accept or decline requests, and keep your own commissions moving.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
