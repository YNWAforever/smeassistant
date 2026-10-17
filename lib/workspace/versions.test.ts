import { describe, it, expect, vi } from "vitest";
import type { ArtifactRepository } from "@/lib/repositories/artifacts";
import {
  createVersion,
  createAssistantVersion,
  approveVersion,
  decideVersion,
  exportVersion,
  loadActionScope,
  loadVersionScope,
  VersionError,
} from "./versions";
const repository = (methods: Partial<ArtifactRepository>) =>
  methods as ArtifactRepository;
describe("typed artifact wrappers", () => {
  it("passes edit base and actor unchanged", async () => {
    const createOutputVersion = vi.fn(async () => ({
      kind: "created" as const,
      version_id: "v2",
      version_no: 2,
    }));
    expect(
      await createVersion(repository({ createOutputVersion }), {
        actionId: "a",
        actorId: "u",
        authorType: "user",
        body: "edit",
        baseVersionId: "v1",
      }),
    ).toEqual({ versionId: "v2", versionNo: 2 });
    expect(createOutputVersion).toHaveBeenCalledWith({
      actionId: "a",
      actor: "u",
      authorType: "user",
      actionRunId: null,
      body: "edit",
      alt: null,
      meta: {},
      baseVersionId: "v1",
    });
  });
  it.each([
    "version_conflict",
    "not_approved",
    "allowance_exceeded",
    "version_closed",
    "version_not_found",
    "invalid_decision",
    "invalid_mode",
    "offer_changed",
    "offer_inactive",
    "offer_expired",
  ])("maps %s", async (code) => {
    await expect(
      approveVersion(
        repository({
          approveOutputVersion: async () => {
            throw new Error(code);
          },
        }),
        { versionId: "v", actorId: "u" },
      ),
    ).rejects.toMatchObject({ code });
  });
  it.each(["offer_changed", "offer_inactive", "offer_expired"])(
    "maps an export refused with %s",
    async (code) => {
      await expect(
        exportVersion(
          repository({
            exportOutputVersion: async () => {
              throw new Error(code);
            },
          }),
          { versionId: "v", actorId: "u", mode: "export", idempotencyKey: "k" },
        ),
      ).rejects.toEqual(new VersionError(code as "offer_changed"));
    },
  );
  it("sanitizes unknown failures", async () => {
    await expect(
      approveVersion(
        repository({
          approveOutputVersion: async () => {
            throw new Error("secret");
          },
        }),
        { versionId: "v", actorId: "u" },
      ),
    ).rejects.toThrow("approve_output_version failed");
  });
  it("retains approval and decision idempotence", async () => {
    expect(
      await approveVersion(
        repository({
          approveOutputVersion: async () => ({
            kind: "already-approved",
            version_id: "v",
            version_no: 2,
          }),
        }),
        { versionId: "v", actorId: "u" },
      ),
    ).toMatchObject({ kind: "already-approved", versionNo: 2 });
    const decideOutputVersion = vi.fn(async () => ({
      kind: "already-decided" as const,
      version_id: "v",
      version_no: 2,
    }));
    expect(
      await decideVersion(repository({ decideOutputVersion }), {
        versionId: "v",
        actorId: "u",
        decision: "rejected",
      }),
    ).toMatchObject({ decision: "rejected", kind: "already-decided" });
    expect(decideOutputVersion).toHaveBeenCalledWith(
      "v",
      "u",
      "rejected",
      null,
    );
  });
  it("passes selected export and retry key", async () => {
    const exportOutputVersion = vi.fn(async () => ({
      kind: "existing" as const,
      version_id: "v",
      delivery_id: "d",
      counted: false,
      state: "exported",
    }));
    expect(
      await exportVersion(repository({ exportOutputVersion }), {
        versionId: "v",
        actorId: "u",
        mode: "copy",
        idempotencyKey: "key",
      }),
    ).toEqual({
      kind: "existing",
      versionId: "v",
      deliveryId: "d",
      counted: false,
    });
    expect(exportOutputVersion).toHaveBeenCalledWith("v", "u", "copy", "key");
  });
  it("uses repository scope without client relations", async () => {
    const scope = { actionId: "a", workspaceId: "w", locationId: null };
    expect(
      await loadActionScope(
        repository({ actionScope: async () => scope }),
        "a",
      ),
    ).toEqual(scope);
    expect(
      await loadVersionScope(
        repository({
          versionScope: async () => ({ ...scope, versionId: "v" }),
        }),
        "v",
      ),
    ).toEqual({ ...scope, versionId: "v" });
    expect(
      await loadVersionScope(
        repository({ versionScope: async () => null }),
        "absent",
      ),
    ).toBeNull();
    expect(VersionError).toBeDefined();
  });
});

describe("assistant saved-version source binding", () => {
  const source = "55555555-5555-4555-8555-555555555555";
  const other = "66666666-6666-4666-8666-666666666666";
  const input = { actionId: "a", workspaceId: "w", actorId: "u", runId: "r" };
  function draft(versionId?: string) {
    const createOutputVersion = vi.fn(async () => ({
      kind: "created" as const, version_id: "new", version_no: 2,
    }));
    return {
      createOutputVersion,
      db: repository({
        createOutputVersion,
        assistantDraft: async () => ({
          output: { body: "Server-held revision", warnings: [], facts_used: [] },
          agent_key: "review_reply",
          prompt_version: "fixture",
          input: { source: "assistant", intent: "friendlier_review_reply", context: versionId ? { versionId } : {} },
        }),
      }),
    };
  }
  it("uses the saved generation source when a compatible caller omits its base", async () => {
    const { db, createOutputVersion } = draft(source);
    await createAssistantVersion(db, input);
    expect(createOutputVersion).toHaveBeenCalledWith(expect.objectContaining({ baseVersionId: source }));
  });
  it.each([null, other])("refuses rebasing a revision from its saved source onto %s", async (baseVersionId) => {
    const { db, createOutputVersion } = draft(source);
    await expect(createAssistantVersion(db, { ...input, baseVersionId })).rejects.toEqual(new VersionError("version_conflict"));
    expect(createOutputVersion).not.toHaveBeenCalled();
  });
  it("refuses attaching a first draft to a client-supplied saved version", async () => {
    const { db, createOutputVersion } = draft();
    await expect(createAssistantVersion(db, { ...input, baseVersionId: other })).rejects.toEqual(new VersionError("version_conflict"));
    expect(createOutputVersion).not.toHaveBeenCalled();
  });
});
