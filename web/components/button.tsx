// The two kinds of button on the table. The round clock plunger is for the one action that hands
// the move over (a press, a delivery, a commission sent): a raised cap on a short stem that goes down
// when pressed. Everything else is a squared brass plate with four screws.

import * as React from "react";
import Link from "next/link";

import { cx } from "@/lib/cx";

type PlungerProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  /** the words beside the cap, e.g. "Press: send and hand over the move" */
  label: React.ReactNode;
  /** shown on the cap */
  glyph?: React.ReactNode;
  /** the label sits beside the cap (a row) instead of under it */
  row?: boolean;
  pressed?: boolean;
};

export function Plunger({ label, glyph, row = true, pressed, className, type = "button", ...rest }: PlungerProps) {
  return (
    <button type={type} {...rest} data-pressed={pressed ? "true" : undefined} className={cx("plunger", row && "plunger-row", className)}>
      <span className="flex flex-col items-center" aria-hidden="true">
        <span className="plunger-cap">{glyph}</span>
        <span className="plunger-stem" />
        <span className="plunger-base" />
      </span>
      <span className="plunger-label">{label}</span>
    </button>
  );
}

type BrassProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: "md" | "sm";
  variant?: "brass" | "plain" | "danger";
  icon?: React.ReactNode;
  block?: boolean;
};

const brassClass = (size: "md" | "sm", variant: "brass" | "plain" | "danger", block?: boolean, className?: string) =>
  cx("brass", size === "sm" && "brass-sm", variant === "plain" && "brass-plain", variant === "danger" && "brass-danger", block && "w-full", className);

export function Brass({ size = "md", variant = "brass", icon, block, className, children, type = "button", ...rest }: BrassProps) {
  return (
    <button type={type} {...rest} className={brassClass(size, variant, block, className)}>
      {icon}
      <span>{children}</span>
    </button>
  );
}

export function BrassLink({
  href,
  size = "md",
  variant = "brass",
  icon,
  className,
  children,
}: {
  href: string;
  size?: "md" | "sm";
  variant?: "brass" | "plain" | "danger";
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={brassClass(size, variant, false, className)}>
      {icon}
      <span>{children}</span>
    </Link>
  );
}

/** The plunger as a link: for the one place a page sends the visitor to press. */
export function PlungerLink({ href, label, glyph, className }: { href: string; label: React.ReactNode; glyph?: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cx("plunger plunger-row no-underline", className)}>
      <span className="flex flex-col items-center" aria-hidden="true">
        <span className="plunger-cap">{glyph}</span>
        <span className="plunger-stem" />
        <span className="plunger-base" />
      </span>
      <span className="plunger-label">{label}</span>
    </Link>
  );
}
