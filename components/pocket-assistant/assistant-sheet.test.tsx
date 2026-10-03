// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ContextualAssistant } from "@/components/pocket-assistant/assistant-sheet";
import { getMessages } from "@/lib/i18n";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const TRIGGER = { en: "Ask Visibility Operator", "zh-HK": "問隨身增長助理", "zh-TW": "問隨身增長助理" } as const;
const QUESTION = { en: "Draft one suitable review reply", "zh-HK": "示範 1 則合適的評論回覆", "zh-TW": "示範 1 則合適的評論回覆" } as const;

beforeEach(() => {
  if (!window.matchMedia)
    window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function ask(locale: keyof typeof TRIGGER) {
  render(<ContextualAssistant locale={locale} surface="actions" mode="live" context={{ workspaceId: WORKSPACE_ID }} />);
  fireEvent.click(screen.getByRole("button", { name: TRIGGER[locale] }));
  const question = await screen.findByRole("button", { name: QUESTION[locale] });
  await act(async () => {
    fireEvent.click(question);
  });
}

describe("ContextualAssistant and the AI drafting limit", () => {
  it.each(["en", "zh-HK", "zh-TW"] as const)("shows the %s limit message instead of a generic failure", async (locale) => {
    const fetchSpy = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({ error: "ai_budget_reached" }) }) as unknown as Response);
    vi.stubGlobal("fetch", fetchSpy);
    await ask(locale);
    expect(await screen.findByText(getMessages(locale).budget.aiLimit)).toBeInTheDocument();
    expect(screen.queryByText(locale === "en" ? "The run could not complete" : "暫時未能完成")).toBeNull();
    // The sheet also asks for suggestions on open (P4.3); one run request is what matters here.
    expect((fetchSpy.mock.calls as unknown[][]).filter(([url]) => url === "/api/assistant/run")).toHaveLength(1);
  });

  it("still reports any other failure as a failed run", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 429, json: async () => ({ error: "rate_limited" }) }) as unknown as Response));
    await ask("en");
    expect(await screen.findByText("The run could not complete")).toBeInTheDocument();
    expect(screen.queryByText(getMessages("en").budget.aiLimit)).toBeNull();
  });
});

describe("ContextualAssistant while AI drafting is paused (P3.5d)", () => {
  it.each(["en", "zh-HK", "zh-TW"] as const)("shows the %s pause message instead of a generic failure", async (locale) => {
    const fetchSpy = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({ error: "ai_paused" }) }) as unknown as Response);
    vi.stubGlobal("fetch", fetchSpy);
    await ask(locale);
    expect(await screen.findByText(getMessages(locale).pause.ai)).toBeInTheDocument();
    expect(screen.queryByText(locale === "en" ? "The run could not complete" : "暫時未能完成")).toBeNull();
    expect((fetchSpy.mock.calls as unknown[][]).filter(([url]) => url === "/api/assistant/run")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// P4.3: "Needs you now" suggestions and "Continue here" (Task 5)
// ---------------------------------------------------------------------------
const ACTION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VERSION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BASE_PATH = "/en/owner/kam-man-house";
const FIXED_FIRST = "Make it warmer without overpromising";
const CONTEXT = { workspaceId: WORKSPACE_ID, actionId: ACTION_ID, versionId: VERSION_ID };

const runResponse = (extra: Record<string, unknown> = {}) => ({
  runId: "live_run_x", state: "completed", answer: "An answer", nextAction: "Do the next thing", evidenceRefs: [], warnings: [], requiresApproval: false, demoBoundary: "b", ...extra,
});

const title = { en: "Review replies", "zh-HK": "回覆評論", "zh-TW": "回覆評論" };
const missingInputs = { id: "mi-1", kind: "missing_inputs", intentId: "explain_missing_inputs", label: { actionTitle: title }, context: { workspaceId: WORKSPACE_ID, actionId: ACTION_ID } };
const reviewVersion = { id: "rv-1", kind: "review_version", intentId: "where_to_continue", label: { actionTitle: title }, context: { workspaceId: WORKSPACE_ID, actionId: ACTION_ID, versionId: VERSION_ID }, nextStep: { kind: "review_version", actionId: ACTION_ID, versionId: VERSION_ID } };
const google = { id: "g-1", kind: "google", intentId: "where_to_continue", label: {}, context: { workspaceId: WORKSPACE_ID }, nextStep: { kind: "open_integrations" } };

type Call = { url: string; method: string; body: Record<string, unknown> | null; signal: AbortSignal | null | undefined };

function stubFetch(suggestions: (call: Call) => Promise<Response> | Response, run: () => Response = () => ({ ok: true, status: 200, json: async () => runResponse() }) as unknown as Response) {
  const calls: Call[] = [];
  const spy = vi.fn(async (url: string, init?: RequestInit) => {
    const call: Call = { url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null, signal: init?.signal };
    calls.push(call);
    return url.startsWith("/api/assistant/suggestions") ? suggestions(call) : run();
  });
  vi.stubGlobal("fetch", spy);
  return { calls, spy, suggestionCalls: () => calls.filter((c) => c.url.startsWith("/api/assistant/suggestions")), runCalls: () => calls.filter((c) => c.url === "/api/assistant/run") };
}

const suggestionsOk = (list: unknown[]) => () => ({ ok: true, status: 200, json: async () => ({ suggestions: list }) }) as unknown as Response;

type Props = Partial<React.ComponentProps<typeof ContextualAssistant>>;
async function open(props: Props = {}) {
  const locale = props.locale ?? "en";
  render(<ContextualAssistant locale={locale} surface="action" mode="live" context={CONTEXT} {...props} />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: TRIGGER[locale] }));
  });
}

describe("ContextualAssistant suggestions (P4.3)", () => {
  it("fetches with the context ids on open and shows suggestions above the fixed questions", async () => {
    const fetched = stubFetch(suggestionsOk([missingInputs, reviewVersion]));
    await open();
    const heading = await screen.findByText("Needs you now");
    const fixed = screen.getByRole("button", { name: FIXED_FIRST });
    expect(heading.compareDocumentPosition(fixed) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: "What detail do you need for Review replies?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Where do I continue?" })).toBeInTheDocument();
    const [call] = fetched.suggestionCalls();
    expect(fetched.suggestionCalls()).toHaveLength(1);
    const url = new URL(call.url, "https://app.test");
    expect(url.pathname).toBe("/api/assistant/suggestions");
    expect(Object.fromEntries(url.searchParams)).toEqual({ workspaceId: WORKSPACE_ID, actionId: ACTION_ID, versionId: VERSION_ID });
  });

  it.each(["zh-HK", "zh-TW"] as const)("localises the heading and the missing-inputs label in %s", async (locale) => {
    stubFetch(suggestionsOk([missingInputs]));
    await open({ locale });
    expect(await screen.findByText("現在需要你處理")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "「回覆評論」還需要甚麼資料？" })).toBeInTheDocument();
  });

  it("labels the Google suggestion without a title", async () => {
    stubFetch(suggestionsOk([google]));
    await open();
    expect(await screen.findByRole("button", { name: "Why reconnect Google?" })).toBeInTheDocument();
  });

  it("renders the fixed questions, enabled and clickable, while suggestions are still loading", async () => {
    const fetched = stubFetch(() => new Promise<Response>(() => {}));
    await open();
    const fixed = screen.getByRole("button", { name: FIXED_FIRST });
    expect(fixed).toBeEnabled();
    expect(screen.queryByText("Needs you now")).toBeNull();
    await act(async () => {
      fireEvent.click(fixed);
    });
    expect(fetched.runCalls()).toHaveLength(1);
  });

  it.each([[500], ["throw"], [{ nope: 1 }]])("falls back to the fixed list alone on %j", async (failure) => {
    stubFetch(() => {
      if (failure === "throw") throw new Error("network");
      if (typeof failure === "number") return { ok: false, status: failure, json: async () => ({ error: "x" }) } as unknown as Response;
      return { ok: true, status: 200, json: async () => failure } as unknown as Response;
    });
    await open();
    await act(async () => {});
    expect(screen.getByRole("button", { name: FIXED_FIRST })).toBeInTheDocument();
    expect(screen.queryByText("Needs you now")).toBeNull();
  });

  it("asks a suggestion with its own context and origin suggested", async () => {
    const fetched = stubFetch(suggestionsOk([reviewVersion]));
    await open();
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Where do I continue?" }));
    });
    const [run] = fetched.runCalls();
    expect(run.body).toMatchObject({ mode: "live", surface: "action", intentId: "where_to_continue", locale: "en", origin: "suggested", context: { workspaceId: WORKSPACE_ID, actionId: ACTION_ID, versionId: VERSION_ID } });
  });

  it("asks a fixed question with origin fixed in live mode", async () => {
    const fetched = stubFetch(suggestionsOk([]));
    await open();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: FIXED_FIRST }));
    });
    expect(fetched.runCalls()[0].body).toMatchObject({ intentId: "friendlier_review_reply", origin: "fixed", context: CONTEXT });
  });

  it("aborts the suggestions fetch when the sheet closes", async () => {
    const fetched = stubFetch(() => new Promise<Response>(() => {}));
    await open();
    const [call] = fetched.suggestionCalls();
    expect(call.signal?.aborted).toBe(false);
    await act(async () => {
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    });
    expect(call.signal?.aborted).toBe(true);
  });

  it("fetches again each time the sheet opens", async () => {
    const fetched = stubFetch(suggestionsOk([]));
    await open();
    await act(async () => {
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: TRIGGER.en }));
    });
    expect(fetched.suggestionCalls()).toHaveLength(2);
  });
});

describe("ContextualAssistant Continue here (P4.3)", () => {
  const withNextStep = (nextStep: unknown) => () => ({ ok: true, status: 200, json: async () => runResponse({ nextStep }) }) as unknown as Response;
  async function askFirst(props: Props, nextStep: unknown) {
    stubFetch(suggestionsOk([]), withNextStep(nextStep));
    await open(props);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: FIXED_FIRST }));
    });
    await screen.findByText("An answer");
  }

  it("renders a Continue here link from nextStep", async () => {
    await askFirst({ basePath: BASE_PATH }, { kind: "review_version", actionId: ACTION_ID, versionId: VERSION_ID });
    expect(screen.getByRole("link", { name: "Continue here" })).toHaveAttribute("href", `${BASE_PATH}/actions/${ACTION_ID}?version=${VERSION_ID}`);
  });

  it("keeps the page's location on the link", async () => {
    await askFirst({ basePath: BASE_PATH, locationParam: "yik-yam" }, { kind: "provide_inputs", actionId: ACTION_ID });
    expect(screen.getByRole("link", { name: "Continue here" })).toHaveAttribute("href", `${BASE_PATH}/actions/${ACTION_ID}?location=yik-yam#inputs`);
  });

  it.each([
    ["en", "Continue here"],
    ["zh-HK", "由這裡繼續"],
    ["zh-TW", "從這裡繼續"],
  ] as const)("labels the link in %s", async (locale, label) => {
    stubFetch(suggestionsOk([]), withNextStep({ kind: "open_actions" }));
    await open({ locale, basePath: `/${locale}/owner/kam-man-house` });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: locale === "en" ? FIXED_FIRST : "改得更親切，但不要過度承諾" }));
    });
    expect(await screen.findByRole("link", { name: label })).toHaveAttribute("href", `/${locale}/owner/kam-man-house/actions`);
  });

  it("renders no link without a basePath", async () => {
    await askFirst({}, { kind: "open_actions" });
    expect(screen.queryByRole("link", { name: "Continue here" })).toBeNull();
  });

  it("renders no link for a bad id", async () => {
    await askFirst({ basePath: BASE_PATH }, { kind: "open_action", actionId: "../../settings" });
    expect(screen.queryByRole("link", { name: "Continue here" })).toBeNull();
  });
});

describe("ContextualAssistant in demo mode (P4.3)", () => {
  it("never fetches suggestions or renders a link", async () => {
    const fetched = stubFetch(suggestionsOk([missingInputs]), () => ({ ok: true, status: 200, json: async () => runResponse({ nextStep: { kind: "open_actions" } }) }) as unknown as Response);
    await open({ mode: "demo", context: undefined, basePath: BASE_PATH });
    await act(async () => {});
    expect(fetched.suggestionCalls()).toHaveLength(0);
    expect(screen.queryByText("Needs you now")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Why are review replies the priority?" }));
    });
    await screen.findByText("An answer");
    expect(screen.queryByRole("link", { name: "Continue here" })).toBeNull();
    expect(fetched.runCalls()[0].body).not.toHaveProperty("origin");
    expect(fetched.suggestionCalls()).toHaveLength(0);
  });
});
