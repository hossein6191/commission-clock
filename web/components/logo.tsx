// The mark (lib/mark.ts) beside the name, as the header prints it.

import { markSvg } from "@/lib/mark";

export function Mark({ size = 34 }: { size?: number }) {
  // The same drawing as the browser icon, inlined so it needs no request.
  return <span aria-hidden="true" className="inline-block shrink-0" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: markSvg({ size }) }} />;
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <Mark />
      <span className="display text-[21px] leading-none font-extrabold tracking-tight text-ink sm:text-[23px]">
        Commission <span className="text-walnut">Clock</span>
      </span>
    </span>
  );
}
