import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// P4.1 (docs/superpowers/specs/2026-10-01-offers-promotion-copy-design.md 1.4): 0011 re-creates
// approve_output_version and export_output_version with exactly one added statement. These two
// functions count billable deliveries for every workspace, so everything else in their text must stay
// byte-for-byte as in 0004. verifyCatalog no longer deep-equals them, so this test pins them.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name: string) =>
  readFileSync(path.join(repoRoot, "neon/migrations", name), "utf8").replaceAll("\r\n", "\n");
const legacy = read("0004_atomic_operations.sql");
const offers = read("0011_offers.sql");

const GUARD = "  perform public.offer_current_for_version(v);\n";
const NOT_FOUND = "    raise exception using errcode = 'P0001', message = 'version_not_found';\n  end if;\n";

// The whole statement, from CREATE OR REPLACE through the closing $function$; (signature, RETURNS,
// LANGUAGE, search_path and body), plus the REVOKE and GRANT that follow it.
function definitions(sql: string, name: string): string[] {
  const pattern = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$function\\$;\\n\\nREVOKE ALL ON FUNCTION public\\.${name}\\([^\\n]*\\nGRANT EXECUTE ON FUNCTION public\\.${name}\\([^\\n]*\\n`,
    "g",
  );
  return sql.match(pattern) ?? [];
}

function only(sql: string, name: string): string {
  const found = definitions(sql, name);
  expect(found, `${name} is defined exactly once`).toHaveLength(1);
  return found[0];
}

const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe("0011 approve/export re-creation", () => {
  for (const name of ["approve_output_version", "export_output_version"]) {
    it(`${name} is the 0004 definition plus exactly one guard line`, () => {
      const before = only(legacy, name);
      const after = only(offers, name);
      expect(occurrences(after, GUARD)).toBe(1);
      expect(after.replace(GUARD, "")).toBe(before);
    });

    it(`${name} calls the guard directly after the version_not_found check that follows FOR UPDATE`, () => {
      const after = only(offers, name);
      const lock = "select * into v from public.output_versions where id = p_version_id for update;\n  if not found then\n";
      expect(occurrences(after, lock)).toBe(1);
      expect(after).toContain(lock + NOT_FOUND + GUARD);
    });
  }

  it("export_output_version calls the guard after the idempotency-key early return", () => {
    const after = only(offers, "export_output_version");
    const existing = after.indexOf("select * into existing from public.deliveries where idempotency_key = p_idempotency_key;");
    const returnExisting = after.indexOf("return jsonb_build_object('kind', 'existing'");
    const guard = after.indexOf(GUARD);
    expect(existing).toBeGreaterThan(0);
    expect(returnExisting).toBeGreaterThan(existing);
    expect(guard).toBeGreaterThan(returnExisting);
  });

  it("offer_current_for_version is defined once with restated REVOKE and GRANT", () => {
    expect(offers).toContain("CREATE OR REPLACE FUNCTION public.offer_current_for_version(v public.output_versions)");
    expect(offers).toContain("REVOKE ALL ON FUNCTION public.offer_current_for_version(v public.output_versions) FROM PUBLIC;");
    expect(offers).toContain(
      "GRANT EXECUTE ON FUNCTION public.offer_current_for_version(v public.output_versions) TO sme_app_runtime;",
    );
    // The guard is defined before the functions that call it.
    expect(offers.indexOf("FUNCTION public.offer_current_for_version")).toBeLessThan(
      offers.indexOf("FUNCTION public.approve_output_version"),
    );
  });
});
