// Site settings. One place for the contract address, the name, the tagline, the repository and the
// commit the demo drafts are pinned to.
//
// DEMO_CONTRACT is the deployed copy the site reads when NEXT_PUBLIC_CONTRACT is unset. While both are
// empty every page says the contract is not deployed yet, and the whole site still works with
// NEXT_PUBLIC_MOCK=1.
//
// THE ONE PLACE TO SET THE REGISTER: this site speaks contract version 2 (stages, appeals, credit), so it
// needs a register deployed from contracts/commission_clock.py at version 2. The one-stage register of
// the first on-chain run (0xA1D5A82406a34ee95bc07e4258116dCbE40a9385, version 1) does not take the
// ninth argument of open_studio and has no stages, appeals or credit, so it is not used here.
export const DEMO_CONTRACT: string = "0x7f0b6085DBd9ec096831D885E636f52cEf193e6F";

/**
 * The commit of the public repository whose drafts/ the demo maker delivers, as raw.githubusercontent.com
 * serves them: every validator fetches the same bytes. Filled in once the repository is pushed;
 * NEXT_PUBLIC_DRAFTS_COMMIT overrides it. While both are empty the demo maker can talk but not deliver.
 */
export const DRAFTS_COMMIT: string = "9124575d850db56b8aa230f88f312eba67592253";

export const SITE_NAME = "Commission Clock";
export const SITE_TAGLINE = "The clock runs only against the side that holds the move.";
export const SITE_LINE =
  "A commission escrow with a chess clock: after every message the validators decide whose move it is now, the clock runs only against that side, and the late cut comes out of the fee by the seconds each side actually owed.";

/**
 * The public source repository. No account name is written into the repository: NEXT_PUBLIC_REPO_URL
 * names it, and on Vercel the repository the site was built from names it by itself (its system
 * variables NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER and _SLUG). The footer's Source link is hidden while
 * neither names one, and so is the demo maker's delivery, which needs the repository to build its
 * pinned page addresses.
 */
const builtFrom =
  process.env.NEXT_PUBLIC_VERCEL_GIT_PROVIDER === "github" && process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER && process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG
    ? `https://github.com/${process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER}/${process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG}`
    : "";
export const REPO_URL: string = process.env.NEXT_PUBLIC_REPO_URL || builtFrom || "";

/** The demo studio's id when the site's server cannot name it (no key); NEXT_PUBLIC_DEMO_STUDIO overrides. */
export const DEMO_STUDIO_ID: string = "";
/** The three-stage demo studio's id when the site's server cannot name it; NEXT_PUBLIC_DEMO_STAGED overrides. */
export const DEMO_STAGED_ID: string = "";

/** The contract in use: the deploy's environment first, then the committed address. */
export const contractAddress = (): string => process.env.NEXT_PUBLIC_CONTRACT || DEMO_CONTRACT || "";

/** The commit the demo drafts are pinned to: 40 lowercase hex characters, or "". */
export const draftsCommit = (): string => {
  const c = (process.env.NEXT_PUBLIC_DRAFTS_COMMIT || DRAFTS_COMMIT || "").trim();
  return /^[0-9a-f]{40}$/.test(c) ? c : "";
};

/** The demo studio's id when the site's server cannot name it. */
export const demoStudioFallback = (): string => process.env.NEXT_PUBLIC_DEMO_STUDIO || DEMO_STUDIO_ID || "";

/** The three-stage demo studio's id when the site's server cannot name it. */
export const demoStagedFallback = (): string => process.env.NEXT_PUBLIC_DEMO_STAGED || DEMO_STAGED_ID || "";
