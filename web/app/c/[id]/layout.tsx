// The route's own browser title, from the URL alone: no chain read, and a made-up id never reaches the title.
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const m = /^C?([1-9]\d{0,8})$/i.exec(id);
  return {
    title: m ? `Commission C${m[1]}` : "Commission",
    description: "One commission's room: the chess clock, the thread with every press stamped, the demo maker's next moves, and the result slip.",
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
