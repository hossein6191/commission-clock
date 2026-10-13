import { ImageResponse } from "next/og";

import { markDataUri } from "@/lib/mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// The app icon: the two-faced clock with its check, on a cream tile.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#F6EFDF" }}>
        <img src={markDataUri({ size: 150 })} width={150} height={150} alt="" />
      </div>
    ),
    size,
  );
}
