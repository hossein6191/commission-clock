import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The demo studio",
  description: "Fernhill Pottery copy desk: commission it with one wallet and play the client while the demo maker makes its moves.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
