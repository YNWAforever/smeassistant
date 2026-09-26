/**
 * Incident kill switches (P3.5d, docs/superpowers/specs/2026-09-26-incident-runbook-design.md).
 *
 * Unset or empty = off; exactly "true" = on; anything else is a configuration
 * error, because an operator who typed TRUE must not believe spend is stopped.
 * Environment only, never the database, so a pause cannot fail on an outage.
 * Client-safe: no server imports.
 */
export const PAUSE_VARIABLES = ["SCANS_PAUSED", "AI_DRAFTS_PAUSED"] as const;
export type PauseVariable = (typeof PAUSE_VARIABLES)[number];

export interface PauseConfig {
  scans: boolean;
  ai: boolean;
}

export class PauseConfigurationError extends Error {
  constructor(readonly variable: PauseVariable) {
    super(`pause_configuration_invalid: ${variable}`);
    this.name = "PauseConfigurationError";
  }
}

type Env = Record<string, string | undefined>;

function flag(env: Env, variable: PauseVariable): boolean {
  const value = env[variable];
  if (value === undefined || value === "") return false;
  if (value === "true") return true;
  throw new PauseConfigurationError(variable);
}

export function readPauseConfig(env: Env): PauseConfig {
  return { scans: flag(env, "SCANS_PAUSED"), ai: flag(env, "AI_DRAFTS_PAUSED") };
}

/** What every entry point uses. An invalid value pauses both: never spend through a typo. */
export function pauseState(env: Env = process.env): PauseConfig {
  try {
    return readPauseConfig(env);
  } catch (error) {
    const variable = error instanceof PauseConfigurationError ? error.variable : "unknown";
    console.error("[pause] configuration_invalid", { variable });
    return { scans: true, ai: true };
  }
}

export type PauseEntry = "scan_start" | "rescan" | "retry_claim" | "ai_run" | "assistant_draft" | "llm";

/** The one line every paused refusal writes. Fixed text only. */
export function logPauseRefusal(entry: PauseEntry): void {
  console.warn("[pause] refused", { entry });
}
