# Conversation workbench — Stage 1

Implements Willy's approved Stage 1 scope and the [conversation home prototype](https://smeassistant-conversation-home.laichiwillyjp.chatgpt.site) as an optional start-work screen. The prototype supplies information architecture only; its sample findings, sources and conversations are not application data.

Today remains the default workspace URL. When enabled, a Today / Start work switch opens `/{locale}/owner/{workspaceSlug}/conversation?location=<slug|all>`. Existing Today, To do, Better?, Shop, Ask Kinnso and task/version URLs retain their current routes. Six entry templates reuse the existing workflow catalog and localized titles: review response, review request, social post, Google post, visibility content, and website basics. Selecting one only fills the note composer.

## Enable locally or in an explicitly chosen Preview

Set the server-only variable `CONVERSATION_HOME_ENABLED=true` and restart the app. A local `NODE_ENV=development` or `test` enables it; on Vercel, only `VERCEL_ENV=preview` or `development` permits it. `VERCEL_ENV=production` always disables it. Unknown hosted environments, a Vercel deployment with missing `VERCEL_ENV`, an unclassified local environment, and other flag spellings all fail closed. A Preview production build (`NODE_ENV=production`, `VERCEL_ENV=preview`) is supported.

No hosted configuration is changed by this implementation. Keep Production OFF. With the flag OFF, the optional shell prop and switch markup are omitted and the conversation route returns 404. There is no new home redirect or navigation destination.

## What is saved

Threads contain only note text, their local title/timestamps, and existing action IDs. They are stored in this browser's `localStorage`, with separate namespaces for the authenticated user ID, workspace ID and resolved location ID (`all` is separate). Each thread is independent. Locale changes do not create another notes store. A keyed view remounts before a changed account/workspace/location can render notes; a thread ID from another scope shows an unavailable state without falling back to another thread.

This is browser-local convenience, **not ACL-protected private cloud storage**. Notes have no server copy, sync, backup or collaboration sharing. Anyone with access to the browser profile may inspect them. Signing out does not erase local site data; clearing site data deletes notes and other local settings. Each save rereads the latest browser record and merges only changed or pending threads, preserving unrelated threads saved by another tab. Browser storage offers no atomic transaction across tabs: exactly simultaneous writes or edits to the same thread can still replace one another. Keep an external copy of important notes. Unsubmitted composer text is not saved. No in-app note deletion/export or conflict resolution is included.

Limits are 50 threads per scope, 40 notes per thread, 4,000 characters per note, 140 characters per title, 20 linked tasks per thread, and a 500,000-character serialized storage record. Blocked/full storage reports that notes remain on the current screen only; refresh or leaving the scope can lose unsaved notes. Unreadable records are preserved and saving is disabled; the screen explains how to clear site data. Limits never produce a false saved confirmation.

The route uses the existing membership loader and scoped, bounded action list (up to 50 items). Only IDs and display labels reach the local screen; action/version bodies are never copied into local storage. Task links use the existing action detail and version query URLs and retain locale/location. A saved ID absent from the current result shows an unavailable-link message and the existing all-tasks link, rather than a fabricated task. Existing action surfaces enforce access again when opened.

## Boundaries

The shell adds no model call, action/draft mutation, version creation, confirmation, delivery, usage write, provider integration, schema/migration, ACL change or sharing API. Ask Kinnso remains the existing assistant launcher. Local notes are never automatically shared by linking a shared action.

Stage 2 document extraction/version libraries, GSC OAuth, research providers, costs and connector states, and Stage 3 search-gap/brief/observation loops are excluded.

## Verification

- `corepack pnpm exec vitest run lib/workspace/conversation-flag.test.ts lib/workspace/conversation-store.test.ts components/workspace/conversation-view.test.tsx components/workspace-shell.test.tsx 'app/[locale]/owner/[workspaceSlug]/conversation/page.test.tsx'`
- `corepack pnpm e2e:conversation` runs real production shell/conversation components in an offline HTTP harness at desktop and mobile sizes, with the actual CSS compiled independently of Next. The harness stubs navigation, session/action props and the existing read-only assistant suggestions response; it reaches no database, identity service or model. It rejects all mutation/model API requests and external traffic. CI runs it after Chromium installation.
- Existing repository lint/typecheck/unit/build/JS-budget and owned acceptance checks remain required. The offline harness is UI/persistence evidence; it does not claim hosted identity, database or Production acceptance.
