# Guided Owner Sign-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Diagnose the failing Google return and deliver a clear, recoverable sign-in flow that preserves the user's authorized destination.

**Architecture:** Keep Neon verifier exchange server-side, then move application completion behind a same-origin POST driven by a focused processing screen. Share validated navigation context and safe stage diagnostics; reuse existing identity mapping, invitation, claim, and authorization services. Presentation states never grant access.

**Tech Stack:** Next.js 16.2.6 App Router, React 19, TypeScript, pinned @neondatabase/auth 0.5.0-beta, PostgreSQL repositories, Vitest, Playwright, owned Docker/Auth/mail fixtures, pnpm 9 via corepack on Windows.

## Global Constraints

- Approved spec: `docs/superpowers/specs/2026-09-08-guided-owner-sign-in-design.md`.
- Runtime baseline: `30046da86f1c54d40fdbd6d3fff00b6decd26734`; design commit: `d355ca9`. Reconcile origin/main before execution.
- Correct repository: `C:/Users/laich/Documents/smeassistant`. Never implement in `C:/Users/laich/Documents/smescanner`. Preserve the existing `.worktrees/neon-migration` checkout and unrelated work.
- Use an isolated execution worktree with no real `.env` files; verify Docker Linux before fixture suites. Follow using-git-worktrees at execution time.
- One focused card occupies the main content area.
- Support en, zh-HK, and zh-TW using existing locale conventions.
- Offer change email and resend. A 60-second UI resend cooldown reduces accidental repetition; the server's existing rate limit remains authoritative. Honor a longer Retry-After response. Never resend automatically or on page refresh.
- Preserve locale, validated returnTo and claim across recovery and method changes.
- The method hint affects wording only.
- Do not reuse OAuth verifiers or consumed magic links, automatically restart OAuth, or repeatedly attempt failed completion.
- A provider error or database outage must never be classified as no membership.
- Never log emails, cookies, provider subjects, verifiers, callback query strings, raw exceptions, or database parameters.
- No new provider, passwords, social-account linking, database schema, workspace entitlement, draft authority, or automatic email delivery is introduced.
- Retain PR #11 accepted-member mail eligibility, its SQL tests, and fresh-message browser regressions.
- Use fixture-only automated verification. No real email, shared migration, paid provider action, deployment, or domain change without applicable explicit authorization. Prior release approval covered PR #11 only.
- Commit and review each slice. Never count skipped tests or injected transport tests as a successful user-completed Google login.

## File responsibilities and sequence

| Task | Files | Responsibility |
|---|---|---|
| 1 | `lib/identity/sign-in-diagnostics.ts`, its test; `lib/identity/neon.ts`, `lib/identity/users.ts`, `app/auth/callback/route.ts`; SDK/identity tests; debugging record | Reproduce and locate the callback failure; safe diagnostics and an evidence-backed correction only |
| 2 | `lib/identity/sign-in-flow.ts`, its test; sign-in page, callback, proxy/mail routes | One validation/URL contract; preserve destination and method through both methods |
| 3 | `lib/identity/complete-sign-in.ts`, `lib/identity/complete-sign-in-ports.ts`, their tests; `app/api/owner/sign-in/complete/route.ts`, its test; callback tests | Separate verified application completion from OAuth exchange, preserve authorization and idempotency |
| 4 | `components/auth/sign-in-copy.ts`, `sign-in-flow.tsx`, `sign-in-completion.tsx`, `sign-in.module.css`, their tests; current sign-in component; completion page | Accessible guided UI, real processing state, email cooldown, recovery, no access |
| 5 | `test/e2e/identity-server.ts`, `test/e2e/composition.ts` and existing fixture tests; `e2e/acceptance/guided-sign-in.spec.ts`; existing callback/owner-shell tests | Owned browser proof including controlled Google-style completion and failures |
| 6 | `docs/integration/2026-09-08-guided-owner-sign-in-verification.md`, this plan and spec statuses | Full gate, independent final review, exact evidence and release handoff |

Tasks 1-5 are sequential reviewed slices. Task 1 may leave a documented production-only diagnosis blocker; independent context/presentation work may proceed, but the callback defect must not be declared fixed or the feature declared release-ready until the diagnosis has evidence. A diagnostics-only deployment is a separate approval checkpoint, not an implicit part of this plan.

---

### Task 1: Locate the Google callback failure and make failures diagnosable

**Files:** Create `lib/identity/sign-in-diagnostics.ts`, `lib/identity/sign-in-diagnostics.test.ts`. Inspect/modify only when evidence requires: `lib/identity/neon.ts`, `lib/identity/users.ts`, `app/auth/callback/route.ts`, `lib/identity/callback-sdk.test.ts`, `lib/identity/identity-sdk.test.ts`, `lib/identity/identity.test.ts`, `test/integration/neon-identity.integration.test.ts`. Update `docs/integration/2026-09-08-owner-sign-in-debugging.md`.

**Interfaces:** Produce `AuthStage`, `AuthDiagnostic`, and `authDiagnostic(stage, correlationId)`. Later tasks consume this fixed safe event shape. No raw error argument is accepted.

- [ ] Record the clean execution HEAD, current production SHA, pinned SDK version and observed log timestamps. Confirm the failure occurs after Google account selection. Search graph first; it currently describes the older linked checkout, so verify source paths and fall back when its results omit current functions.
- [ ] Trace the pinned SDK's verifier/challenge-cookie exchange, clean redirect, fresh-session lookup, identity mapping and invitation binding. Existing `callback-sdk.test.ts` mocks `getUser`; its passing exchange test does not establish that account mapping works. Use read-only configuration metadata and redacted logs; never print secret values or retrieve user cookies into a report.
- [ ] Add a failing diagnostic privacy test before instrumentation:

```ts
import { expect, it } from 'vitest';
import { authDiagnostic } from './sign-in-diagnostics';
it('emits only the fixed stage and opaque correlation identifier', () => {
  expect(authDiagnostic('identity_mapping', '00000000-0000-4000-8000-000000000001'))
    .toEqual({ event: 'owner_sign_in_failed', stage: 'identity_mapping',
      correlationId: '00000000-0000-4000-8000-000000000001' });
});
```

Run `corepack pnpm exec vitest run lib/identity/sign-in-diagnostics.test.ts`; confirm missing-module RED, not a broken fixture.

- [ ] Implement the diagnostic module:

```ts
export type AuthStage = 'verifier_exchange' | 'fresh_session' | 'identity_mapping'
  | 'invitation_binding' | 'workspace_lookup' | 'claim_resolution';
export type AuthDiagnostic = { event: 'owner_sign_in_failed'; stage: AuthStage; correlationId: string };
export function authDiagnostic(stage: AuthStage, correlationId: string): AuthDiagnostic {
  return { event: 'owner_sign_in_failed', stage, correlationId };
}
```

Create the correlation ID server-side with `crypto.randomUUID()`. Track the current stage immediately before each awaited boundary. Catch/log only `authDiagnostic(stage, correlationId)`, never spread the caught error. Session and mapping must be distinct stages: observe provider `getIdentity()` separately from `resolveApplicationUser(identity)` without changing their validation.

- [ ] Add failure-injection tests for all six stages and capture console output. Feed an error containing sentinel email, cookie, verifier and SQL text, then assert none appear in the log or public response. Add fresh-session-null versus provider-error cases: absence is not an outage, and an outage is not a membership result.
- [ ] Reproduce the actual faulty boundary using the real pinned SDK with fixture transport, or the owned SQL harness for mapping/binding. Capture the exact failing assertion and successful preconditions. Only then implement the smallest correction in that boundary and rerun its regression. Do not preselect missing configuration, a cookie problem, or database privileges as the cause.
- [ ] If the existing evidence cannot distinguish the boundary, record that limitation and prepare the fixed-category diagnostic patch for review. Do not invent the corrective code. Ask for the separately authorized diagnostic release only after that patch and its tests are concrete. Continue independent design work without claiming the production failure resolved.
- [ ] Run `corepack pnpm exec vitest run lib/identity app/auth/callback` and `corepack pnpm exec vitest run --config vitest.integration.config.ts test/integration/neon-identity.integration.test.ts` with `NEON_INTEGRATION=1`. Expected: no failing or skipped relevant tests. Record exact totals and any blocker.
- [ ] Review and commit the explicit changed files as `fix: diagnose owner sign-in callback failures`; distinguish diagnostics from a proven correction in the commit body and evidence record.

### Task 2: Preserve validated flow context across both sign-in methods

**Files:** Create `lib/identity/sign-in-flow.ts`, `lib/identity/sign-in-flow.test.ts`. Modify `app/[locale]/owner/sign-in/page.tsx`, `components/sign-in-page.tsx`, `app/auth/callback/route.ts`, `app/api/auth/[...path]/route.ts`, `app/api/owner/magic-link/route.ts`, `app/api/workspace-invites/magic-link/route.ts` and their existing tests.

**Interfaces:** Produce the following client-safe contract; later tasks use these exact names:

```ts
export type AuthMethod = 'google' | 'email';
export type AuthFlow = { locale: 'en' | 'zh-HK' | 'zh-TW'; claim: string | null;
  returnTo: string | null; method: AuthMethod | null };
export type AuthScreen = 'start' | 'complete';
export function parseAuthFlow(query: URLSearchParams): AuthFlow;
export function authFlowHref(flow: AuthFlow, screen: AuthScreen): string;
export function callbackHref(flow: AuthFlow): string;
```

- [ ] Add failing tests that retain `_` and `-` in valid 6-64-character report slugs, reject traversal and duplicate context parameters, preserve encoded legitimate destinations, and drop unknown method hints. The current page's 1-120-character hyphen-only regex is inconsistent with the server's actual slug contract.

```ts
it('keeps the same destination when moving from Google recovery to email', () => {
  const flow = parseAuthFlow(new URLSearchParams({ locale: 'zh-HK',
    claim: 'Ab_cd-12', returnTo: '/zh-HK/owner/shop/actions/a?tab=evidence', method: 'google' }));
  const next = new URL(authFlowHref({ ...flow, method: 'email' }, 'start'), 'https://app.test');
  expect(next.searchParams.get('claim')).toBe('Ab_cd-12');
  expect(next.searchParams.get('returnTo')).toBe('/zh-HK/owner/shop/actions/a?tab=evidence');
  expect(next.searchParams.get('method')).toBe('email');
});
```

- [ ] Run `corepack pnpm exec vitest run lib/identity/sign-in-flow.test.ts`; capture RED.
- [ ] Implement parsing with `isLocale`/`DEFAULT_LOCALE`, `safeReturnPath`, `/^[A-Za-z0-9_-]{6,64}$/`, and allowlisted methods. A repeated field is invalid for that field, not a choice of the first attacker value. Drop auth callback/completion/sign-in destinations that would form a loop, checking decoded pathname after safeReturnPath. Other local destinations retain existing server authorization.
- [ ] Build URLs from fresh URLSearchParams containing only parsed context. `authFlowHref` chooses `/{locale}/owner/sign-in` or `/{locale}/owner/sign-in/complete`; `callbackHref` uses `/auth/callback`. Neither copies error, code, token, verifier, provider response, or arbitrary query keys.
- [ ] Replace the page's `safeClaim` and `safeReturnTo` helpers with the shared parser. Preserve the existing plan display hint separately; it is not permission. Replace callback error landing construction so returnTo is retained alongside claim and locale.
- [ ] Set method=google/email on new SDK initiation callbacks. Propagate the allowlisted method through the auth proxy and both mail routes when they reconstruct callback URLs. Legacy callers without method remain valid and get neutral recovery copy. Keep the proxy's callback path restriction at `/auth/callback`.
- [ ] Add route regressions for spoofed method, unsafe callback, repeated fields, missing context, claim slugs with underscores, and both old mail clients and new SDK clients. Confirm recipient/rate-limit logic remains unchanged.
- [ ] Run `corepack pnpm exec vitest run lib/identity app/api/owner/magic-link app/api/workspace-invites/magic-link app/api/auth tests/sign-in-hydration.test.tsx app/auth/callback`. Expected: all pass. Review and commit explicit files as `fix: preserve validated sign-in destinations`.

### Task 3: Complete application sign-in through an authorized POST

**Files:** Create `lib/identity/complete-sign-in.ts`, `lib/identity/complete-sign-in.test.ts`, `lib/identity/complete-sign-in-ports.ts`, `app/api/owner/sign-in/complete/route.ts`, `app/api/owner/sign-in/complete/route.test.ts`. Modify `app/auth/callback/route.ts`, its tests and `lib/identity/callback-sdk.test.ts`.

**Interfaces:** Consume AuthFlow and AuthStage. Produce:

```ts
import type { SessionUser } from '@/lib/auth';
import type { IdentityProvider } from '@/lib/identity/contracts';
import type { AuthFlow } from './sign-in-flow';
export type CompletionResult =
  | { kind: 'redirect'; destination: string }
  | { kind: 'no_access' }
  | { kind: 'recover'; reason: 'invalid_session' | 'unavailable'; correlationId: string };
export interface CompletionPorts {
  getIdentity: IdentityProvider['getIdentity'];
  mapIdentity: (identity: NonNullable<Awaited<ReturnType<IdentityProvider['getIdentity']>>>) => Promise<SessionUser>;
  bindInvitations: (user: SessionUser) => Promise<void>;
  hasAcceptedMembership: (userId: string) => Promise<boolean>;
  finishClaim: (user: SessionUser, flow: AuthFlow) => Promise<string | null>;
  clearInvalidSession: () => Promise<void>;
  reportFailure: (stage: import('./sign-in-diagnostics').AuthStage, correlationId: string) => void;
}
export function completeSignIn(flow: AuthFlow, ports: CompletionPorts): Promise<CompletionResult>;
export function createCompletionPorts(request: Request): Promise<CompletionPorts>;
```

`finishClaim` returns a safe existing onboarding destination, or null for a technical claim failure. It is only called with a non-null validated claim. All returned destinations are revalidated before responding.

- [ ] Add failing tests for valid returning identity, no session, unverified identity, provider outage, mapping error, binding error, empty membership, membership query failure and claim failure. Mock only the ports; use exact expected safe result objects and ensure no serialized email/subject.
- [ ] Implement ordered completion: fresh identity -> validated application mapping -> bind pending invitations -> claim completion when claim exists, otherwise authoritative accepted-membership lookup -> original safe destination or workspace selector. For no claim and zero accepted memberships return no_access. A valid explicit destination still goes through its own route authority; completion does not grant access to it.
- [ ] Create the production ports by extracting the current callback's `holdsViewerGrant` and claim/access-request block without loosening any checks. Reuse `identityProvider`, `resolveApplicationUser`, `bindWorkspaceToUser`, `bindPendingMembership`, `membershipRepository.listAccepted`, `claimScan`, and existing claim repositories. Preserve best-effort BD signaling; never use its fail-open result as a membership decision. Keep OWNER_SELF_SERVICE_CLAIM default off. Repeated finalization must use existing deduplication/atomic binding, not a new in-memory authorization cache.
- [ ] Log fixed stage/correlation diagnostics on operational failures. Preserve a valid identity session when mapping, binding, workspace or claim work fails; do not expose workspace content. Clear absent/invalid session credentials through existing cookie handling. No failure branch silently returns no_access.
- [ ] Add the POST boundary with same-origin validation before parsing or invoking ports:

```ts
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin || origin === 'null') return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin
      && origin === new URL(origin).origin
      && !['cross-site', 'same-site'].includes(request.headers.get('sec-fetch-site') ?? '');
  } catch { return false; }
}
```

Accept JSON objects only; maximum body 4 KiB; validate field types and reuse parseAuthFlow. Reject foreign/missing/null Origin, unsupported content type, invalid JSON/oversized body and invalid context with fixed 4xx responses, no identity lookup. GET is unsupported. Set `Cache-Control: no-store` on every response. Use status 200 for redirect/no_access, 401 for invalid_session, 503 for unavailable. Return no raw service errors.

- [ ] Verify the origin boundary with requests whose cookies are otherwise valid; assert `createCompletionPorts` is not called on rejection. Add concurrent SQL-backed completion cases for invitation binding and existing claimed report; accepted_at, ownership and access-request counts must remain stable.
- [ ] Prepare and test the clean callback-to-completion handoff as an exported helper, but retain the existing callback orchestration until Task 4 adds the screen. Do not introduce a live redirect to a missing page. At Task 4 cutover, reduce `/auth/callback` to verifier exchange and a clean redirect to the completion page. Preserve all SDK Set-Cookie headers by returning its successful clean-callback redirect first; only on the subsequent clean request redirect to the completion screen. Never forward the verifier to the client completion URL. Map only known upstream cancellation/expired-link codes to safe presentation reasons; unknown failures remain generic. Do not trust method hints to validate authentication.
- [ ] Add handoff-helper and completion POST assertions now: exchange occurs before any application actions. At the Task 4 cutover, update existing callback assertions so application actions occur through POST only. Keep legacy email callbacks working. Do not delete security assertions when moving them to completion tests.
- [ ] Run `corepack pnpm exec vitest run lib/identity app/auth/callback app/api/owner/sign-in/complete` plus the owned identity/membership integration suites. Review and commit as `refactor: separate secure sign-in completion from callback exchange`.

### Task 4: Render the guided start, email, completion and recovery states

**Files:** Create `components/auth/sign-in-copy.ts`, `components/auth/sign-in-flow.tsx`, `components/auth/sign-in-completion.tsx`, `components/auth/sign-in.module.css`, `components/auth/sign-in-flow.test.tsx`, `components/auth/sign-in-completion.test.tsx`, `app/[locale]/owner/sign-in/complete/page.tsx`. Replace the implementation inside `components/sign-in-page.tsx` with an adapter to the flow component; modify the existing sign-in page and hydration test. Do not edit shared unlock styles in `app/globals.css` or `app/responsive.css`.

**Interfaces:** Consume AuthFlow, callbackHref, authFlowHref, CompletionResult. Produce `SignInFlow({ flow, initialReason, plan })` and `SignInCompletion({ flow })`. `initialReason` is `cancelled | expired | unavailable | null`; `plan` is the existing optional string display hint; `flow` is AuthFlow. Completion page forwards only parsed flow context. Both remain under PublicPageFrame and noindex/nofollow metadata.

```ts
export type SignInState =
  | { kind: 'start' }
  | { kind: 'opening_google' }
  | { kind: 'sending_email' }
  | { kind: 'email_sent'; email: string; retryAt: number }
  | { kind: 'recover'; method: 'google' | 'email' | null; reason: 'cancelled' | 'expired' | 'unavailable' };
```

- [ ] Write failing component tests: one primary Google button, labeled email alternative, no promotional auth-value block, prehydration submit disabled, Google progress differs from email progress, duplicate actions blocked, locale copy, and recover state does not show the untouched original form. Include claim versus generic eligibility copy.
- [ ] Implement localized start/email/recovery copy from the spec in a single typed dictionary. Use the existing zh-HK/zh-TW language convention but provide separate dictionary entries for future localization. Keep public header/footer and a short privacy note. Retain optional plan hint without making it an entitlement.
- [ ] Implement the state transitions with authClient. Set method hints through callbackHref. Recognize real SDK errors; no-error uniform email response leads to email_sent with conditional eligibility copy. Never claim provider acceptance proves delivery. Unknown error text is not rendered. On method switch, clear only error/email state and retain flow; strip stale URL error with router.replace using authFlowHref, not history.back.
- [ ] Implement resend timing and fixture tests using a controlled clock. For Retry-After accept either nonnegative seconds or an HTTP date; invalid values use 60 seconds. Set retryAt to at least now+60000 and any later server delay. Render seconds from the deadline; never call send from the timer or useEffect. Clicking change email permits editing and still relies on server rate limits. Test 429, larger delay, elapsed timer, failed resend, and page refresh causing no send.
- [ ] Create the completion page and activate the tested callback handoff from Task 3 in this same slice; update callback/SDK tests to prove no business actions execute on the callback GET. Completion component sends one POST after mount with `{locale, claim, returnTo, method}` and `credentials: 'same-origin'`. Use a useRef-held request promise so React StrictMode effect replay subscribes to the same in-flight operation; remove only subscriptions on cleanup, never start a second request or retry automatically. Use a bounded 20-second fetch timeout and show recovery when reached; server effects remain idempotent because a timeout is not proof they did not occur.
- [ ] Render processing while the request is actually pending, then `router.replace(result.destination)` after revalidating a local destination. Render no_access only from a successful server no_access result. On technical failure, show method-aware recovery. A retry explicitly starts a fresh Google/email attempt and never reuses callback secrets. No-access change account must call signOut and wait for success before navigating to start; a signOut failure shows recovery instead of claiming the account changed.
- [ ] Add accessible focus management: move focus to the new card heading after user-driven state changes, use polite status for progress and role=alert for actionable failure, avoid duplicate announcements, keep visible focus and touch targets at least 44 px, honor reduced motion. Cards use a component-scoped max-width of 28rem, width calc(100% - 32px), and overflow-wrap for long email addresses. No artificial completion delay.
- [ ] Run `corepack pnpm exec vitest run components/auth tests/sign-in-hydration.test.tsx` and `corepack pnpm typecheck`. Record the RED/GREEN evidence, review and commit as `feat: guide owner sign-in with clear recovery states`.

### Task 5: Prove the complete flow with owned browser fixtures

**Files:** Create `e2e/acceptance/guided-sign-in.spec.ts`. Modify `test/e2e/identity-server.ts`, `test/e2e/composition.ts` and their existing tests only for missing fixture behavior. Update `e2e/owner-shell.spec.ts`, `e2e/acceptance/permissions.spec.ts`, and `e2e/acceptance/returning-sign-in.spec.ts` only where the approved route/markup contract changes.

**Interfaces:** Use existing `test`, `expect`, `signIn`, `requestSignInLink`, `environment` and `merchant` from `test/e2e/fixtures.ts`. All fixture controls must remain behind assertFixtureIdentityContext/assertLocalOrigin and the existing fixture secret; no production diagnostic/test route.

- [ ] Extend the owned identity server with a Google-style start -> single-use verifier -> session handoff. Use only seeded merchant fixture identities; exercise the existing managed callback contract through a fixture adapter. Separately retain real pinned SDK unit transport tests so the fixture adapter cannot conceal an SDK regression. Test that any nonlocal origin or production test-mode configuration rejects fixture controls.
- [ ] Add deterministic controls inside the owned fixture for pending completion, revoked identity, upstream failure and binding failure. The browser fixture transport must block every nonlocal host. No real Google account, email or database is used.
- [ ] Add failing browser assertions for the approved states, then bring them GREEN with the implemented flow. A controlled pending fixture proves the processing card and subsequent focus/navigation without adding a production delay.

```ts
await page.goto(`/zh-HK/owner/sign-in?returnTo=${encodeURIComponent(`/zh-HK/owner/${merchant.slug}`)}`);
await page.getByRole('button', { name: '使用 Google 登入', exact: true }).click();
await expect(page.getByRole('status')).toContainText('正在完成登入');
// Release the owned fixture's pending session response, then verify the authorized destination.
await expect(page).toHaveURL(new RegExp(`/zh-HK/owner/${merchant.slug}$`));
```

Define POST `/test/completion-hold` and POST `/test/completion-release` only on the owned identity server. Both require its existing fixture secret and local-origin guard; hold installs a promise latch for the next seeded session response, release resolves that latch. Expose the fixture helper through `AcceptanceEnvironment`, not through browser secrets. The fixture release is implemented as an authenticated request to that local identity fixture; it must never be a callable production application endpoint. Choose a promise latch in the fixture server rather than timing-based sleeps.

- [ ] Cover Google cancellation, unavailable session, mapping/binding failure, empty authorized workspace list, method switch retaining destination, changed account, safe legacy callback, consumed/expired email links, and rejected cross-origin completion POST. Assert that failures do not mutate memberships or acquire draft authority.
- [ ] Preserve the returning-member regression's old-message-ID exclusion. Update it to assert the actual completion screen where deterministically held, then successful navigation and unchanged accepted_at. Do not reduce it to a mocked mail-success response.
- [ ] Verify start, email, recovery, processing and no-access in all three locales at 375 and 1440 widths. Capture screenshots, inspect them, test keyboard-only operation and no horizontal overflow. Intercepted completion responses can test presentation, but mark those separately from owned full-path tests.
- [ ] Run `corepack pnpm exec playwright test --config playwright.acceptance.config.ts e2e/acceptance/guided-sign-in.spec.ts e2e/acceptance/returning-sign-in.spec.ts e2e/acceptance/permissions.spec.ts`. Expected: all relevant cases pass, zero skips. Review and commit as `test: cover guided sign-in and callback recovery`.

### Task 6: Verify the integrated slice and prepare release evidence

**Files:** Create `docs/integration/2026-09-08-guided-owner-sign-in-verification.md`; update this plan and the design spec status only after evidence exists.

**Interfaces:** Produce a verification record containing tested SHA, commands/exits/counts, reviewer findings, diagnostic outcome, screenshots actually inspected, live limitations, and release status. It is evidence, not authorization.

- [ ] Run the normal gate in the isolated checkout, using fixture sources and no real env files:

```powershell
$env:SCAN_SOURCES='fixture'
$env:NEON_INTEGRATION='1'
$env:VITEST_MAX_WORKERS='1'
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:secret-boundary
corepack pnpm test:no-supabase
docker info --format '{{.OSType}}'
corepack pnpm db:verify
corepack pnpm test:integration
corepack pnpm build
corepack pnpm exec playwright install chromium
corepack pnpm e2e
corepack pnpm e2e:acceptance
git diff --check
```

Execute with explicit exit checks per command and preserve logs. Stop dependent stages on failure. Do not concatenate commands and mistake the last exit code for all-pass. The Linux value must be `linux`; fixture database tests must not skip. Fix genuine regressions using systematic debugging. Record pre-existing/environment failures separately rather than deleting tests or widening timeouts without evidence.

- [ ] Request independent final authorization/test review of the whole branch. Resolve blocking issues, then rerun checks affected by the correction. Reviewer must examine callback cookies, same-origin POST, session-preservation policy, destination validation, account enumeration, member binding and all no-access paths.
- [ ] Confirm zero owned fixture containers/Next processes remain. Preserve all unrelated work. Record exact source and documentation commits; stage explicit paths only.
- [ ] Mark the production callback diagnosis accurately: proven cause plus RED/GREEN fixture, or unresolved pending live diagnostic evidence. All-local-green alone cannot certify the Google issue is fixed. Real Google account selection and email receipt remain human/authorized live checks.
- [ ] Commit the verification record as `docs: record guided sign-in verification`. Follow finishing-a-development-branch for integration choice. Before any new release, present exact PR/commit and obtain applicable authorization. After authorized deployment, verify the production SHA and ask the user to complete Google sign-in; do not mark completed login based only on reaching accounts.google.com.

## Self-review coverage

- Start/email/cooldown/recovery/no-access: Tasks 2, 3, 4, 5.
- Actual processing and no duplicate completion: Tasks 3, 4, 5.
- Google callback root cause and privacy-safe diagnostics: Task 1, with release gate in Task 6.
- Destination preservation and valid underscore slugs: Task 2.
- Session validity, membership authority, claim constraints, CSRF and idempotency: Tasks 1, 3, 5, 6.
- Locales, responsive layout, keyboard/focus and privacy: Tasks 4, 5.
- Full tests, independent review, precise live limitations and release authorization: Task 6.