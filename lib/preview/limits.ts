/**
 * Limits of the unsaved preview draft (spec §2.2).
 *
 * Fixed: 1 per grant and 3 per job (enforced by `claim_preview_slot`), and 5
 * per source IP per day (rate-limit scope `preview_draft`). Overridable:
 * `PREVIEW_DRAFT_DAILY_LIMIT` (positive integer, default 50) and
 * `PREVIEW_DRAFT_USD_DAILY` (positive decimal, default 2). An unset or blank
 * variable takes the default; any other invalid value throws, and the route
 * turns that into `unavailable`, so a typo fails closed instead of lifting a cap.
 */
export interface PreviewLimits {
  perIpDaily: 5;
  globalDaily: number;
  usdDaily: number;
}

const DEFAULT_GLOBAL_DAILY = 50;
const DEFAULT_USD_DAILY = 2;
/** `claim_preview_slot` takes the global cap as a PostgreSQL `int`. */
const MAX_INT4 = 2_147_483_647;

function invalid(): never {
  throw new Error("preview_limits_invalid");
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  if (!/^[1-9]\d*$/.test(value)) invalid();
  const parsed = Number(value);
  return parsed <= MAX_INT4 ? parsed : invalid();
}

function positiveDecimal(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+(?:\.\d+)?$/.test(value)) invalid();
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : invalid();
}

export function readPreviewLimits(env: Record<string, string | undefined> = process.env): PreviewLimits {
  return {
    perIpDaily: 5,
    globalDaily: positiveInteger(env.PREVIEW_DRAFT_DAILY_LIMIT, DEFAULT_GLOBAL_DAILY),
    usdDaily: positiveDecimal(env.PREVIEW_DRAFT_USD_DAILY, DEFAULT_USD_DAILY),
  };
}
