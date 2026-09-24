/**
 * Reporting weeks: ISO weeks as the half-open interval
 * [Monday 00:00, next Monday 00:00) in Asia/Hong_Kong. Hong Kong has observed
 * no daylight saving since 1979, so the zone is a fixed UTC+8 and the
 * boundaries are plain arithmetic. Taiwan is also UTC+8, so one boundary serves
 * both markets. Half-open, so an event at exactly midnight belongs to one week.
 */
export const REPORT_TIMEZONE = "Asia/Hong_Kong";
const OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export interface ReportWeek {
  label: string;
  /** Inclusive, UTC instant of Monday 00:00 HKT. */
  start: Date;
  /** Exclusive, UTC instant of the following Monday 00:00 HKT. */
  end: Date;
}

/** 1 = Monday … 7 = Sunday, for a "local time stored as UTC" instant. */
function isoDay(localMs: number): number {
  const day = new Date(localMs).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Monday of ISO week 1 (the week containing 4 January), as local-as-UTC ms. */
function week1Monday(year: number): number {
  const jan4 = Date.UTC(year, 0, 4);
  return jan4 - (isoDay(jan4) - 1) * DAY_MS;
}

/** 28 December always falls in its year's last ISO week. */
function weeksInYear(year: number): number {
  return Math.floor((Date.UTC(year, 11, 28) - week1Monday(year)) / WEEK_MS) + 1;
}

function build(year: number, week: number): ReportWeek {
  const localStart = week1Monday(year) + (week - 1) * WEEK_MS;
  return {
    label: `${year}-W${String(week).padStart(2, "0")}`,
    start: new Date(localStart - OFFSET_MS),
    end: new Date(localStart + WEEK_MS - OFFSET_MS),
  };
}

export function parseIsoWeek(value: string): ReportWeek {
  const match = /^(\d{4})-W(\d{2})$/.exec(value);
  if (!match) throw new Error("configuration");
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > weeksInYear(year)) throw new Error("configuration");
  return build(year, week);
}

/** The ISO week containing `instant`, judged in Hong Kong time. */
export function weekContaining(instant: Date): ReportWeek {
  const local = instant.getTime() + OFFSET_MS;
  const localMidnight = Math.floor(local / DAY_MS) * DAY_MS;
  const monday = localMidnight - (isoDay(localMidnight) - 1) * DAY_MS;
  // The ISO year is the calendar year of that week's Thursday.
  const year = new Date(monday + 3 * DAY_MS).getUTCFullYear();
  return build(year, Math.round((monday - week1Monday(year)) / WEEK_MS) + 1);
}

/** The default: the last complete week. A partial week reads as a drop that is not real. */
export function lastCompleteWeek(now: Date): ReportWeek {
  return weekContaining(new Date(weekContaining(now).start.getTime() - DAY_MS));
}
