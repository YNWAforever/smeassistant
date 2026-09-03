import { ImageResponse } from "next/og";

import type { AuditJobRow } from "@sme-scanner/contracts";

import { loadOgFont } from "@/lib/og-font";
import { buildShareCardData, type ScoreBand } from "@/lib/share";
import { supabaseServer } from "@/lib/supabase/admin";

/**
 * Ported verbatim from upstream `apps/web/app/[locale]/r/[slug]/opengraph-image.tsx`
 * (only the imports moved: `@/lib/supabase` → `@/lib/supabase/admin`, `@/lib/types`
 * → `@sme-scanner/contracts`). It reads the legacy `module_scores` column, not
 * `module_results`, because the share card predates the coverage-aware payload.
 *
 * The page itself is `noindex` (see page.tsx); this card exists for deliberate
 * link shares, which noindex does not govern.
 */
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "SME Scanner visibility report";

const RING: Record<ScoreBand, string> = {
  good: "#16a34a",
  warn: "#f59e0b",
  critical: "#ef4444",
};
const ACCENT = "#3b6ea5";

export default async function Image({ params }: { params: Promise<{ slug: string; locale: string }> }) {
  const { slug, locale } = await params;

  let job: AuditJobRow | null = null;
  try {
    const { data } = await supabaseServer()
      .from("audit_jobs")
      .select("business_name, overall_score, module_scores")
      .eq("share_slug", slug)
      .single();
    job = (data as AuditJobRow) ?? null;
  } catch {
    job = null;
  }

  const card = buildShareCardData(job);
  const isZh = locale !== "en";
  const tagline = isZh ? "你間舖 AI、Google、IG 搵唔搵到？" : "Can AI, Google & Instagram find your business?";
  const moduleLabel = { ig: "Instagram", gbp: "Google", aeo: "AI" };

  // Load CJK glyphs only for the text we actually draw.
  const glyphs = `${card.businessName}${tagline}可見度評分報告${moduleLabel.aeo}`;
  const [bold, regular] = await Promise.all([loadOgFont(glyphs, 700), loadOgFont(glyphs, 400)]);
  const fonts = [bold, regular].filter(Boolean) as NonNullable<Awaited<ReturnType<typeof loadOgFont>>>[];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64, background: "linear-gradient(135deg,#eef3f8,#ffffff)", fontFamily: "Noto Sans HK, sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 220, height: 220, borderRadius: 220, border: `16px solid ${RING[card.band]}`, flexShrink: 0 }}>
            <div style={{ display: "flex", fontSize: 96, fontWeight: 700, color: "#111827", lineHeight: 1 }}>{card.found ? card.score : "–"}</div>
            <div style={{ display: "flex", fontSize: 28, color: "#6b7280" }}>/ 100</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 52, fontWeight: 700, color: "#111827" }}>{card.found ? card.businessName : "SME Scanner"}</div>
            <div style={{ display: "flex", fontSize: 30, color: "#6b7280", marginTop: 12 }}>{tagline}</div>
            {card.found && (
              <div style={{ display: "flex", gap: 16, marginTop: 24 }}>
                {card.modules.map((m) => (
                  <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 8, background: "#eef3f8", color: ACCENT, borderRadius: 999, padding: "8px 18px", fontSize: 26, fontWeight: 700 }}>
                    {`${moduleLabel[m.key]} ${m.score}`}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", color: ACCENT, fontSize: 28, fontWeight: 700, letterSpacing: 1 }}>FIMMICK · SME SCANNER</div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
