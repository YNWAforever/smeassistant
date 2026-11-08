import { existsSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const app = path.join(process.cwd(), "app")

/** Every directory from `app/` down to the page's own directory. */
function ancestors(pageDir: string): string[] {
  const parts = path.relative(app, pageDir).split(path.sep)
  return parts.map((_, i) => path.join(app, ...parts.slice(0, i + 1)))
}

// A loading.tsx above a page that calls notFound() starts the stream first, so the page answers 200.
// These pages must keep a hard 404.
const hardNotFoundPages = [
  "[locale]/owner/[workspaceSlug]/actions/[actionId]",
  "[locale]/r/[slug]",
]

describe("loading boundaries", () => {
  it.each(hardNotFoundPages)("no loading.tsx sits above %s", (page) => {
    const dir = path.join(app, page)
    expect(existsSync(path.join(dir, "page.tsx"))).toBe(true)
    const covering = ancestors(dir).filter((d) => existsSync(path.join(d, "loading.tsx")))
    expect(covering.map((d) => path.relative(app, d))).toEqual([])
  })

  it("Today and the Actions queue keep their skeletons inside their route groups", () => {
    expect(existsSync(path.join(app, "[locale]/owner/[workspaceSlug]/(today)/loading.tsx"))).toBe(true)
    expect(existsSync(path.join(app, "[locale]/owner/[workspaceSlug]/actions/(queue)/loading.tsx"))).toBe(true)
  })
})
