import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkInventory, extractSqlObjects } from "../scripts/neon/check-inventory.mjs";

const ownedDirectories: string[] = [];

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "neon-inventory-"));
  ownedDirectories.push(root);
  await mkdir(join(root, "lib"), { recursive: true });
  await mkdir(join(root, "supabase", "migrations"), { recursive: true });
  return root;
}

afterEach(async () => {
  await Promise.all(ownedDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("Neon dependency inventory", () => {
  it("rejects an unlisted temporary Supabase consumer", async () => {
    const root = await fixture();
    await writeFile(join(root, "lib", "consumer.ts"), 'import { createClient } from "@supabase/supabase-js";\n');
    await writeFile(join(root, "inventory.json"), "[]\n");

    const result = await checkInventory({ root, inventoryPath: "inventory.json", trackedFiles: ["lib/consumer.ts"] });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("unlisted Supabase consumer: lib/consumer.ts");
  });

  it("accepts a listed consumer with the required replacement record", async () => {
    const root = await fixture();
    await writeFile(join(root, "lib", "consumer.ts"), 'import type { SupabaseClient } from "@supabase/supabase-js";\n');
    await writeFile(join(root, "inventory.json"), JSON.stringify([{
      path: "lib/consumer.ts",
      kind: "runtime",
      task: 2,
      replacements: ["lib/db/client.ts"],
      status: "pending",
      evidence: ["type import: SupabaseClient"],
    }]));

    const result = await checkInventory({ root, inventoryPath: "inventory.json", trackedFiles: ["lib/consumer.ts"] });

    expect(result).toMatchObject({ ok: true, errors: [] });
  });

  it("rejects a SQL object missing from its migration evidence", async () => {
    const root = await fixture();
    const migration = "supabase/migrations/0001.sql";
    await writeFile(join(root, "supabase", "migrations", "0001.sql"), "create table public.audit_jobs (id uuid);\n");
    await writeFile(join(root, "inventory.json"), JSON.stringify([{
      path: migration,
      kind: "schema",
      task: 3,
      replacements: ["neon/migrations/0001_initial_schema.sql"],
      status: "pending",
      evidence: ["source migration"],
    }]));

    const result = await checkInventory({ root, inventoryPath: "inventory.json", trackedFiles: [migration] });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("unlisted SQL object in supabase/migrations/0001.sql: table:public.audit_jobs");
  });

  it("tracks named constraints and the full grant or revoke boundary", () => {
    const objects = extractSqlObjects(`
      alter table public.jobs add constraint jobs_owner_fkey foreign key (owner_id) references public.users(id);
      grant select, update on table public.jobs to service_role;
      revoke all on function public.claim_job(uuid) from public, anon;
      grant select on public.audit_jobs to anon;
      grant select on all tables in schema public to reporting_role;
    `);

    expect(objects).toContain("constraint:jobs_owner_fkey");
    expect(objects).toContain("grant-statement:grant select, update on table public.jobs to service_role;");
    expect(objects).toContain("revoke-statement:revoke all on function public.claim_job(uuid) from public, anon;");
    expect(objects).toContain("grant-statement:grant select on public.audit_jobs to anon;");
    expect(objects).toContain("grant-statement:grant select on all tables in schema public to reporting_role;");
  });

  it("does not inspect credential files", async () => {
    const root = await fixture();
    await writeFile(join(root, ".env.local"), "SECRET=@supabase/supabase-js\n");
    await writeFile(join(root, "inventory.json"), "[]\n");

    const result = await checkInventory({ root, inventoryPath: "inventory.json", trackedFiles: [".env.local"] });

    expect(result).toMatchObject({ ok: true, errors: [] });
  });
});
