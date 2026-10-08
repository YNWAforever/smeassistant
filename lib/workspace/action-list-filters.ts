import { ASSIGNMENT_UUID } from "./action-assignment";
import { monthWindow } from "./month-window";
export type DueFilter = "overdue" | "today" | "next_7_days" | "none";
export interface ListFilterInput { q?: string; assignee?: string; due?: DueFilter }
export interface ListFilterScope { q: string | null; assignee: string | null; due: DueFilter | null; timezone: string; today: string; tomorrow: string; next7: string; now: string }
export function actionListFilters(input: ListFilterInput, timezone: string, now = new Date()): ListFilterScope {
  if ((input.q !== undefined && (typeof input.q !== "string" || input.q.trim().length > 200))
    || (input.assignee !== undefined && input.assignee !== "unassigned" && !ASSIGNMENT_UUID.test(input.assignee))
    || (input.due !== undefined && !["overdue", "today", "next_7_days", "none"].includes(input.due))) throw new Error("invalid_action_filter");
  monthWindow("2026-01", timezone); // Same validated workspace IANA contract; no offset arithmetic.
  const parts = new Intl.DateTimeFormat("en", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (key: string) => parts.find(p => p.type === key)!.value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  const after = (days: number) => { const date = new Date(`${today}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
  return { q: input.q?.trim() || null, assignee: input.assignee?.toLowerCase() ?? null, due: input.due ?? null, timezone, today, tomorrow: after(1), next7: after(7), now: now.toISOString() };
}
