import {
  MAX_EVIDENCE_ROWS,
  MAX_INPUT_RECORDS,
  MAX_SEARCH_GROUPS,
  type Coverage,
  type SearchMetric,
  type SearchObservation,
} from './types';
import type { QueryCohort, QueryFact } from '../comparison/types';

type RecordValue = Record<string, unknown>;
type Surface = SearchMetric['surface'];
type Outcome = SearchObservation['outcome'];
const ENGINES = new Set(['google', 'google_maps', 'google_ai_mode', 'google_ai_overview']);
const CONTEXT_KEYS = ['gl', 'hl', 'location', 'device', 'll'] as const;

function record(value: unknown): RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue : {};
}
function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function text(value: unknown, limit: number): string {
  return typeof value === 'string'
    ? value.replace(/https?:\/\/\S+/gi, '[url]').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit)
    : '';
}
function date(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T/.exec(value);
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
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}
function hasResult(value: unknown): boolean {
  return Array.isArray(value) && value.slice(0, MAX_INPUT_RECORDS).some(item => {
    const result = record(item);
    return nonempty(result.title) || nonempty(result.snippet) || nonempty(result.link) || nonempty(result.url);
  });
}
function hasReferences(value: unknown): boolean {
  return Array.isArray(value) && value.slice(0, MAX_INPUT_RECORDS).some(item => {
    const ref = record(item);
    return nonempty(ref.link) || nonempty(ref.title) || nonempty(ref.source);
  });
}
function hasSnippet(value: unknown, sources: string[]): boolean {
  return Array.isArray(value) && value.slice(0, MAX_INPUT_RECORDS).some(item => {
    const snippet = record(item);
    return typeof snippet.source === 'string' && sources.includes(snippet.source) && nonempty(snippet.text);
  });
}
function coverage(truncated: boolean): Coverage {
  return {
    inspected: 0, duplicates: 0,
    excluded: { unknown: 0, failed: 0, unsupported: 0, no_answer: 0, conflict: 0, unidentified: 0 },
    truncated, evidenceTruncated: false,
  };
}

interface Observation {
  identity: string;
  signature: string;
  groupKey: string;
  engine: string;
  queryType: string | null;
  context: string;
  surface: Surface;
  row: SearchObservation;
  rawQuery: string;
  cohortKey: string | null;
  cohortLabel: string;
  cohortScope: { queryType: string; gl: string; hl: string; location: string; device: string; ll: string | null } | null;
}

function normalize(value: unknown, legacy: boolean, index: number): Observation[] {
  const run = record(value);
  const settings = record(run.settings);
  // Full context is kept only as an internal key: display truncation must not merge markets.
  const contextValues = CONTEXT_KEYS.map(key => typeof settings[key] === 'string' ? settings[key] : null);
  const contextKey = JSON.stringify(contextValues);
  const context = JSON.stringify(Object.fromEntries(CONTEXT_KEYS.map((key, i) => [key, contextValues[i] === null ? null : text(contextValues[i], 200)])));
  const engine = typeof run.engine === 'string' ? run.engine : '';
  const queryType = typeof run.query_type === 'string' ? run.query_type : null;
  const rawQuery = typeof run.query === 'string' ? run.query : '';
  const hasRequiredContext = nonempty(engine) && nonempty(rawQuery) && nonempty(run.query_type)
    && CONTEXT_KEYS.every(key => key === 'll' ? (settings[key] === null || nonempty(settings[key])) : nonempty(settings[key]));
  const identity = nonempty(run.id)
    ? JSON.stringify(['id', run.id, contextKey])
    : rawQuery ? JSON.stringify(['query', rawQuery, engine, queryType, contextKey, run.requested_at ?? null])
      : JSON.stringify(['unidentified', index]);
  const surfaces: Surface[] = engine === 'google' ? ['organic', 'ai']
    : engine === 'google_maps' ? ['maps']
      : engine === 'google_ai_mode' || engine === 'google_ai_overview' ? ['ai'] : ['organic'];
  const meta = record(run.serpapi);
  const presence = legacy ? run : record(run.merchant_presence);
  const refs = legacy ? run : record(run.raw_refs);
  const answer = record(engine === 'google' ? run.ai_overview : run.ai_mode);
  const error = typeof meta.error === 'string' ? meta.error : '';
  const unsupported = (nonempty(engine) && !ENGINES.has(engine)) || run.unsupported === true || /unsupported|not supported|isn'?t supported|not available on your plan/i.test(error);
  const failed = nonempty(error) || (meta.error != null && typeof meta.error !== 'string') || (legacy ? run.available === false : nonempty(meta.status) && meta.status !== 'Success');
  const success = legacy ? run.available === true : meta.status === 'Success';
  const structural = ENGINES.has(engine) && (!legacy || engine === 'google' || engine === 'google_ai_mode') && nonempty(rawQuery) && (run.query_type == null || typeof run.query_type === 'string')
    && (legacy || (run.merchant_presence !== null && typeof run.merchant_presence === 'object' && !Array.isArray(run.merchant_presence)));

  return surfaces.map(surface => {
    const rank = legacy ? run.brand_organic_rank : presence[surface === 'maps' ? 'maps_rank' : 'organic_rank'];
    const surfaceProof = hasResult(refs[surface === 'maps' ? 'maps_results' : 'organic_results'])
      || (!legacy && hasSnippet(run.evidence_snippets, [surface]));
    const answerProof = legacy
      ? nonempty(answer.text) || hasReferences(answer.sources)
      : nonempty(refs.ai_overview_text) || nonempty(refs.ai_mode_markdown) || hasReferences(refs.ai_references)
        || hasSnippet(run.evidence_snippets, engine === 'google' ? ['ai_overview'] : ['ai_overview', 'ai_mode']);
    // A retained legacy overview object is equivalent trigger evidence; bare booleans are not.
    const triggered = engine !== 'google' || (legacy ? Object.keys(answer).length > 0 : refs.ai_overview_triggered === true);
    const mention = legacy ? answer.brand_mentioned : presence.ai_mentioned;
    let outcome: Outcome;
    if (unsupported) outcome = 'unsupported';
    else if (failed) outcome = 'failed';
    else if (!success || !structural) outcome = 'unknown';
    else if (surface === 'ai') {
      outcome = !triggered || !answerProof ? 'no_answer'
        : typeof mention !== 'boolean' ? 'unknown' : mention ? 'present' : 'absent';
    } else if (typeof rank === 'number' && Number.isSafeInteger(rank) && rank > 0) {
      outcome = 'present';
    } else {
      // Null rank can mean a fuzzy match. Never turn that hint into a measured absence.
      outcome = rank === null && surfaceProof && presence.found !== true && presence.confidence !== 'low'
        ? 'absent' : 'unknown';
    }
    return {
      identity,
      // Compare validated measurement facts, not error text, provider URLs, or key ordering.
      signature: JSON.stringify([rawQuery, engine, queryType, contextKey, run.requested_at ?? null, surface,
        outcome, success, failed, unsupported, structural, typeof rank, String(rank), surfaceProof,
        answerProof, triggered, typeof mention === 'boolean' ? mention : null, presence.found ?? null, presence.confidence ?? null]),
      groupKey: JSON.stringify([engine, queryType, contextKey, surface]),
      engine: ENGINES.has(engine) ? engine : nonempty(engine) ? 'unsupported' : 'unknown',
      queryType: queryType === null ? null : text(queryType, 100), context, surface,
      row: { query: text(rawQuery, 500), observedAt: date(run.requested_at), outcome },
      rawQuery,
      cohortKey: hasRequiredContext ? JSON.stringify([engine, run.query_type, settings.gl, settings.hl,
        settings.location, settings.device, settings.ll, surface]) : null,
      cohortLabel: text(settings.location, 200),
      cohortScope: hasRequiredContext ? { queryType: text(run.query_type, 100), gl: text(settings.gl, 20), hl: text(settings.hl, 35),
        location: text(settings.location, 200), device: text(settings.device, 35), ll: settings.ll === null ? null : text(settings.ll, 100) } : null,
    };
  });
}

/** Server-only exact query cohorts. Keys and unsliced queries must never enter report props. */
export function deriveComparisonSearchCohorts(rawAeo: unknown): QueryCohort[] {
  const aeo = record(rawAeo);
  const merchant = record(aeo.merchant_performance);
  const hasMerchantRuns = Object.prototype.hasOwnProperty.call(merchant, 'runs');
  const input = hasMerchantRuns ? merchant.runs : aeo.serpapi_runs;
  if (!Array.isArray(input)) return [];
  const inputTruncated = input.length > MAX_INPUT_RECORDS;
  const groups = new Map<string, { engine: string; surface: Surface; label: string; scope: NonNullable<Observation['cohortScope']>;
    facts: Map<string, Array<{ outcome: QueryFact['outcome']; observedAt: string | null }>> }>();
  for (const [index, value] of input.slice(0, MAX_INPUT_RECORDS).entries()) {
    for (const observation of normalize(value, !hasMerchantRuns, index)) {
      if (observation.cohortKey === null) continue;
      const group = groups.get(observation.cohortKey) ?? {
        engine: observation.engine, surface: observation.surface, label: observation.cohortLabel, scope: observation.cohortScope!, facts: new Map(),
      };
      const facts = group.facts.get(observation.rawQuery) ?? [];
      facts.push({ outcome: observation.row.outcome === 'present' || observation.row.outcome === 'absent'
        ? observation.row.outcome : 'unknown', observedAt: observation.row.observedAt });
      group.facts.set(observation.rawQuery, facts);
      groups.set(observation.cohortKey, group);
    }
  }
  const groupsTruncated = groups.size > MAX_SEARCH_GROUPS;
  return [...groups.entries()].slice(0, MAX_SEARCH_GROUPS).map(([key, group]) => {
    const facts: QueryFact[] = [];
    for (const [query, observations] of group.facts) {
      const outcomes = new Set(observations.map(item => item.outcome));
      if (outcomes.size !== 1 || outcomes.has('unknown')) continue;
      const timestamps = new Set(observations.map(item => item.observedAt));
      facts.push({ query, outcome: observations[0].outcome,
        observedAt: timestamps.size === 1 ? observations[0].observedAt : null });
    }
    return { key, engine: group.engine, surface: group.surface, label: group.label, ...group.scope, facts,
      complete: !inputTruncated && !groupsTruncated && facts.length <= MAX_EVIDENCE_ROWS };
  });
}

/** Derive confirmed appearances within captured surfaces, never broad online absence. */
export function deriveSearchMetrics(rawAeo: unknown): { groups: SearchMetric[]; omittedGroups: number } {
  const aeo = record(rawAeo);
  const merchant = record(aeo.merchant_performance);
  const hasMerchantRuns = Object.prototype.hasOwnProperty.call(merchant, 'runs');
  const input = hasMerchantRuns ? merchant.runs : aeo.serpapi_runs;
  if (!Array.isArray(input)) return { groups: [], omittedGroups: 0 };
  const truncated = input.length > MAX_INPUT_RECORDS;
  const identities = new Map<string, Observation[][]>();
  const groups = new Map<string, SearchMetric>();
  for (const [index, value] of input.slice(0, MAX_INPUT_RECORDS).entries()) {
    const observations = normalize(value, !hasMerchantRuns, index);
    const entries = identities.get(observations[0].identity) ?? [];
    entries.push(observations);
    identities.set(observations[0].identity, entries);
    for (const observation of observations) {
      if (!groups.has(observation.groupKey)) {
        groups.set(observation.groupKey, {
          engine: observation.engine, queryType: observation.queryType,
          context: observation.context, surface: observation.surface,
          numerator: 0, denominator: 0, state: 'unavailable', coverage: coverage(truncated), observations: [],
        });
      }
      groups.get(observation.groupKey)!.coverage.inspected++;
    }
  }
  for (const entries of identities.values()) {
    const firstSignature = JSON.stringify(entries[0].map(observation => observation.signature));
    const conflict = entries.some(entry => JSON.stringify(entry.map(observation => observation.signature)) !== firstSignature);
    const affected = new Map<string, Observation[]>();
    for (const observation of entries.flat()) {
      const rows = affected.get(observation.groupKey) ?? [];
      rows.push(observation);
      affected.set(observation.groupKey, rows);
    }
    for (const [key, rows] of affected) {
      const group = groups.get(key)!;
      group.coverage.duplicates += rows.length - 1;
      const row = { ...rows[0].row, outcome: conflict ? 'conflict' as const : rows[0].row.outcome };
      if (row.outcome === 'present' || row.outcome === 'absent') {
        group.denominator++;
        if (row.outcome === 'present') group.numerator++;
        group.state = 'measured';
      } else group.coverage.excluded[row.outcome]++;
      if (group.observations.length < MAX_EVIDENCE_ROWS) group.observations.push(row);
      else group.coverage.evidenceTruncated = true;
    }
  }
  return {
    groups: [...groups.values()].slice(0, MAX_SEARCH_GROUPS),
    omittedGroups: Math.max(0, groups.size - MAX_SEARCH_GROUPS),
  };
}
