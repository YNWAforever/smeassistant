import type { BrandRow } from "@/lib/workspace/brand"
import type { EffortSignalsRow } from "@/lib/repositories/workspace-read"

/**
 * Today's progress and badges. Everything here counts what the owner DID
 * (confirmed, copied, finished, filled in), never what it achieved: no
 * points, no implied visibility or revenue change (CLAUDE.md §0 guardrails
 * 3 and 4; the 2026-10-19 "graphics stay honest" rule). Pure functions; the
 * loader lives with the page that reads it.
 */

export type BadgeKey = "first_confirm" | "first_copy" | "five_done" | "profile_complete" | "streak_4"
export type Badge = { key: BadgeKey; earned: boolean }

export type ProfileItemKey = "voice" | "facts" | "claims" | "photo" | "google" | "instagram"
export type ProfileItem = { key: ProfileItemKey; done: boolean }

export type ProfileLevel = { items: ProfileItem[]; done: number; total: number; level: 1 | 2 | 3 | 4 }

/** One of the shop's own confirmed photos, with a short-lived signed URL. */
export type ShopPhoto = { id: string; url: string; alt: string }

export type MonthProgress = { done: number; open: number; total: number; percent: number }

export type Progress = {
  month: MonthProgress
  streakWeeks: number
  /** True when this week already has an effort event; false means the streak is from last week and still alive. */
  activeThisWeek: boolean
  badges: Badge[]
  profile: ProfileLevel
}

/** Done this month out of everything on the owner's plate this month (done + still open). */
export function monthProgress(done: number, open: number): MonthProgress {
  const safeDone = Math.max(0, Math.trunc(done))
  const safeOpen = Math.max(0, Math.trunc(open))
  const total = safeDone + safeOpen
  return { done: safeDone, open: safeOpen, total, percent: total === 0 ? 0 : Math.round((safeDone / total) * 100) }
}

function shiftWeek(monday: string, weeks: number): string {
  const [y, m, d] = monday.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + weeks * 7))
  return date.toISOString().slice(0, 10)
}

/**
 * Consecutive active weeks ending this week, or ending last week when this
 * week has nothing yet (the streak is still alive until the week is over).
 */
export function weeklyStreak(activeWeeks: readonly string[], thisWeek: string): { weeks: number; activeThisWeek: boolean } {
  const active = new Set(activeWeeks)
  const activeThisWeek = active.has(thisWeek)
  let cursor = activeThisWeek ? thisWeek : shiftWeek(thisWeek, -1)
  let weeks = 0
  while (active.has(cursor)) {
    weeks += 1
    cursor = shiftWeek(cursor, -1)
  }
  return { weeks, activeThisWeek }
}

/** Six things that let Kinnso write well for the shop; the level is how many are filled in. */
export function profileLevel(input: {
  brand: Pick<BrandRow, "voice" | "facts" | "approved_claims"> | null
  approvedPhotos: number
  googleConnected: boolean
  instagramHandle: string | null
}): ProfileLevel {
  const facts = input.brand?.facts && typeof input.brand.facts === "object" ? Object.keys(input.brand.facts).length : 0
  const items: ProfileItem[] = [
    { key: "voice", done: Boolean(input.brand?.voice) },
    { key: "facts", done: facts > 0 },
    { key: "claims", done: (input.brand?.approved_claims?.length ?? 0) > 0 },
    { key: "photo", done: input.approvedPhotos > 0 },
    { key: "google", done: input.googleConnected },
    { key: "instagram", done: Boolean(input.instagramHandle) },
  ]
  const done = items.filter((item) => item.done).length
  const level = done >= 6 ? 4 : done >= 4 ? 3 : done >= 2 ? 2 : 1
  return { items, done, total: items.length, level }
}

export function badges(signals: Pick<EffortSignalsRow, "approved" | "delivered" | "completed">, streakWeeks: number, profile: ProfileLevel): Badge[] {
  return [
    { key: "first_confirm", earned: signals.approved > 0 },
    { key: "first_copy", earned: signals.delivered > 0 },
    { key: "five_done", earned: signals.completed >= 5 },
    { key: "profile_complete", earned: profile.done === profile.total },
    { key: "streak_4", earned: streakWeeks >= 4 },
  ]
}

export function buildProgress(input: {
  signals: EffortSignalsRow
  monthDone: number
  open: number
  profile: ProfileLevel
}): Progress {
  const streak = weeklyStreak(input.signals.active_weeks ?? [], input.signals.this_week)
  return {
    month: monthProgress(input.monthDone, input.open),
    streakWeeks: streak.weeks,
    activeThisWeek: streak.activeThisWeek,
    badges: badges(input.signals, streak.weeks, input.profile),
    profile: input.profile,
  }
}
