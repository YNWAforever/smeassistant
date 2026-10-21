# Visual state captures

A manual tool for checking that a styling change leaves screens pixel-identical. It is **not part of CI** and nothing runs it automatically.

It exists for the move off the legacy stylesheet (Phase 8, `docs/ux/`). Many legacy rules style states that ordinary fixture data never reaches, such as a version conflict, an offline banner, a failed run or a used-up allowance. This tool seeds those states and captures them in light and dark, at phone and desktop widths, in English and Chinese.

## Use

Docker must be running with the `postgres:16` image, as for `e2e:acceptance`.

```bash
# 1. Start the stack and leave it running (Ctrl-C stops it and removes the database).
corepack pnpm exec tsx test/visual/stack.ts

# 2. In another terminal, capture before the change.
corepack pnpm exec tsx test/visual/capture.ts before

# 3. Edit the CSS (next dev reloads it), capture again, compare.
corepack pnpm exec tsx test/visual/capture.ts after
corepack pnpm exec tsx test/visual/compare.ts before after
```

`compare.ts` exits 1 if any pixel differs and writes a diff image per changed capture to `test-results/visual/diff-before-after/`.

Narrow a run with environment variables:

| Variable | Default | Example |
|---|---|---|
| `VISUAL_ONLY` | every state | `action-approved,action-history` |
| `VISUAL_LOCALES` | `en,zh-HK` | `zh-TW` |
| `VISUAL_WIDTHS` | `390,1440` | `768` |
| `VISUAL_SCHEMES` | `light,dark` | `dark` |
| `VISUAL_CHROMIUM` | Playwright's browser | `/opt/pw-browsers/chromium` |

## How it works

- **`stack.ts`** starts the same owned environment as the acceptance suite: a disposable PostgreSQL container, local sign-in and LLM fixtures, and `next dev`. It then:
  - runs one fixture scan through the public API and attaches it to a seeded merchant;
  - adds actions, versions, runs and notifications with fixed dates;
  - signs in an owner, a manager and a viewer;
  - writes `test-results/visual/stack.json`.
- **`states.ts`** lists the states. A state can click into a tab, go offline, intercept a request (the version conflict), or change rows with SQL and put them back afterwards (the used-up allowance).
- **`capture.ts`** takes a full-page screenshot of every state. It hides the dev overlay and the text caret and stops animations, so two runs with no change give identical images.
- **`compare.ts`** compares two runs pixel by pixel. It decodes images in Chromium, so it needs no image library.

Before and after captures read the same rows from one running stack, so IDs and dates match. Restarting the stack gives new IDs, so take a fresh baseline after a restart.

## Pitfalls

- **The dev server can miss git's rewrites.** After `git stash`, `git stash pop` or a branch switch, `next dev` sometimes keeps serving the old stylesheet. Save `app/globals.css` again (any edit, then undo it) and check that the served CSS is the one you expect before capturing.
- **Text in the fixed, blurred approval bar** can differ by a few hundred glyph pixels between runs. If a capture differs only there, compare computed styles before treating it as a change.
- **Two runs with no change must give zero differences.** Check that first when adding a state.

Everything stays on loopback: the browser's proxy blocks other hosts, and SQL refuses any container but the stack's own.
