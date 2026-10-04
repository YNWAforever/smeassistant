import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// P4.6 (docs/superpowers/specs/2026-10-04-gbp-reply-publish-design.md §1.5): 0014 re-creates
// export_output_version with exactly the enumerated changes (a)-(c), so a version counts at most once
// across export and verified publish (DEC-14). The function counts billable deliveries for every
// workspace, so everything else in its text must stay byte-for-byte as in 0011.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name: string) =>
  readFileSync(path.join(repoRoot, "neon/migrations", name), "utf8").replaceAll("\r\n", "\n");
const offers = read("0011_offers.sql");
const publish = read("0014_publish_reply.sql");

// Copied from offer-sql.test.ts: the whole statement, from CREATE OR REPLACE through the closing
// $function$; (signature, RETURNS, LANGUAGE, search_path and body), plus the REVOKE and GRANT after it.
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

/** Replace `from` with `to`, asserting `from` occurs exactly once (each edit is one enumerated change). */
function edit(text: string, label: string, from: string, to: string): string {
  expect(occurrences(text, from), `${label} matches exactly once`).toBe(1);
  return text.replace(from, () => to);
}

describe("0014 export_output_version re-creation", () => {
  it("export_output_version in 0014 equals the 0011 text after applying exactly changes (a)-(c)", () => {
    let expected = only(offers, "export_output_version");

    // (a) a new local `counts`, true only for a first export of a version that was never published.
    expected = edit(expected, "(a) declare counts", "  first_export boolean;\n", "  first_export boolean;\n  counts boolean;\n");
    expected = edit(
      expected,
      "(a) counts assignment, allowance and usage block on counts",
      "  first_export := v.first_exported_at is null;\n\n  if first_export then\n",
      "  first_export := v.first_exported_at is null;\n  counts := first_export and v.first_published_at is null;\n\n  if counts then\n",
    );
    // (b) first_exported_at still runs on first_export, in its own block, and never downgrades published.
    expected = edit(
      expected,
      "(b) first_exported_at on first_export, published kept",
      "    where workspace_id = v.workspace_id and period = usage_period;\n\n    update public.output_versions\n    set first_exported_at = now(), delivery_state = 'exported'\n    where id = v.id;\n  end if;\n",
      "    where workspace_id = v.workspace_id and period = usage_period;\n  end if;\n\n  if first_export then\n    update public.output_versions\n    set first_exported_at = now(),\n        delivery_state = case when v.delivery_state = 'published' then 'published' else 'exported' end\n    where id = v.id;\n  end if;\n",
    );
    // (a) deliveries.counted and the audit counted field use counts.
    expected = edit(
      expected,
      "(a) deliveries.counted",
      "values (v.workspace_id, v.id, p_mode, 'exported', first_export, p_idempotency_key,",
      "values (v.workspace_id, v.id, p_mode, 'exported', counts, p_idempotency_key,",
    );
    expected = edit(
      expected,
      "(a) audit counted",
      "'counted', first_export, 'idempotency_key', p_idempotency_key));",
      "'counted', counts, 'idempotency_key', p_idempotency_key));",
    );
    // (c) the return value's counted uses counts.
    expected = edit(
      expected,
      "(c) return counted",
      "'counted', first_export, 'state', 'exported');",
      "'counted', counts, 'state', 'exported');",
    );

    expect(only(publish, "export_output_version")).toBe(expected);
  });

  it("0014 lists the changes (a)-(c) in a comment above the export re-creation", () => {
    const comment = publish.slice(0, publish.indexOf("CREATE OR REPLACE FUNCTION public.export_output_version("));
    for (const label of ["(a)", "(b)", "(c)"]) expect(comment).toContain(label);
  });

  it("0014 defines the three new functions exactly once each, with REVOKE and GRANT", () => {
    const signatures: Record<string, string> = {
      begin_publish_output_version: "p_version_id uuid, p_actor uuid, p_target_ref text, p_idempotency_key text",
      finish_publish_output_version: "p_delivery_id uuid, p_actor uuid, p_outcome text, p_receipt jsonb, p_reason text",
      cancel_published_reply: "p_delivery_id uuid, p_actor uuid",
    };
    for (const [name, args] of Object.entries(signatures)) {
      const definition = only(publish, name);
      expect(definition).toContain(`CREATE OR REPLACE FUNCTION public.${name}(${args})\n RETURNS jsonb\n LANGUAGE plpgsql\n SET search_path TO ''\nAS $function$\n`);
      expect(definition).not.toMatch(/SECURITY DEFINER/i);
      expect(definition).toContain(`REVOKE ALL ON FUNCTION public.${name}(${args}) FROM PUBLIC;\n`);
      expect(definition).toContain(`GRANT EXECUTE ON FUNCTION public.${name}(${args}) TO sme_app_runtime;\n`);
    }
  });

  it("0014 re-creates no other function", () => {
    const created = [...publish.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]).sort();
    expect(created).toEqual(
      ["begin_publish_output_version", "cancel_published_reply", "export_output_version", "finish_publish_output_version"].sort(),
    );
  });
});
