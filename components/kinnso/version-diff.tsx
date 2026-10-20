import { copy, type PrototypeLocale } from "@/lib/copy"
import { fill } from "@/lib/copy-ui"
import { diffText } from "@/lib/text-diff"

/**
 * Inline diff between two versions. Additions and removals carry text labels
 * for screen readers, not colour alone.
 */
export function VersionDiff({ before, after, beforeNo, afterNo, locale }: { before: string; after: string; beforeNo: number; afterNo: number; locale: PrototypeLocale }) {
  const t = copy[locale].ui
  const parts = diffText(before, after)
  const changed = parts.some((part) => part.kind !== "same")
  return (
    <figure className="kinnso-diff grid gap-2">
      <figcaption className="text-sm font-semibold text-ink-2">
        {t.diff.title}: {fill(t.approval.versionLabel, { n: beforeNo })} → {fill(t.approval.versionLabel, { n: afterNo })}
      </figcaption>
      {changed ? (
        <p className="kinnso-diff-body whitespace-pre-wrap rounded-lg border border-line bg-paper p-4 text-sm leading-relaxed text-ink">
          {parts.map((part, index) =>
            part.kind === "same" ? <span key={index}>{part.text}</span>
              : part.kind === "added" ? <ins key={index} className="kinnso-diff-added"><span className="sr-only">{t.diff.added}: </span>{part.text}</ins>
                : <del key={index} className="kinnso-diff-removed"><span className="sr-only">{t.diff.removed}: </span>{part.text}</del>,
          )}
        </p>
      ) : (
        <p className="text-sm text-ink-3">{t.diff.unchanged}</p>
      )}
    </figure>
  )
}
