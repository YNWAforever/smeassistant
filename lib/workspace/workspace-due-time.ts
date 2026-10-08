import { assignmentTimestamp } from "./action-assignment";
import { monthWindow } from "./month-window";
/** Resolve a datetime-local input in the workspace's IANA zone; ambiguous DST inputs need a new choice. */
export function workspaceDueTimestamp(local: string, timezone: string): string {
  const normalized = local.length === 16 ? `${local}:00` : local;
  if (!assignmentTimestamp(`${normalized}Z`)) throw new Error("invalid_workspace_due_time");
  monthWindow(normalized.slice(0, 7), timezone);
  const formatter = new Intl.DateTimeFormat("en", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const zoned = (instant: number) => { const parts = formatter.formatToParts(instant); const part = (key: string) => parts.find(p => p.type === key)!.value; return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}`; };
  const naive = Date.parse(`${normalized}Z`), offsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) { const instant = naive + hours * 3_600_000; offsets.add(Date.parse(`${zoned(instant)}Z`) - instant); }
  const candidates = [...offsets].map(offset => naive - offset).filter(instant => zoned(instant) === normalized);
  if (candidates.length !== 1) throw new Error("invalid_workspace_due_time");
  return new Date(candidates[0]).toISOString();
}
