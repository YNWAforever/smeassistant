export type ConnectorProvider = "gsc" | "firecrawl" | "dataforseo";
export type ConnectorStatus = "disabled" | "disconnected" | "reconnect" | "unsupported" | "empty" | "ready" | "partial" | "failed" | "blocked";
export interface ContextItem { title: string; text?: string; url?: string; metrics?: Record<string, number> }
export interface ConnectorContext {
  source: ConnectorProvider; status: ConnectorStatus; observedAt: string | null; scope: string;
  items: ContextItem[]; reason?: string;
  budget?: { workspaceRemainingUsd: number; accountRemainingUsd: number; reservedUsd: number };
  /** Present only on the market-filtered Stage 3 read; legacy worldwide context is not a baseline. */
  analytics?: {
    startDate: string; endDate: string; country: "hkg" | "twn"; searchType: "web";
    dimensions: "query"; dataState: "final"; aggregation: "byPage"; pageFilter: string; rowLimit: 25; reportedDays: number;
  };
}
