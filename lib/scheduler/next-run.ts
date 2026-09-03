/**
 * Anniversary-day scheduling maths. Pure, UTC-only, no clock of its own — the
 * caller passes `now`, so a test can sit on any instant without faking timers.
 *
 * Everything here is UTC. A HK merchant's "monthly" scan does not need to land
 * at a particular local hour, and mixing a local calendar into date arithmetic
 * is how a scheduler acquires a once-a-year DST bug.
 */

export const MIN_ANNIVERSARY_DAY = 1;
export const MAX_ANNIVERSARY_DAY = 28;

function parseUtc(iso: string): Date {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) throw new Error(`unparseable timestamp: ${iso}`);
  return parsed;
}

function assertAnniversaryDay(day: number): void {
  if (!Number.isInteger(day) || day < MIN_ANNIVERSARY_DAY || day > MAX_ANNIVERSARY_DAY) {
    throw new Error(`anniversary day must be an integer ${MIN_ANNIVERSARY_DAY}-${MAX_ANNIVERSARY_DAY}`);
  }
}

/**
 * The anniversary day to give a merchant whose first scan happened at `iso`.
 * Clamped to 28 rather than rejected: a merchant who first scanned on the 31st
 * still deserves a schedule, and 28 is the latest day every month has.
 */
export function anniversaryDayFrom(iso: string): number {
  return Math.min(parseUtc(iso).getUTCDate(), MAX_ANNIVERSARY_DAY);
}

/** The next anniversary instant strictly after `fromIso`, at 00:00 UTC. */
export function nextRunAfter(fromIso: string, anniversaryDay: number): string {
  assertAnniversaryDay(anniversaryDay);
  const from = parseUtc(fromIso);

  const candidate = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), anniversaryDay, 0, 0, 0, 0),
  );
  if (candidate.getTime() > from.getTime()) return candidate.toISOString();

  return new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, anniversaryDay, 0, 0, 0, 0),
  ).toISOString();
}
