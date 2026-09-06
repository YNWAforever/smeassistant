const analytics = vi.hoisted(() => ({ recordEvent: vi.fn() }));
vi.mock("@/lib/analytics/record-event", () => ({ recordEvent: analytics.recordEvent, resolveAnalyticsSession: vi.fn(), setAnalyticsSessionCookie: vi.fn() }));
import { describe, it, expect, vi, afterEach } from "vitest";
const db = vi.hoisted(() => ({ getPool: vi.fn(() => { throw Error("postgresql://secret:password@host/db"); }), getDatabase: vi.fn(() => { throw Error("database_configuration_missing"); }) }));
vi.mock("@/lib/db/client", () => db);
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { POST } from "@/app/api/scan/start/route";
import { buildScanStartPayload, emptyScanDraft } from "@/lib/funnel/scan-start";
describe("Neon unavailable boundaries", () => {
    afterEach(() => vi.unstubAllEnvs());
    it("keeps fail-closed policy even in tests with no database", async () => {
        vi.stubEnv("RATE_LIMIT_SECRET", "fixture-secret");
        const result = await enforceRateLimit({ req: new Request("https://fixture.test"), scope: "report_unlock", failClosed: true });
        expect(result).toMatchObject({ allowed: false, unavailable: true });
    });
    it("returns a safe correlated 503 for anonymous scan persistence failures", async () => {
        const payload = buildScanStartPayload({ ...emptyScanDraft("hk", "Fixture"), manualEntry: true, industry: "fnb", district: "東區" }, "zh-HK");
        const result = await POST(new Request("https://fixture.test/api/scan/start", { method: "POST", body: JSON.stringify(payload) }));
        expect(result.status).toBe(503);
        expect(analytics.recordEvent).not.toHaveBeenCalled();
        const body = await result.json();
        expect(body.correlationId).toMatch(/^[0-9a-f-]{36}$/);
        expect(JSON.stringify(body)).not.toContain("password");
    });
});
