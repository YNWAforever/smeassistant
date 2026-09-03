// Legacy UA makes Google Fonts serve TTF (Satori cannot parse woff2).
const LEGACY_UA =
  "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; en-us) AppleWebKit/534.50";

export interface OgFont {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700;
  style: "normal";
}

/**
 * Fetch a Noto Sans HK subset (TTF) covering exactly `text`, at one weight.
 * Returns null on any failure so the OG route can still render (Latin only).
 */
export async function loadOgFont(text: string, weight: 400 | 700): Promise<OgFont | null> {
  try {
    const api = `https://fonts.googleapis.com/css2?family=Noto+Sans+HK:wght@${weight}&text=${encodeURIComponent(text)}`;
    const cssRes = await fetch(api, { headers: { "User-Agent": LEGACY_UA } });
    if (!cssRes.ok) return null;
    const css = await cssRes.text();
    const url = css.match(/src:\s*url\(([^)]+)\)\s*format\(['"]?truetype/)?.[1]
      ?? css.match(/src:\s*url\(([^)]+)\)/)?.[1];
    if (!url) return null;
    const fontRes = await fetch(url);
    if (!fontRes.ok) return null;
    return { name: "Noto Sans HK", data: await fontRes.arrayBuffer(), weight, style: "normal" };
  } catch {
    return null;
  }
}
