import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { checkInventory, extractSqlObjects } from "../scripts/neon/check-inventory.mjs";

const ownedDirectories: string[] = [];
const execFileAsync = promisify(execFile);

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


  it("tracks concrete DROP constraint and index objects without treating IF EXISTS as a name", () => {
    const objects = extractSqlObjects(`
      alter table public.workspaces drop constraint if exists workspaces_owner_identity_check;
      drop index if exists public.workspaces_owner_user_id_key;
      drop index if exists public.workspaces_owner_email_key;
    `);

    expect(objects).toContain("constraint:workspaces_owner_identity_check");
    expect(objects).toContain("index:public.workspaces_owner_user_id_key");
    expect(objects).toContain("index:public.workspaces_owner_email_key");
    expect(objects).not.toContain("constraint:if");
  });

  it.each([
    ["path", 42, "record 0 has invalid path"],
    ["replacements", ["valid", 42], "record 0 has invalid replacements"],
    ["evidence", ["valid", false], "record 0 has invalid evidence"],
  ])("rejects malformed %s values", async (field, value, expectedError) => {
    const root = await fixture();
    const record = {
      path: "lib/consumer.ts",
      kind: "runtime",
      task: 2,
      replacements: ["lib/db/client.ts"],
      status: "pending",
      evidence: ["tracked @supabase reference"],
      [field]: value,
    };
    await writeFile(join(root, "inventory.json"), JSON.stringify([record]));

    const result = await checkInventory({ root, inventoryPath: "inventory.json", trackedFiles: [] });

    expect(result.errors).toContain(expectedError);
  });

  it("uses real Git enumeration and covers its tracked self-test consumer", async () => {
    const root = await fixture();
    await mkdir(join(root, "tests"), { recursive: true });
    await writeFile(join(root, "tests", "neon-inventory.test.ts"), 'import { createClient } from "@supabase/supabase-js";\n');
    await writeFile(join(root, "inventory.json"), JSON.stringify([{
      path: "tests/neon-inventory.test.ts",
      kind: "test",
      task: 1,
      replacements: ["scripts/neon/check-inventory.mjs"],
      status: "pending",
      evidence: ["inventory checker self-test"],
    }]));
    await execFileAsync("git", ["init", "--quiet"], { cwd: root });
    await execFileAsync("git", ["add", "inventory.json", "tests/neon-inventory.test.ts"], { cwd: root });

    await expect(checkInventory({ root, inventoryPath: "inventory.json" })).resolves.toMatchObject({ ok: true, errors: [] });
  });

  it("fails closed when real Git enumeration fails", async () => {
    const root = await fixture();
    await writeFile(join(root, "inventory.json"), "[]\n");

    await expect(checkInventory({ root, inventoryPath: "inventory.json" })).rejects.toThrow();
  });

  it("does not inspect credential files", async () => {
    const root = await fixture();
    await writeFile(join(root, ".env.local"), "SECRET=@supabase/supabase-js\n");
    await writeFile(join(root, "inventory.json"), "[]\n");

    const result = await checkInventory({ root, inventoryPath: "inventory.json", trackedFiles: [".env.local"] });

    expect(result).toMatchObject({ ok: true, errors: [] });
  });
});
