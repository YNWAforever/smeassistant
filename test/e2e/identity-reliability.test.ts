import { afterEach, expect, it, vi } from "vitest";
import { startIdentityServer } from "./identity-server";

let server: Awaited<ReturnType<typeof startIdentityServer>> | undefined;
const app = "http://localhost:3000", secret = "fixture-reliability-secret";
const email = "owner-reliability@acceptance.test";
const post = (path: string, body: object, origin = app, authorization = secret) =>
  fetch(`${server!.url}${path}`, { method: "POST", headers: { authorization: `Bearer ${authorization}`, "content-type": "application/json", "x-fixture-origin": origin }, body: JSON.stringify(body) });
async function requestCode() {
  expect((await post("/send-code", { email })).status).toBe(200);
  const list = await (await fetch(`${server!.url}/api/v1/messages`)).json();
  return list.messages[0].Text as string;
}
afterEach(async () => { vi.restoreAllMocks(); await server?.stop(); });

it("rotates the local OTP on resend: the old code fails, the latest succeeds once, and replay cannot issue a new session", async () => {
  server = await startIdentityServer(app, secret);
  const oldCode = await requestCode();
  const currentCode = await requestCode();
  expect((await post("/verify-code", { email, otp: oldCode })).status).toBe(401);
  const accepted = await post("/verify-code", { email, otp: currentCode });
  expect(accepted.status).toBe(200);
  const { token } = await accepted.json();
  expect((await post("/verify-code", { email, otp: currentCode })).status).toBe(401);
  expect(await (await post("/session", { token })).json()).toMatchObject({ email, verified: true });
});

it("expires only the selected recipient's code through the authenticated controller", async () => {
  server = await startIdentityServer(app, secret);
  const otp = await requestCode();
  expect((await post("/test/expire-code", { email })).status).toBe(200);
  expect((await post("/verify-code", { email, otp })).status).toBe(401);
  const replacement = await requestCode();
  expect((await post("/verify-code", { email, otp: replacement })).status).toBe(200);
});

it("refuses an expired local session and permits a fresh OTP session after relogin", async () => {
  server = await startIdentityServer(app, secret);
  const otp = await requestCode();
  const { token } = await (await post("/verify-code", { email, otp })).json();
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now + 24 * 60 * 60_000 + 1);
  expect(await (await post("/session", { token })).json()).toBeNull();
  const replacement = await requestCode();
  const relogin = await post("/verify-code", { email, otp: replacement });
  expect(relogin.status).toBe(200);
  const next = await relogin.json();
  expect(await (await post("/session", { token: next.token })).json()).toMatchObject({ email, verified: true });
});

it("expires sessions only for the selected recipient and leaves another account usable", async () => {
  server = await startIdentityServer(app, secret);
  const otp = await requestCode();
  const first = await (await post("/verify-code", { email, otp })).json();
  const other = "viewer-reliability@acceptance.test";
  await post("/send-code", { email: other });
  const messages = await (await fetch(`${server.url}/api/v1/messages`)).json();
  const second = await (await post("/verify-code", { email: other, otp: messages.messages[0].Text })).json();
  expect((await post("/test/expire-sessions", { email })).status).toBe(200);
  expect(await (await post("/session", { token: first.token })).json()).toBeNull();
  expect(await (await post("/session", { token: second.token })).json()).toMatchObject({ email: other, verified: true });
});

it.each(["/test/expire-code", "/test/expire-sessions"])("guards %s with the existing secret, exact origin and fixture-recipient checks", async path => {
  server = await startIdentityServer(app, secret);
  expect((await post(path, { email }, app, "wrong-secret")).status).toBe(401);
  expect((await post(path, { email }, "http://localhost:3999")).status).toBe(401);
  expect((await post(path, { email }, "https://outside.example")).status).toBe(401);
  expect((await post(path, { email: "real@example.com" })).status).toBe(400);
});
