import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards a class of defect rather than three individual strings: an interface
 * asserting the product will DO something, where no code path does it.
 *
 * Four had shipped -- the unlock form's "we send a secure report link", a paid
 * plan advertising "scheduled comparable rescans", three notification-email
 * switches promising mail, and onboarding telling the owner to "reply to the
 * report email you received". Each cost the same thing: the owner waits for
 * something that never arrives, with no way to tell that it never will.
 *
 * Each entry below pairs the banned copy with a detector for the capability it
 * claims. When the capability genuinely lands, the detector trips and this test
 * fails ON PURPOSE -- that is the prompt to delete the entry and put the honest
 * promise back, rather than leaving a stale ban in place forever.
 */
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function sourceFiles(dir: string, extensions: readonly string[]): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(path, extensions);
    if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) return [];
    return extensions.some((extension) => entry.name.endsWith(extension)) ? [path] : [];
  });
}

/** Every surface that can put words in front of an owner. */
function uiSources(): string[] {
  return [
    ...sourceFiles(join(repoRoot, "components"), [".ts", ".tsx"]),
    ...sourceFiles(join(repoRoot, "lib", "messages"), [".json"]),
    join(repoRoot, "lib", "copy.ts"),
    join(repoRoot, "lib", "copy-workspace.ts"),
  ].filter((file) => existsSync(file));
}

/** Anything that could implement a promise: routes, repositories, config. */
function backendSources(): string[] {
  return [...sourceFiles(join(repoRoot, "app"), [".ts", ".tsx"]), ...sourceFiles(join(repoRoot, "lib"), [".ts"])];
}

function backendMatches(pattern: RegExp): boolean {
  return backendSources().some((file) => pattern.test(readFileSync(file, "utf8")));
}

/** Migrations are where an age-based retention job would have to live to run at all. */
function migrationMatches(pattern: RegExp): boolean {
  return sourceFiles(join(repoRoot, "neon", "migrations"), [".sql"]).some((file) => pattern.test(readFileSync(file, "utf8")));
}

/**
 * Only what an owner can read counts. A comment explaining which promise was
 * removed -- and quoting it, as the ones next to these fixes do -- must not
 * read as the product making that promise again.
 *
 * `//` is stripped only at the start of a line, so a `https://` inside a
 * single-line JSX attribute cannot swallow the copy that follows it.
 */
function copyOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
}

interface Promised {
  capability: string;
  /** True once the product can actually keep the promise. */
  implemented: () => boolean;
  /** Lower-cased needles; matched case-insensitively against every UI source. */
  banned: readonly string[];
}

const PROMISES: readonly Promised[] = [
  {
    // `scan_schedules` rows are written by the rescan route and read only for
    // display. Nothing selects due rows, and CLAUDE.md forbids adding a second
    // scheduler here ("Do not ... add a second scheduler", "No ... automatic
    // re-scan promises"), so the copy is what has to match the code.
    capability: "a dispatcher that runs due scan_schedules rows",
    implemented: () => {
      const vercelConfig = join(repoRoot, "vercel.json");
      const crons = existsSync(vercelConfig) && "crons" in (JSON.parse(readFileSync(vercelConfig, "utf8")) as Record<string, unknown>);
      return crons || existsSync(join(repoRoot, "app", "api", "cron")) || backendMatches(/next_run_at\s*<|selectNextRunnable|enqueueScheduledScans/);
    },
    banned: [
      "scheduled comparable rescans",
      "scheduled rescans",
      "monthly rescans",
      "schedules a re-scan",
      "定期可比較重新掃描",
      "定期重新掃描",
      "每月重新掃描",
    ],
  },
  {
    // No mail library is even installed, and `notification_events` -- the
    // per-job email log -- has no writer. The three notify_* switches persist a
    // preference and nothing else.
    capability: "an outbound notification email sender",
    implemented: () => {
      const manifest = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
      const installed = Object.keys(manifest.dependencies ?? {}).some((name) => /^(resend|nodemailer|postmark|@aws-sdk\/client-ses)$/.test(name));
      return installed || backendMatches(/from "resend"|require\("resend"\)|nodemailer|postmark/);
    },
    banned: [
      "emails are sent only for the events you choose",
      "one email when a scan finishes",
      "you will be emailed",
      "reply to the report email",
      "電郵只在你選擇的事件發生時寄出",
      "每次掃描完成後一封電郵",
      "你會收到電郵",
      "回覆你收到的報告電郵",
    ],
  },
  {
    // Fix Pack drafts are `agent_runs` rows. This app reads them and PATCHes
    // their status, but never creates one -- CLAUDE.md section 3.7: "do not
    // write to `agent_runs` from this app's agents (v1)". The upstream
    // generator (plan-fix-pack / generate-fix-pack) was never ported either, so
    // no scan can populate the card however long an owner waits.
    capability: "anything in this app that creates a Fix Pack draft",
    implemented: () =>
      backendMatches(/insert\s+into\s+agent_runs/i) ||
      existsSync(join(repoRoot, "lib", "agents", "generate-fix-pack.ts")) ||
      existsSync(join(repoRoot, "lib", "agents", "plan-fix-pack.ts")),
    banned: [
      "drafts appear here after a paid-tier scan completes",
      "drafted from scan findings",
      "付費方案的掃描完成後，草稿會在這裡出現",
      "由掃描發現生成的回覆及帖文",
      // Naming a supplier is the same promise one level up. Fimmick's staff
      // tooling writes the legacy Supabase database; this app's only pool is
      // Neon (no Supabase client remains, and test:no-supabase enforces that),
      // and NEON-CUTOVER.md requires an "empty application-data" target -- so
      // no external actor can deliver a draft here either.
      "prepared for you by the fimmick team",
      "由 fimmick 團隊為你準備",
    ],
  },
  {
    // /trust published a retention schedule -- scan evidence 12 months, agent
    // inputs/outputs 24, audit events 24 -- that nothing enforced. No cron
    // route, no pg_cron, no TTL and no scheduled function in migrations
    // 0001-0005; the only DELETEs in the app are per-job evidence replacement
    // and membership removal. It also contradicted /legal/privacy, which says
    // the schedule is still being finalised.
    //
    // The periods themselves are Willy's to set (CLAUDE.md section 5 lists them
    // as an open question). Publishing them as though they already ran was not
    // a policy decision, which is why this is a code guard and not a choice
    // made on his behalf.
    capability: "anything that deletes stored data once it reaches an age",
    implemented: () =>
      existsSync(join(repoRoot, "app", "api", "cron")) ||
      migrationMatches(/pg_cron|cron\.schedule/i) ||
      backendMatches(/DELETE\s+FROM\s+[\s\S]{0,160}?(now\(\)\s*-\s*interval|older_than|retention_days)/i),
    // Only the periods are banned, not the question. "How long we keep it" /
    // 保留多久 is an honest heading on /legal/privacy, whose body says the
    // schedule is still being finalised -- banning that wording would push the
    // product towards not raising the subject at all, which is the opposite of
    // the point. (The first draft of this entry did ban it, and the guard
    // caught it.)
    banned: [
      "retained for 12 months",
      "retained for 24 months",
      "removed on request",
      "保留 12 個月",
      "保留 24 個月",
    ],
  },
];

/**
 * The same rule read the other way. These promises ARE kept, and the check
 * exists so they stay kept: delete the capability and the copy quietly starts
 * lying again, which is exactly how "you can disconnect at any time in
 * settings" survived for so long next to no disconnect at all.
 */
const KEPT: ReadonlyArray<{ promise: string; requires: string; exists: () => boolean }> = [
  {
    promise: "the owner can disconnect the Google Business Profile connection",
    requires: "DELETE /api/workspaces/[workspaceId]/google-connection and a repository that revokes it",
    exists: () =>
      existsSync(join(repoRoot, "app", "api", "workspaces", "[workspaceId]", "google-connection", "route.ts")) &&
      /disconnectGoogleConnection/.test(readFileSync(join(repoRoot, "lib", "repositories", "claims.ts"), "utf8")),
  },
];

describe("promises the interface keeps", () => {
  for (const kept of KEPT) {
    it(`still implements: ${kept.promise}`, () => {
      expect({ promise: kept.promise, implemented: kept.exists() }).toEqual({ promise: kept.promise, implemented: true });
    });
  }
});

describe("promises the interface makes", () => {
  for (const promise of PROMISES) {
    it(`does not claim ${promise.capability} while none exists`, () => {
      if (promise.implemented()) {
        throw new Error(
          `${promise.capability} now exists. Revisit the copy this guard bans and delete this entry -- the promise may finally be honest.`,
        );
      }
      const offenders = uiSources().flatMap((file) => {
        const source = copyOnly(readFileSync(file, "utf8")).toLowerCase();
        return promise.banned
          .filter((needle) => source.includes(needle.toLowerCase()))
          .map((needle) => `${relative(repoRoot, file)}: ${needle}`);
      });
      expect(offenders).toEqual([]);
    });
  }

  it("finds the sources it claims to be checking", () => {
    // A guard that silently matches nothing is worse than no guard.
    expect(uiSources().length).toBeGreaterThan(20);
    expect(backendSources().length).toBeGreaterThan(50);
  });

  it("still sees the copy after discarding commentary", () => {
    // Comment-stripping is what keeps the explanatory notes beside these fixes
    // from tripping the ban. It must not also blind the guard to real copy.
    const stripped = copyOnly(
      [
        `// was: "Monthly rescans on the paid tier"`,
        `/* and "you will be emailed" */`,
        `<a href="https://line.me/x">{"Monthly rescans on the paid tier"}</a>`,
      ].join("\n"),
    );
    expect(stripped).toContain("Monthly rescans on the paid tier");
    expect(stripped).not.toContain("you will be emailed");
    expect(stripped.match(/Monthly rescans/g)).toHaveLength(1);
  });
});
