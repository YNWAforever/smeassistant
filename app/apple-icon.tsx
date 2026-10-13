import { ImageResponse } from "next/og";

/** Home-screen icon: the header's lime brand mark with its magnifier, on the public ink. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#caf36a" }}>
        <svg width="104" height="104" viewBox="0 0 24 24" fill="none" stroke="#172019" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </div>
    ),
    size,
  );
}
