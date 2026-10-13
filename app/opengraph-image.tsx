import { ImageResponse } from "next/og";

import { loadOgFont } from "@/lib/og-font";

/**
 * Default Open Graph card for every page that does not render its own
 * (the report card lives at app/[locale]/r/[slug]/opengraph-image.tsx).
 * Colours are the public site's ink and orange tokens; no external images.
 */
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "SME Scanner Visibility Workspace";

const INK = "#18181b";
const LIME = "#f39a3d";
const MUTED = "#c9c4bf";

const brand = "SME Scanner";
const byline = "BY FIMMICK";
const headline = ["Evidence first,", "action next."];
const subtitle = "證據為先，行動為本。";
const proof = ["Evidence before score", "Owner-approved actions", "Comparable re-scans"];
const markets = "Hong Kong · Taiwan";

export default async function Image() {
  // Subset every glyph drawn; a glyph missing from the subset falls back to
  // another face, which is what made letters switch weight mid-word.
  const glyphs = [brand, byline, ...headline, subtitle, ...proof, markets].join("");
  const font = await loadOgFont(glyphs, 700);
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
          background: `radial-gradient(circle at 88% 0%, rgba(202,243,106,.28), transparent 46%), radial-gradient(circle at 0% 100%, rgba(202,243,106,.12), transparent 40%), ${INK}`,
          color: "#ffffff",
          fontFamily: font ? font.name : "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", width: 64, height: 64, alignItems: "center", justifyContent: "center", borderRadius: 18, background: LIME }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: -1 }}>{brand}</div>
            <div style={{ fontSize: 16, color: LIME, letterSpacing: 3 }}>{byline}</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 92, fontWeight: 700, lineHeight: 1, letterSpacing: -3.5, color: LIME }}>
            {headline.map((line) => <div key={line}>{line}</div>)}
          </div>
          <div style={{ fontSize: 40, color: "#ffffff", letterSpacing: 2 }}>{subtitle}</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 12 }}>
            {proof.map((item) => (
              <div key={item} style={{ display: "flex", padding: "10px 16px", border: "1px solid rgba(255,255,255,.18)", borderRadius: 999, fontSize: 20, color: MUTED }}>{item}</div>
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 22, color: MUTED, whiteSpace: "nowrap" }}>{markets}</div>
        </div>
      </div>
    ),
    { ...size, fonts: font ? [{ name: font.name, data: font.data, weight: 700, style: "normal" }] : undefined },
  );
}
