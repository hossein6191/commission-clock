import { BrassLink } from "@/components/button";

export default function NotFound() {
  return (
    <div className="flex max-w-2xl flex-col items-start gap-3">
      <p className="kicker text-ink-3">404 · not on this board</p>
      <h1 className="text-5xl">Nothing here</h1>
      <p className="text-ink-2">This address is not part of the site. Studios live under /studios/S1, commissions under /c/C1.</p>
      <BrassLink href="/" className="mt-2">
        Back to the table
      </BrassLink>
    </div>
  );
}
