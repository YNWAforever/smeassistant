import { ShieldCheck, Sparkles } from "lucide-react"

import type { PrototypeLocale } from "@/lib/copy"
import { studioText } from "@/lib/studio/copy"
import type { StudioPromptChip } from "@/lib/studio/types"

/**
 * The first thing the owner sees in the Studio (design §3 "Empty state").
 *
 * It is a question with a boundary, not a task board: the four starters are
 * suggestions the owner may ignore and type anything instead. When the
 * server-side briefing produced state-aware chips they replace the static
 * starters, so a workspace with a waiting draft opens on that conversation.
 */
export function StudioEmptyState({
  locale,
  workspaceName,
  chips,
  disabled = false,
  onStarter,
}: {
  locale: PrototypeLocale
  workspaceName: string
  chips: StudioPromptChip[]
  disabled?: boolean
  onStarter: (message: string) => void
}) {
  const t = studioText(locale)
  // Three choices is the most a first-time owner should have to compare. A
  // deep-linked question stays first; the action's contextual starter and the
  // model-backed IG workflow stay ahead of generic briefing chips.
  const allStarters = chips.length > 0 ? chips : t.empty.starters.map((starter) => ({ id: starter.id, label: starter.label, message: starter.message }))
  const rank = (id: string) => id.startsWith("ask:") ? 0 : id.startsWith("action:") ? 1 : id === "starter_ig" ? 2 : 3
  const starters = [...allStarters].sort((a, b) => rank(a.id) - rank(b.id)).slice(0, 3)
  return (
    <div className="studio-empty">
      <div className="studio-empty-inner">
        <p className="eyebrow"><Sparkles aria-hidden="true" /> {t.empty.eyebrow} · {workspaceName}</p>
        <h2>{t.empty.title}</h2>
        <p className="studio-empty-body">{t.empty.body}</p>
        <ul className="studio-starters" aria-label={t.empty.eyebrow}>
          {starters.map((chip) => (
            <li key={chip.id}>
              <button type="button" className="studio-starter" disabled={disabled} onClick={() => onStarter(chip.message)}>
                <span>{chip.label}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="studio-boundary"><ShieldCheck aria-hidden="true" /> {t.empty.boundary}</p>
      </div>
    </div>
  )
}
