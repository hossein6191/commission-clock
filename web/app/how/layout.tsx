import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How it works",
  description: "The four askings word for word, why this needs GenLayer, where the money goes and the contract's own rules.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
