# Local and managed identity acceptance

`corepack pnpm e2e:acceptance` runs the 16 required merchant/public cases plus local logout and authenticated unknown-route regressions. `corepack pnpm e2e` starts a separate owned fixture on port3100; it never reuses a server. `corepack pnpm test:integration` selects every PostgreSQL integration case. Docker is required; missing Docker fails rather than skipping.

The fixture owns an ephemeral labeled PostgreSQL16 container, network=none and a host loopback PostgreSQL relay over owned Docker exec pipes (the image's existing Perl IO runtime, no downloads), a local opaque-session identity service/mail capture, and fixture LLM/evidence. Node workers/Next children preload `transport-guard.cjs`. Chromium uses a loopback-only proxy bypass plus blocked external requests. No managed Auth table is seeded. App UUIDs and `auth_identities` are application-owned tables.

The app composition selects local identity only when `SME_TEST_IDENTITY=owned-local`, NODE_ENV is test/development, and configured/request origins match a bare loopback origin. Production and nonlocal requests reject the fixture path. This is local contract proof, not managed Neon delivery or consent proof.

The hosted suite is opt-in: `corepack pnpm exec playwright test --config playwright.neon-auth.config.ts`. No target, branch, staging origin, recipient or Google account has been selected. It is NOT RUN. It requires all of:

- `NEON_AUTH_TEST_AUTHORIZED=yes` and `NEON_AUTH_TEST_ISOLATED=yes`, recording separate authorization.
- `NEON_AUTH_TEST_ORIGIN`, an isolated HTTPS app origin, and `NEON_AUTH_TEST_BRANCH`, its dedicated br-* Neon branch.
- `NEON_AUTH_TEST_PRODUCTION_ORIGIN`, the production alias, which cannot be the target.
- `NEON_AUTH_TEST_PROVIDER_ORIGIN` and `NEON_AUTH_TEST_PRODUCTION_PROVIDER_ORIGIN`, distinct HTTPS managed Auth origins; delivered/expired links may only target the isolated app/provider.
- `NEON_AUTH_TEST_REDEMPTION_RECIPIENT` and `NEON_AUTH_TEST_EXPIRY_RECIPIENT`, two distinct, separately authorized mailboxes, each with its own pending app invitation. Redeeming the first recipient's link consumes all pending invitations for that recipient, so the expiry scenario must use the second recipient. `NEON_AUTH_TEST_INBOX_URL` and optional `NEON_AUTH_TEST_INBOX_TOKEN` configure an authorized HTTPS mailbox adapter returning `{recipient,url,receivedAt}` after sending.
- `NEON_AUTH_TEST_GOOGLE_EMAIL` and `NEON_AUTH_TEST_GOOGLE_STATE`, the authorized dedicated Google account and locally protected Playwright state file. The test must perform actual account selection and consent; it fails if no consent screen is presented.
- `NEON_AUTH_TEST_LINK_TTL_MS`, the isolated provider's configured magic-link lifetime in milliseconds (1000 through3600000). The expiry case requests a real new message and waits this lifetime before attempting redemption; it never substitutes an arbitrary invalid link.

Hosted tracing/screenshots/video are disabled to avoid writing session material. Opt-in is not permission to provision, deploy, migrate shared data, or contact unapproved recipients. `db:types` is currently explicitly unavailable after retirement of the old REST generator; Task15 owns final CLI cleanup. Neon types are authored in `lib/db/schema.ts`.
