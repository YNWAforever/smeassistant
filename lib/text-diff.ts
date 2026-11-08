/**
 * Word-level diff for comparing two draft versions. Latin text splits on
 * whitespace; Han characters are compared one by one, since Chinese has no
 * spaces between words. Longest-common-subsequence, O(n·m), capped so a huge
 * draft degrades to "replaced" instead of freezing the page.
 */
export type DiffPart = { kind: "same" | "added" | "removed"; text: string }

const MAX_CELLS = 400_000

export function tokenize(text: string): string[] {
  return text.match(/[㐀-鿿豈-﫿]|[^\s㐀-鿿豈-﫿]+|\s+/g) ?? []
}

export function diffText(before: string, after: string): DiffPart[] {
  const a = tokenize(before)
  const b = tokenize(after)
  if (a.length * b.length > MAX_CELLS) {
    return [...(before ? [{ kind: "removed" as const, text: before }] : []), ...(after ? [{ kind: "added" as const, text: after }] : [])]
  }
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  const parts: DiffPart[] = []
  const push = (kind: DiffPart["kind"], text: string) => {
    const last = parts.at(-1)
    if (last && last.kind === kind) last.text += text
    else parts.push({ kind, text })
  }
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { push("same", a[i]); i += 1; j += 1 }
    else if (table[i + 1][j] >= table[i][j + 1]) { push("removed", a[i]); i += 1 }
    else { push("added", b[j]); j += 1 }
  }
  while (i < a.length) { push("removed", a[i]); i += 1 }
  while (j < b.length) { push("added", b[j]); j += 1 }
  return parts
}
