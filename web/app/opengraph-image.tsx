import { ImageResponse } from "next/og";

import { SITE_TAGLINE } from "@/lib/config";
import { clockFonts } from "@/lib/og-fonts";
import { AMBER, CREAM, FACE_DIM, FLAG, WALNUT, WALNUT_DEEP, markDataUri } from "@/lib/mark";

export const alt = "Commission Clock: a chess clock for commissions. The validators decide whose move it is; the clock runs only against that side.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TITLE = "Commission Clock";
const LINE = SITE_TAGLINE;
const SUB = "The validators decide whose move it is after every message.";

// The share card: the cream table with its checkered corner, the walnut clock with the maker's face
// lit and the client's flag still up, and the promise in one line.
export default async function OpenGraphImage() {
  const fonts = await clockFonts(TITLE + LINE + SUB + "MAKERCLIENT0123456789:-");
  const heading = fonts.length ? "Bricolage Grotesque" : "sans-serif";
  const mono = fonts.length ? "Share Tech Mono" : "monospace";
  const squares = [];
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) if ((r + c) % 2 === 0) squares.push({ x: 1200 - (c + 1) * 64, y: r * 64, o: Math.max(0, 0.09 - (r + c) * 0.009) });
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", backgroundColor: "#F3EBDC", fontFamily: heading }}>
        {squares.map((s, i) => (
          <div key={i} style={{ position: "absolute", left: s.x, top: s.y, width: 64, height: 64, backgroundColor: `rgba(91,58,41,${s.o})` }} />
        ))}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 0 0 72px", width: 560 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <img src={markDataUri({ size: 72 })} width={72} height={72} alt="" />
            <div style={{ fontSize: 50, fontWeight: 800, color: "#2A1D15", letterSpacing: -1 }}>{TITLE}</div>
          </div>
          <div style={{ marginTop: 34, fontSize: 44, fontWeight: 800, lineHeight: 1.08, color: WALNUT, letterSpacing: -1 }}>{LINE}</div>
          <div style={{ marginTop: 22, fontSize: 26, color: "#574638", lineHeight: 1.3 }}>{SUB}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", marginLeft: 30 }}>
          <div style={{ display: "flex", position: "relative", width: 520, paddingTop: 40 }}>
            <div style={{ position: "absolute", left: 60, top: 6, width: 150, height: 40, borderRadius: 14, backgroundColor: WALNUT_DEEP }} />
            <div style={{ position: "absolute", right: 60, top: 26, width: 150, height: 20, borderRadius: 10, backgroundColor: WALNUT_DEEP }} />
            <div style={{ display: "flex", gap: 22, padding: "38px 28px 30px", width: 520, borderRadius: "48px 48px 22px 22px", backgroundColor: WALNUT }}>
              <div style={{ display: "flex", flexDirection: "column", flex: 1, borderRadius: 18, padding: "16px 18px", backgroundColor: AMBER }}>
                <div style={{ fontSize: 18, letterSpacing: 4, color: WALNUT_DEEP }}>MAKER</div>
                <div style={{ fontSize: 76, fontFamily: mono, color: WALNUT_DEEP, marginTop: 6 }}>12:04</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", flex: 1, borderRadius: 18, padding: "16px 18px", backgroundColor: FACE_DIM, position: "relative" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, letterSpacing: 4, color: "#A5927B" }}>
                  <span>CLIENT</span>
                  <div style={{ display: "flex", width: 0, height: 0, borderTop: "10px solid transparent", borderBottom: "10px solid transparent", borderRight: `24px solid ${FLAG}` }} />
                </div>
                <div style={{ fontSize: 76, fontFamily: mono, color: "#A5927B", marginTop: 6 }}>10:00</div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", marginTop: 26, fontSize: 22, color: "#574638", backgroundColor: CREAM, border: "2px solid #C8B593", borderRadius: 999, padding: "8px 18px", alignSelf: "flex-start" }}>
            GenLayer Intelligent Contract · Studio
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
