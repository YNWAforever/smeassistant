// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  approveVersion,
  createObjectiveAction,
  decideVersion,
  exportVersion,
  forgetIdempotencyKey,
  idempotencyKeyFor,
  mintIdempotencyKey,
  runAction,
  saveVersion,
  setAssetRights,
  updateAction,
  uploadAsset,
} from "./client";

const fetchMock = vi.fn();

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function lastCall(): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, init };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  window.sessionStorage.clear();
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mutation helpers", () => {
  it("posts a run and returns the parsed body", async () => {
    fetchMock.mockResolvedValue(reply(200, { runId: "r1", state: "succeeded", versionId: "v1", versionNo: 1 }));
    const result = await runAction("a1", { inputs: { text_only: true } });
    expect(result).toEqual({ ok: true, data: { runId: "r1", state: "succeeded", versionId: "v1", versionNo: 1 } });
    const { url, init } = lastCall();
    expect(url).toBe("/api/actions/a1/run");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ inputs: { text_only: true } });
  });

  it("maps a 409 to { ok: false, status, error } using the server's error code", async () => {
    fetchMock.mockResolvedValue(reply(409, { error: "version_conflict" }));
    const result = await saveVersion("a1", { body: "text", base_version_id: "v1" });
    expect(result).toEqual({ ok: false, status: 409, error: "version_conflict" });
    expect(JSON.parse(String(lastCall().init.body))).toEqual({ body: "text", base_version_id: "v1" });
  });

  it("never throws: a network failure and a non-JSON error body both come back as ok:false", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await approveVersion("v1", "looks good")).toEqual({ ok: false, status: 0, error: "network" });
    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 502 }));
    expect(await decideVersion("v1", "rejected")).toEqual({ ok: false, status: 502, error: "http_502" });
  });

  it("refuses to call fetch while the browser is offline", async () => {
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    expect(await updateAction("a1", { provided_inputs: { brand_voice: "warm" } })).toEqual({ ok: false, status: 0, error: "offline" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("routes decisions, patches and objective actions to the contract paths", async () => {
    fetchMock.mockResolvedValue(reply(200, { state: "changes_requested" }));
    await decideVersion("v9", "changes_requested", "tone");
    expect(lastCall().url).toBe("/api/versions/v9/request-changes");
    expect(JSON.parse(String(lastCall().init.body))).toEqual({ comment: "tone" });

    fetchMock.mockResolvedValue(reply(200, { action: { id: "a1" } }));
    await updateAction("a1", { provided_inputs: { brand_voice: "warm" } });
    expect(lastCall().url).toBe("/api/actions/a1");
    expect(lastCall().init.method).toBe("PATCH");

    fetchMock.mockResolvedValue(reply(201, { actionId: "a2", runId: "r2" }));
    const created = await createObjectiveAction({ workspace_id: "ws", template_key: "social-post", location_id: "loc", objective: "Lunch set", run: true });
    expect(created).toEqual({ ok: true, data: { actionId: "a2", runId: "r2" } });
    expect(lastCall().url).toBe("/api/actions");
  });

  it("uploads assets as multipart and patches rights as JSON", async () => {
    fetchMock.mockResolvedValue(reply(201, { assetId: "as1", signedUrl: "https://signed" }));
    const file = new File([new Uint8Array([1, 2, 3])], "lunch.jpg", { type: "image/jpeg" });
    const upload = await uploadAsset("ws", { file, kind: "image", location_id: "loc", alt_text: "Lunch set" });
    expect(upload).toEqual({ ok: true, data: { assetId: "as1", signedUrl: "https://signed" } });
    const form = lastCall().init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("kind")).toBe("image");
    expect(form.get("location_id")).toBe("loc");
    expect((form.get("file") as File).name).toBe("lunch.jpg");

    fetchMock.mockResolvedValue(reply(200, { ok: true, rights_status: "approved", rights_confirmed_at: "2026-09-03T00:00:00Z" }));
    await setAssetRights("ws", "as1", { rights_status: "approved" });
    expect(lastCall().url).toBe("/api/workspaces/ws/assets/as1");
    expect(lastCall().init.method).toBe("PATCH");
  });
});

describe("export idempotency key", () => {
  it("mints base64url keys of the contract length", () => {
    const key = mintIdempotencyKey();
    expect(key).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(mintIdempotencyKey()).not.toBe(key);
  });

  it("re-uses the same key for (versionId, mode) across calls, persisted in sessionStorage", async () => {
    fetchMock.mockResolvedValue(reply(200, { deliveryId: "d1", counted: true, usage: { period: "2026-09", approved_deliveries: 1, allowance: 3 } }));
    await exportVersion("v1", "export");
    const first = JSON.parse(String(lastCall().init.body)) as { mode: string; idempotency_key: string };
    expect(first.mode).toBe("export");
    expect(first.idempotency_key).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(window.sessionStorage.getItem("sme.export-key.v1.export")).toBe(first.idempotency_key);

    fetchMock.mockResolvedValue(reply(200, { deliveryId: "d1", counted: false, usage: { period: "2026-09", approved_deliveries: 1, allowance: 3 } }));
    await exportVersion("v1", "export");
    const second = JSON.parse(String(lastCall().init.body)) as { idempotency_key: string };
    expect(second.idempotency_key).toBe(first.idempotency_key);

    // A different mode or version gets its own key.
    expect(idempotencyKeyFor("v1", "copy")).not.toBe(first.idempotency_key);
    expect(idempotencyKeyFor("v2", "export")).not.toBe(first.idempotency_key);

    forgetIdempotencyKey("v1", "export");
    expect(idempotencyKeyFor("v1", "export")).not.toBe(first.idempotency_key);
  });

  it("falls back to memory when sessionStorage is unavailable", () => {
    const original = window.sessionStorage;
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    try {
      const a = idempotencyKeyFor("v7", "copy");
      expect(idempotencyKeyFor("v7", "copy")).toBe(a);
      expect(a).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    } finally {
      Object.defineProperty(window, "sessionStorage", { configurable: true, value: original });
      forgetIdempotencyKey("v7", "copy");
    }
  });
});
