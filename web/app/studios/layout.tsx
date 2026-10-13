import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Studios", template: "%s · Commission Clock" },
  description: "Every studio on the contract, with its terms and its public record.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
