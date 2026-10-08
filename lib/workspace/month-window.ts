export interface MonthWindow {
  period: string;
  timezone: string;
  startLocalDate: string;
  endLocalDate: string;
}

/** A workspace-local half-open month. PostgreSQL resolves local midnights, including DST. */
export function monthWindow(period: string, timezone: string): MonthWindow {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(period) || Number(period.slice(0, 4)) < 1) throw new Error("invalid_month_period");
  try {
    if (!timezone || timezone.trim() !== timezone || /^[+-]/.test(timezone)) throw new Error();
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(0);
  } catch { throw new Error("invalid_workspace_timezone"); }
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5));
  const next = month === 12 ? `${String(year + 1).padStart(4, "0")}-01` : `${period.slice(0, 4)}-${String(month + 1).padStart(2, "0")}`;
  return { period, timezone, startLocalDate: `${period}-01`, endLocalDate: `${next}-01` };
}
