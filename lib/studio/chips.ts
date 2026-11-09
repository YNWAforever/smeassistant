import type { StudioPromptChip } from "./types";

/**
 * The briefing can replace the generic starters with contextual prompt chips.
 * Some workflows (e.g. the IG planning starter) should remain available either
 * way, without duplicating a chip the briefing already supplied.
 */
export function ensureStudioStarter(
  chips: readonly StudioPromptChip[],
  starters: readonly { id: string; label: string; message: string }[],
  starterId: string,
): StudioPromptChip[] {
  const starter = starters.find((candidate) => candidate.id === starterId);
  if (!starter) return [...chips];
  if (chips.some((chip) => chip.id === starter.id)) return [...chips];
  return [{ id: starter.id, label: starter.label, message: starter.message }, ...chips];
}
