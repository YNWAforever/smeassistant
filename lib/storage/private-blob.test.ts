import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPrivateBlobStorage } from "./private-blob";

// Load the very same undici instance used by the installed SDK, and forbid ALL
// real transport, including unanticipated retries and inherited credentials.
const require = createRequire(import.meta.url);
const { MockAgent, getGlobalDispatcher, setGlobalDispatcher, fetch: sdkFetch } = require(require.resolve("undici", { paths: [require.resolve("@vercel/blob")] }));
const token = "vercel_blob_rw_fixture_012345678901234567890123456789";
const origin = "https://fixture.private.blob.vercel-storage.com";
let mock: InstanceType<typeof MockAgent>;
let previous: ReturnType<typeof getGlobalDispatcher>;
beforeEach(() => {
  previous = getGlobalDispatcher();
  mock = new MockAgent(); mock.disableNetConnect(); setGlobalDispatcher(mock);
  vi.stubEnv("VERCEL_BLOB_API_URL", ""); vi.stubEnv("NEXT_PUBLIC_VERCEL_BLOB_API_URL", "");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("network forbidden"); }));
});
afterEach(async () => { setGlobalDispatcher(previous); await mock.close(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function storage() { return createPrivateBlobStorage({ token, storeId: "store_fixture" }); }

describe("native private Blob transport", () => {
  it("issues exact GET delegation and signs the private namespaced pathname for 60 seconds", async () => {
    const before = Date.now();
    let scope: Record<string, unknown> = {};
    mock.get("https://vercel.com").intercept({ path: "/api/blob/signed-token", method: "POST" }).reply(200, (opts: { body: string }) => {
      scope = JSON.parse(opts.body);
      return { delegationToken: Buffer.from(JSON.stringify({ storeId: "store_fixture", ...scope })).toString("base64url") + ".fixture", clientSigningToken: Buffer.from("fixture-signing-key").toString("base64url"), validUntil: scope.validUntil };
    });
    const signed = new URL(await storage().sign("workspace-assets", "workspace/asset/photo.png", 60));
    expect(scope).toMatchObject({ pathname: "workspace-assets/workspace/asset/photo.png", operations: ["get"] });
    expect(Number(scope.validUntil)).toBeGreaterThanOrEqual(before + 60_000);
    expect(Number(scope.validUntil)).toBeLessThanOrEqual(Date.now() + 60_000);
    expect(signed.origin).toBe(origin);
    expect(signed.pathname).toBe("/workspace-assets/workspace/asset/photo.png");
    expect([...signed.searchParams.keys()].sort()).toEqual(["vercel-blob-delegation", "vercel-blob-signature"]);
    expect(signed.href).not.toContain(token);
    mock.get(origin).intercept({ path: signed.pathname + signed.search, method: "GET" }).reply(200, "fixture-image");
    expect(await (await sdkFetch(signed.href)).text()).toBe("fixture-image");
    mock.assertNoPendingInterceptors();
  });
  it.each(["../other", "/absolute", "a//b", "https://evil/a", "a/%2e%2e/b", "a\\b", "a/*", "a/../b"])("rejects noncanonical path %s before transport", async path => {
    await expect(storage().sign("report-evidence", path, 300)).rejects.toThrow("private_blob_path_invalid");
  });
  it("refuses missing configuration without ambient credential fallback", () => {
    expect(() => createPrivateBlobStorage({ token: "", storeId: "" })).toThrow("private_blob_not_configured");
  });
});


it("uses native private put, flat cursor listing and namespaced deletion", async () => {
  const pathname = "report-evidence/job/photo/a.png";
  let headers: unknown;
  mock.get("https://vercel.com").intercept({ path: "/api/blob/?pathname=report-evidence%2Fjob%2Fphoto%2Fa.png", method: "PUT" }).reply(200, (opts: { headers: unknown }) => {
    headers = opts.headers;
    return { pathname, url: `${origin}/${pathname}`, contentType: "image/png" };
  });
  await storage().upload("report-evidence", "job/photo/a.png", new Uint8Array([1]), { contentType: "image/png", overwrite: true });
  expect(headers).toMatchObject({ "x-add-random-suffix": "0", "x-allow-overwrite": "1", "x-vercel-blob-access": "private" });
  mock.get("https://vercel.com").intercept({ path: "/api/blob?limit=100&prefix=report-evidence%2Fjob%2F&cursor=next&mode=expanded", method: "GET" }).reply(200, { blobs: [{ pathname, url: `${origin}/${pathname}`, size: 1, uploadedAt: "2026-09-06T00:00:00Z" }], hasMore: false });
  expect(await storage().list("report-evidence", "job", { limit: 100, cursor: "next" })).toEqual({ paths: ["job/photo/a.png"], cursor: undefined, hasMore: false });
  mock.get("https://vercel.com").intercept({ path: "/api/blob/delete", method: "POST", body: JSON.stringify({ urls: [pathname] }) }).reply(200, {});
  await storage().remove("report-evidence", ["job/photo/a.png"]);
  mock.assertNoPendingInterceptors();
});

it("rejects credentials for another store before uploading", () => {
  expect(() => createPrivateBlobStorage({ token, storeId: "store_other" })).toThrow("private_blob_store_mismatch");
});
it.each([{ pathname: "*" }, { operations: ["get", "put"] }, { storeId: "store_other" }])("rejects expanded delegation scope %j", async override => {
  mock.get("https://vercel.com").intercept({ path: "/api/blob/signed-token", method: "POST" }).reply(200, (opts: { body: string }) => {
    const scope = JSON.parse(opts.body);
    return { delegationToken: Buffer.from(JSON.stringify({ storeId: "store_fixture", ...scope, ...override })).toString("base64url") + ".fixture", clientSigningToken: Buffer.from("fixture-key").toString("base64url"), validUntil: scope.validUntil };
  });
  await expect(storage().sign("report-evidence", "job/photo/a.png", 300)).rejects.toThrow("private_blob_delegation_invalid");
});

it.each([["image/svg+xml", 1], ["image/jpeg", 0], ["image/png", 5 * 1024 * 1024 + 1]] as const)("rejects invalid upload %s %i before transport", async (contentType, size) => {
  await expect(storage().upload("workspace-assets", "ws/a/file", new Uint8Array(size), { contentType, overwrite: false })).rejects.toThrow("private_blob_upload_invalid");
});
it("rejects foreign objects returned by native flat listing", async () => {
  mock.get("https://vercel.com").intercept({ path: "/api/blob?limit=100&prefix=report-evidence%2Fjob%2F&mode=expanded", method: "GET" }).reply(200, { blobs: [{ pathname: "report-evidence/other/a.png", uploadedAt: "2026-09-06T00:00:00Z" }], hasMore: false });
  await expect(storage().list("report-evidence", "job", { limit: 100 })).rejects.toThrow("private_blob_list_path_invalid");
});

it.each(["material", "delegation"] as const)("rejects malformed %s expiry before returning a signed URL", async target => {
  mock.get("https://vercel.com").intercept({ path: "/api/blob/signed-token", method: "POST" }).reply(200, (opts: { body: string }) => {
    const scope = JSON.parse(opts.body);
    return {
      delegationToken: Buffer.from(JSON.stringify({ storeId: "store_fixture", ...scope, ...(target === "delegation" ? {validUntil: "invalid"} : {}) })).toString("base64url") + ".fixture",
      clientSigningToken: Buffer.from("fixture-key").toString("base64url"),
      validUntil: target === "material" ? "invalid" : scope.validUntil,
    };
  });
  await expect(storage().sign("report-evidence", "job/photo/a.png", 300)).rejects.toThrow(target === "material" ? "private_blob_expiry_invalid" : "private_blob_delegation_invalid");
  mock.assertNoPendingInterceptors();
});
