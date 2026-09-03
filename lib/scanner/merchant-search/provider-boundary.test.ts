import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const merchantSearchRoot = dirname(fileURLToPath(import.meta.url));
const routePath = resolve(merchantSearchRoot, "../../../app/api/business/search/route.ts");

function typescriptFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return typescriptFiles(path);
    return entry.isFile() && path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
  });
}

describe("merchant search provider boundary", () => {
  it("does not reference the official Google Places API in the route or service tree", () => {
    const source = [...typescriptFiles(merchantSearchRoot), routePath]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(source).not.toContain("maps.googleapis.com/maps/api/place/textsearch");
    expect(source).not.toContain("GOOGLE_PLACES_KEY");
    expect(source).not.toContain("searchGooglePlacesCandidates");
  });
});
