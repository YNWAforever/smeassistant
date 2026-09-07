import {
  MAX_EVIDENCE_ROWS,
  MAX_INPUT_RECORDS,
  type Coverage,
  type IgObservation,
  type IgSample,
} from './types';

type UnknownRecord = Record<string, unknown>;

interface GroupedObservation {
  identity: string;
  dates: Set<string>;
  likes: Set<number>;
  comments: Set<number>;
}

const ISO_DATE =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2}))?$/;
const INSTAGRAM_PATH = /^\/(p|reel)\/([A-Za-z0-9_-]+)\/?$/;
const SENSITIVE_QUERY_PARTS = new Set([
  'token', 'secret', 'password', 'passwd', 'credential', 'credentials',
  'authorization', 'auth', 'signature', 'sig', 'jwt',
]);
const SENSITIVE_QUERY_COMPACT_NAMES = new Set([
  'key', 'apikey', 'xapikey', 'accesstoken', 'refreshtoken', 'idtoken',
  'clientsecret', 'apisecret', 'privatekey', 'subscriptionkey',
  'ocpapimsubscriptionkey', 'xamzcredential', 'xamzsignature',
  'xamzsecuritytoken', 'xgoogcredential', 'xgoogsignature',
  'xgoogalgorithm', 'googleaccessid',
]);

function isSensitiveQueryName(value: string): boolean {
  const separated = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  const parts = separated.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const compact = parts.join('');
  return SENSITIVE_QUERY_COMPACT_NAMES.has(compact)
    || parts.some((part) => SENSITIVE_QUERY_PARTS.has(part));
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function date(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = ISO_DATE.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendarCheck = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() !== month - 1 ||
    calendarCheck.getUTCDate() !== day
  ) {
    return null;
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function boundedId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 &&
    trimmed.length <= 300 &&
    !/[\u0000-\u001f\u007f]/.test(trimmed)
    ? trimmed
    : null;
}

function instagramUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;

  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== 'https:' ||
      (parsed.hostname !== 'instagram.com' && parsed.hostname !== 'www.instagram.com') ||
      parsed.username ||
      parsed.password ||
      !INSTAGRAM_PATH.test(parsed.pathname)
    ) {
      return null;
    }
    for (const key of parsed.searchParams.keys()) {
      if (isSensitiveQueryName(key)) return null;
    }

    const path = parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname}/`;
    const canonical = `https://www.instagram.com${path}`;
    return canonical.length <= 300 ? canonical : null;
  } catch {
    return null;
  }
}

function identity(record: UnknownRecord): string | null {
  return boundedId(record.id) ?? instagramUrl(record.permalink) ?? instagramUrl(record.url);
}

function emptyCoverage(inspected: number, truncated: boolean): Coverage {
  return {
    inspected,
    duplicates: 0,
    excluded: {
      unknown: 0,
      failed: 0,
      unsupported: 0,
      no_answer: 0,
      conflict: 0,
      unidentified: 0,
    },
    truncated,
    evidenceTruncated: false,
  };
}

function onlyValue<T>(values: Set<T>): T | null {
  return values.size === 1 ? values.values().next().value ?? null : null;
}

function toObservation(group: GroupedObservation): IgObservation {
  const postedAt = onlyValue(group.dates);
  const likes = onlyValue(group.likes);
  const comments = onlyValue(group.comments);
  return {
    identity: group.identity,
    postedAt,
    likes,
    comments,
    ambiguousZero: likes === 0 || comments === 0,
  };
}

export function deriveInstagramSample(rawIg: unknown): IgSample | null {
  if (!isRecord(rawIg) || !Array.isArray(rawIg.posts)) return null;

  const source = rawIg.posts;
  const records = source.slice(0, MAX_INPUT_RECORDS);
  const coverage = emptyCoverage(records.length, source.length > MAX_INPUT_RECORDS);
  const groups = new Map<string, GroupedObservation>();
  const evidenceOrder: Array<GroupedObservation | IgObservation> = [];

  for (const value of records) {
    const record = isRecord(value) ? value : {};
    const normalizedIdentity = identity(record);
    const postedAt = date(record.posted_at);
    const likes = count(record.like_count);
    const comments = count(record.comment_count);

    if (normalizedIdentity === null) {
      coverage.excluded.unidentified += 1;
      evidenceOrder.push({
        identity: null,
        postedAt,
        likes,
        comments,
        ambiguousZero: likes === 0 || comments === 0,
      });
      continue;
    }

    const existing = groups.get(normalizedIdentity);
    if (existing) {
      coverage.duplicates += 1;
      if (postedAt !== null) existing.dates.add(postedAt);
      if (likes !== null) existing.likes.add(likes);
      if (comments !== null) existing.comments.add(comments);
      continue;
    }

    const group: GroupedObservation = {
      identity: normalizedIdentity,
      dates: new Set(postedAt === null ? [] : [postedAt]),
      likes: new Set(likes === null ? [] : [likes]),
      comments: new Set(comments === null ? [] : [comments]),
    };
    groups.set(normalizedIdentity, group);
    evidenceOrder.push(group);
  }

  for (const group of groups.values()) {
    if (group.dates.size > 1 || group.likes.size > 1 || group.comments.size > 1) {
      coverage.excluded.conflict += 1;
    }
  }

  const observations = evidenceOrder.map((entry) =>
    'dates' in entry ? toObservation(entry) : entry,
  );
  coverage.evidenceTruncated = observations.length > MAX_EVIDENCE_ROWS;

  const identified = Array.from(groups.values(), toObservation);
  const dated = identified
    .map((observation) => observation.postedAt)
    .filter((value): value is string => value !== null)
    .sort();

  return {
    distinctPosts: groups.size,
    datedPosts: dated.length,
    earliest: dated[0] ?? null,
    latest: dated.at(-1) ?? null,
    engagement: 'unavailable_historical_counts',
    coverage,
    observations: observations.slice(0, MAX_EVIDENCE_ROWS),
  };
}
