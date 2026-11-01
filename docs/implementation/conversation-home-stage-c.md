# Conversation workbench - Stage C Park

**Stage C = Park localStorage.** Stage C Park Approve: Willy Approve via Grok Master (GM) answering t299s1216. This implements option 1 (Park) of the approved next plan, from `main` at `8b139e91e35216d3d50fa0ac0fc54bc51f8a3b2f` (#123 Stage B). The choice is not server-private threads and not deeper local ops such as rename/delete/export.

**Production conversation flag still OFF.** Today remains the default home. Stage D remains held: changing the default home or enabling Production requires a separate, explicit Willy Approve via GM naming the change. No Production or Preview environment writes are part of Stage C.

## Browser-local convenience

Notes remain browser-local convenience, **not ACL cloud storage**. There is no server copy, sync, backup or collaboration sharing of these notes. They stay only in this browser on this device, with no cross-device sync or cloud backup. Anyone using the same browser profile can read them. Signing out does not erase local site data; clearing site data deletes notes and other local settings. Keep an external copy of important notes.

Account, workspace and resolved location IDs separate local namespaces; these are UI scopes, not an access-control boundary. Locale changes reuse the same notes store. Linking an existing task does not share local notes or grant access to the task. Stage 2 document versions and Stage 3 work retain their existing server behavior; they do not provide a server copy of local notes.

The [Stage 1 implementation](conversation-home-stage-1.md#what-is-saved) and [`lib/workspace/conversation-store.ts`](../../lib/workspace/conversation-store.ts) remain the source for persistence behavior. Stage C leaves localStorage keys, record format, merge algorithm and limit values unchanged. Saving still rereads the latest record and merges changed or pending threads; simultaneous writes or same-thread edits can still replace one another. Unsubmitted composer text is not saved.

## Existing limits

These are the existing `CONVERSATION_LIMITS`, documented without changing their values:

| Store field | Value | Applies to |
| --- | --- | --- |
| `threads` | 50 | Threads per account/workspace/location scope |
| `notes` | 40 | Notes per thread |
| `noteLength` | 4,000 | Characters per note |
| `titleLength` | 140 | Characters per title |
| `actionIds` | 20 | Linked task IDs per thread |
| `bytes` | 500,000 | Characters in the serialized record per scope |

Despite the legacy field name `bytes`, the store checks JavaScript string length, not encoded byte size. Character limits use JavaScript UTF-16 code units. Existing document-version references also remain capped at 20 per thread.

Browser storage can fail before these limits are reached. Existing unavailable/full-storage warnings retain notes on the current screen only; leaving or refreshing can lose unsaved notes. Unreadable records remain preserved and saving stays disabled. A failed save never receives a saved confirmation. Park adds no deletion, export, rename, conflict-resolution or recovery feature.

## Visible shop-owner honesty

The existing honesty surfaces in [`ConversationView`](../../components/workspace/conversation-view.tsx) stay outside tool disclosures:

- `conversationCopy.privacy` in [`lib/copy-conversation.ts`](../../lib/copy-conversation.ts) explicitly explains this browser/device only, no cross-device sync or cloud backup, same-profile access and deletion when site data is cleared, in en, zh-HK and zh-TW.
- `conversationDesignCopy.localNote` in [`lib/copy-conversation-design.ts`](../../lib/copy-conversation-design.ts) remains directly below the composer. It now shows the existing 50 threads per scope, 40 notes per thread and 4,000 characters per note, using `CONVERSATION_LIMITS` as the numeric source.
- `conversationCopy.boundary` retains Stage 1 honesty: notes are not AI replies or drafts, linking tasks does not share them, and saving does not confirm work or count a delivery. Ask Kinnso remains the existing assistant launcher.

Templates remain seed-only. Existing Stage 2-3 honesty, budgets, partial/empty/unavailable states, confirmation-before-todo, immutable brief/citation IDs, observation baselines/windows and delivery counting are unchanged. Existing Today, To do, Better?, Shop, Ask Kinnso and task/version routes remain available. There is no new model, provider, backend, schema, migration, sync path or paid-budget increase.

## Verification scope

Unit coverage renders the three localized honesty surfaces and checks the Park decision, limits and release holds in this document. Existing conversation store tests continue to cover scoped records, limits, corrupt/blocked storage and merging. Offline conversation e2e checks all three locales before saving and after reload, with tool disclosures closed, at desktop and mobile sizes, including overflow and unchanged delivery counts.

The offline harness uses real product components and compiled app CSS with synthetic data and blocked external traffic. It is not hosted signed-in Preview acceptance or Production evidence. Local check results are recorded in the draft PR handoff; remote CI, Vercel, independent PR-diff review and hosted Preview acceptance remain parent/reviewer steps. This task ends with a local commit and draft PR title/body files only; no push, PR creation or merge.
