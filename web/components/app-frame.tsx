"use client";

// The table around every page: the header with the mark, the six places to go and the wallet; the
// demo bar in mock mode; the wrong-chain banner; and the footer. Under 900 px the places fold into a
// menu, so the header fits a 375 px phone with no sideways scroll.

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Wordmark } from "@/components/logo";
import { MockBar } from "@/components/mock-bar";
import { WalletButton, WrongChainBanner } from "@/components/wallet";
import { EXPLORER_URL, contractInUse, isMock } from "@/lib/chain";
import { REPO_URL } from "@/lib/config";
import { cx } from "@/lib/cx";

const PLACES = [
  { href: "/studio", label: "Demo studio" },
  { href: "/mine", label: "My commissions" },
  { href: "/studios", label: "Studios" },
  { href: "/maker", label: "Maker's desk" },
  { href: "/ledger", label: "Ledger" },
  { href: "/how", label: "How it works" },
];

const isHere = (path: string, href: string) => path === href || (href === "/studios" && path.startsWith("/studios/")) || (href === "/mine" && path.startsWith("/c/"));

export function AppFrame({ children }: { children: React.ReactNode }) {
  const path = usePathname() || "/";
  const [open, setOpen] = React.useState(false);
  const [lastPath, setLastPath] = React.useState(path);
  if (lastPath !== path) {
    setLastPath(path);
    setOpen(false);
  }
  const contract = contractInUse();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line-strong/70 bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1160px] items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="min-w-0 shrink-0 no-underline" aria-label="Commission Clock, home">
            <Wordmark />
          </Link>
          <nav aria-label="Places" className="hidden min-w-0 items-center gap-0.5 min-[900px]:flex">
            {PLACES.map((p) => {
              const here = isHere(path, p.href);
              return (
                <Link
                  key={p.href}
                  href={p.href}
                  aria-current={here ? "page" : undefined}
                  className={cx(
                    "rounded-full px-3 py-1.5 text-[14.5px] font-semibold whitespace-nowrap no-underline",
                    here ? "bg-walnut text-amber-glow" : "text-ink-2 hover:bg-table-2 hover:text-ink",
                  )}
                >
                  {p.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex min-w-0 items-center gap-2">
            {!isMock && <WalletButton />}
            <button
              type="button"
              className="brass brass-sm brass-plain min-[900px]:!hidden"
              aria-expanded={open}
              aria-controls="place-menu"
              onClick={() => setOpen((o) => !o)}
            >
              {open ? "Close" : "Menu"}
            </button>
          </div>
        </div>
        {open && (
          <nav id="place-menu" aria-label="Places" className="border-t border-line bg-card min-[900px]:hidden">
            <ul className="mx-auto grid max-w-[1160px] grid-cols-2 gap-1.5 px-4 py-3">
              {PLACES.map((p) => {
                const here = isHere(path, p.href);
                return (
                  <li key={p.href}>
                    <Link
                      href={p.href}
                      aria-current={here ? "page" : undefined}
                      className={cx("block rounded-lg border-[1.5px] px-3 py-2 font-semibold no-underline", here ? "border-walnut bg-walnut text-amber-glow" : "border-line-strong bg-card text-ink")}
                    >
                      {p.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </header>
      {isMock && <MockBar />}
      <WrongChainBanner />
      <main id="main" className="mx-auto w-full max-w-[1160px] flex-1 px-4 pt-8 pb-16">
        {children}
      </main>
      <footer className="border-t border-line-strong/70 bg-table-2/60">
        <div className="mx-auto flex max-w-[1160px] flex-col gap-2 px-4 py-6 text-[13px] text-ink-2 sm:flex-row sm:items-center sm:justify-between">
          <p>
            <span className="display text-[15px] font-bold">Commission Clock</span> · an Intelligent Contract on GenLayer Studio. Every studio, shop and person on this site is
            fictional.
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            {contract && (
              <a className="link" href={`${EXPLORER_URL}/address/${contract}`} target="_blank" rel="noreferrer">
                {isMock ? "Demo contract" : "The contract"}
              </a>
            )}
            <a className="link" href="/drafts/mug-final.html">
              Demo drafts
            </a>
            {REPO_URL && (
              <a className="link" href={REPO_URL} target="_blank" rel="noreferrer">
                Source
              </a>
            )}
          </p>
        </div>
      </footer>
    </div>
  );
}
