# Conversation Home Wave 1 — 帖文教練（draft → confirm → copy）

**Date:** 2026-11-02  
**Branch:** `codex/conversation-wave1-post-coach`  
**Base:** `main@b386c7e08223c9958d45d62a2c4c08a3a76884af` (#127)  
**Approve cite:** product room User「approve wave 1 doc」2026-11-02 ~02:57 HKT — Wave 1 design + string pack + Jade mock only; not Path A / Prod ON / default-home / OAuth / publish.

## What changed

- Conversation Home now opens with the Wave 1 post coach: one-line intent, up to two clarifications (channel, optional tone), a white output card, confirm-before-done, then copy.
- The coach reuses the existing conversation surface. No live model, provider or connector route is added.
- Channel chips are labels only: Facebook, Instagram, Threads, Google Business Profile, each showing `未連接／待核實` (`Not connected · Pending verification`). The secondary `channel.notConnectedHint` is omitted because the chip already states the state (root `AGENTS.md` UI rule).
- The draft card shows heading, status pill, title, body, optional photo suggestion, and channel tag. `honesty.aiDraftsOnly` sits under the header and disappears after confirm.
- Pre-confirm actions are `改一改` / `換個版本` (ghost) and `確認草稿` (primary) with the confirm ≠ post helper. No schedule, publish or connect CTA is rendered, not even disabled.
- Confirm changes the status to `已確認草稿 · 可以複製`, shows `搞掂`, then offers `複製草稿` (primary) and optional `存做待辦` (secondary). Editing after confirm resets to the draft state and needs re-confirmation.
- Copy writes the title and body to the clipboard and reports the locked success/failure microcopy. Save-to-do writes a minimal confirmed-draft record under the existing conversation store scope; no cloud todo API is used.
- A schedule or publish request receives `honesty.scheduleRequestReply` while the coach still offers only a draft to confirm and copy.

## Preview fixture (Emma decision)

Deterministic, no model call. Default Instagram / social-post fixture (`zh-HK`):

- Title: `本週末營業時間`
- Body:

```text
本週末營業時間如下：
星期六 11:00 – 19:00
星期日 12:00 – 18:00
歡迎預早查詢，週末見！
```

The English locale uses the matching `Weekend opening hours` fixture. `換個版本` toggles to a second deterministic fixture. No connected-account names, reach, engagement or best-time claims are used.

## Copy

All Hazel keys are wired in `lib/copy-conversation-post-draft.ts` under the `conversationHome.wave1.postDraft.*` namespace, with EN and zh-HK parity. zh-TW follows the existing conversation locale pattern.

## Flags / gates

- `conversationHomeEnabled` / `CONVERSATION_HOME_ENABLED` are unchanged.
- Default home is unchanged (`Today` remains the default).
- This remains a Preview/dev-flag surface only.

## HOLD / NO_GO

- Path A gate fix, Production `CONVERSATION_HOME` ON, default-home.
- OAuth / connect Facebook, Instagram, Threads or Google Business Profile.
- Schedule, publish, auto-post, or any fake CTA for them.
- New LLM / model / provider path.
- Google Merchant Center.
- Home triad metrics or full Layout B concept shell.
- Silent merge, CloudAgent, secrets in commits.
