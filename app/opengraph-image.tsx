import { ImageResponse } from "next/og";

import { loadOgFont } from "@/lib/og-font";

/**
 * Default Open Graph card for every page that does not render its own
 * (the report card lives at app/[locale]/r/[slug]/opengraph-image.tsx).
 * Brand colours match the product tokens; no external assets are fetched.
 */
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "SME Scanner Visibility Workspace";

export default async function Image() {
  const title = "SME Scanner";
  const subtitle = "Visibility Workspace · 證據為先，行動為本。";
  const font = await loadOgFont(`${title}${subtitle}`, 700);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #173b34 0%, #0f2a25 100%)",
          color: "#fffefa",
          fontFamily: font ? font.name : "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "#7fd0ba" }} />
          <div style={{ fontSize: 40, fontWeight: 700 }}>{title}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.05 }}>Evidence first, action next.</div>
          <div style={{ fontSize: 30, color: "#bdd0cb" }}>{subtitle}</div>
        </div>
        <div style={{ fontSize: 24, color: "#7fd0ba" }}>Hong Kong · Taiwan · zh-HK · zh-TW · en</div>
      </div>
    ),
    { ...size, fonts: font ? [{ name: font.name, data: font.data, weight: 700, style: "normal" }] : [] },
  );
}
