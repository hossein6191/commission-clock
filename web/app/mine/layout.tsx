import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My commissions",
  description: "Every commission you are a party to, with whose move it is and where the fee is.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
