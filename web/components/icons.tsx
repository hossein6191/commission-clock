// The few line icons the site uses, drawn on a 20-unit grid in the current colour. Decorative unless
// a label is given.

import * as React from "react";

type P = { size?: number; className?: string; label?: string };

function Svg({ size = 18, className, label, children }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {children}
    </svg>
  );
}

export const IconExternal = (p: P) => (
  <Svg {...p}>
    <path d="M11 4h5v5M16 4l-7 7M8 5H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3" />
  </Svg>
);
export const IconWallet = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="5" width="14" height="11" rx="2" />
    <path d="M13 10.5h4M3 8h11" />
  </Svg>
);
export const IconDrop = (p: P) => (
  <Svg {...p}>
    <path d="M10 3c3 4 5 6.3 5 9a5 5 0 0 1-10 0c0-2.7 2-5 5-9Z" />
  </Svg>
);
export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="m4.5 10.5 3.5 3.5 7.5-8" />
  </Svg>
);
export const IconRefresh = (p: P) => (
  <Svg {...p}>
    <path d="M15.5 8A6 6 0 0 0 4.6 6.5M4.5 12a6 6 0 0 0 10.9 1.5M4 3.5v3h3M16 16.5v-3h-3" />
  </Svg>
);
export const IconFlag = (p: P) => (
  <Svg {...p}>
    <path d="M5 17V3.5M5 4h9l-2.5 3.5L14 11H5" />
  </Svg>
);
export const IconPage = (p: P) => (
  <Svg {...p}>
    <path d="M6 3h6l4 4v10H6zM12 3v4h4M8.5 11h5M8.5 14h3.5" />
  </Svg>
);
export const IconArrow = (p: P) => (
  <Svg {...p}>
    <path d="M4 10h12M11 5l5 5-5 5" />
  </Svg>
);
export const IconDoor = (p: P) => (
  <Svg {...p}>
    <path d="M6 17V3.5h8V17M4 17h12M11.5 10.5h.01" />
  </Svg>
);
