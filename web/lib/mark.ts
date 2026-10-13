// The Commission Clock mark: a two-faced tournament clock in walnut, its left plunger up and its right
// one pressed, the lit face carrying a check. One drawing, used by the header (components/logo.tsx),
// the browser icon (app/icon.svg), the app icon and the share card.

export const WALNUT = "#5B3A29";
export const WALNUT_DEEP = "#3E2619";
export const AMBER = "#F2A93B";
export const FACE_DIM = "#E9DFC9";
export const FLAG = "#D7263D";
export const CREAM = "#F6EFDF";

/** The mark as SVG markup on a 32-unit grid. `tile` draws it on a cream rounded square. */
export function markSvg({ size = 32, tile = false }: { size?: number; tile?: boolean } = {}): string {
  const back = tile ? `<rect x="0" y="0" width="32" height="32" rx="7" fill="${CREAM}"/>` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">` +
    back +
    // the two plungers: left raised, right pressed down
    `<rect x="7" y="5" width="5" height="4" rx="1.4" fill="${WALNUT_DEEP}"/>` +
    `<rect x="20" y="7.4" width="5" height="1.8" rx="0.9" fill="${WALNUT_DEEP}"/>` +
    // the case
    `<path d="M3 11.5 Q3 9 5.5 9 H26.5 Q29 9 29 11.5 V25 Q29 27 27 27 H5 Q3 27 3 25 Z" fill="${WALNUT}"/>` +
    // the two faces: the left lit with a check, the right dim
    `<rect x="5.5" y="12.5" width="9.5" height="10" rx="2" fill="${AMBER}"/>` +
    `<rect x="17" y="12.5" width="9.5" height="10" rx="2" fill="${FACE_DIM}"/>` +
    `<path d="M7.6 17.6 L9.6 19.6 L13 15.6" fill="none" stroke="${WALNUT_DEEP}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>` +
    // the flag on the dim face
    `<path d="M24.2 14.2 V18.8" stroke="${WALNUT_DEEP}" stroke-width="0.9" stroke-linecap="round"/>` +
    `<path d="M24.2 14.3 L21.4 15.4 L24.2 16.5 Z" fill="${FLAG}"/>` +
    `</svg>`
  );
}

/** The mark as a data URI, for next/og images. */
export const markDataUri = (opts: { size?: number; tile?: boolean } = {}): string => "data:image/svg+xml;base64," + Buffer.from(markSvg(opts)).toString("base64");
