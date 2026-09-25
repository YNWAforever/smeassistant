import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resolveOperator: vi.fn(), release: vi.fn(), dispatchScanProcess: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({ resolveOperator: () => mocks.resolveOperator() }));
vi.mock("@/lib/repositories/dead-letter", () => ({ deadLetterRepository: () => ({ release: mocks.release }) }));
vi.mock("@/lib/scan/dispatch-process", () => ({ dispatchScanProcess: (...a: unknown[]) => mocks.dispatchScanProcess(...a) }));

const JOB = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

function post(jobId = JOB) {
  return import("./route").then(({ POST }) =>
    POST(new Request(`https://app.test/api/ops/failures/scans/${jobId}/release`, { method: "POST" }), { params: Promise.resolve({ jobId }) }),
  );
}

beforeEach(() => {
  mocks.resolveOperator.mockResolvedValue({ userId: "op-1", email: "ada@fimmick.com" });
  mocks.release.mockResolvedValue({ released: true, previousAttempts: 3 });
  mocks.dispatchScanProcess.mockReturnValue(true);
});
afterEach(() => vi.clearAllMocks());

describe("POST /api/ops/failures/scans/[jobId]/release", () => {
  it("answers 404 to a non-operator before touching the job", async () => {
    mocks.resolveOperator.mockResolvedValue(null);
    const response = await post();
    expect(response.status).toBe(404);
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("answers 404 for an id that is not a uuid", async () => {
    const response = await post("not-a-uuid");
    expect(response.status).toBe(404);
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("answers 409 not_dead_lettered when the guarded update matched nothing", async () => {
    mocks.release.mockResolvedValue({ released: false });
    const response = await post();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "not_dead_lettered" });
    expect(mocks.dispatchScanProcess).not.toHaveBeenCalled();
  });

  it("releases as the operator, dispatches, and says whether dispatch was attempted", async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ released: true, dispatched: true });
    expect(mocks.release).toHaveBeenCalledWith(JOB, "op-1");
    expect(mocks.dispatchScanProcess).toHaveBeenCalledWith(JOB, expect.any(Function));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 503 without detail when the release itself fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.release.mockRejectedValue(new Error("connection reset with secret"));
    const response = await post();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "release_failed" });
  });
});
