/**
 * Authorization/lookup failures of the live assistant. Lives apart from
 * `live.ts` so `suggestions.ts` can throw it while `live.ts` imports from
 * `suggestions.ts`, without an import cycle.
 */
export class AssistantAccessError extends Error {
  readonly status: 403 | 404;
  constructor(readonly code: "forbidden" | "not_found") {
    super(code);
    this.status = code === "forbidden" ? 403 : 404;
  }
}
