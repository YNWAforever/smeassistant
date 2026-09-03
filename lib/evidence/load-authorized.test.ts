import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  queryError: null as unknown,
  queryThrows: false,
  signData: [] as unknown[],
  signError: null as unknown,
  signThrows: false,
  selections: [] as Array<{ table: string; columns: string; jobId?: string }>,
  signed: vi.fn(),
}));

function queryFor(table: string) {
  let columns = "";
  const query = {
    select(value: string) {
      columns = value;
      state.selections.push({ table, columns });
      return query;
    },
    eq(_column: string, jobId: string) {
      state.selections[state.selections.length - 1]!.jobId = jobId;
      return query;
    },
    order() {
      if (state.queryThrows) return Promise.reject(new Error("thrown database credential detail"));
      return Promise.resolve({
        data: state.queryError ? null : state.rows,
        error: state.queryError,
      });
    },
  };
  return query;
}

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseServer: vi.fn(() => ({
    from: (table: string) => queryFor(table),
    storage: {
      from: (bucket: string) => {
        if (bucket !== "report-evidence") throw new Error("unexpected bucket");
        return { createSignedUrls: state.signed };
      },
    },
  })),
}));

import { loadAuthorizedEvidence } from "./load-authorized";

const digest = "a".repeat(64);
const storedRow = {
  id: "evidence-1",
  provider: "instagram",
  evidence_type: "post",
  source_url: "https://www.instagram.com/p/code/",
  captured_at: "2026-07-21T00:00:00.000Z",
  published_at: "2026-07-20T00:00:00.000Z",
  text_content: "Post",
  metadata: { likes: 5 },
  storage_path: `job-1/instagram/post/${digest}.jpg`,
  collection_status: "stored",
  limitation_code: null,
};

describe("loadAuthorizedEvidence", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    state.rows = [];
    state.queryError = null;
    state.queryThrows = false;
    state.signData = [];
    state.signError = null;
    state.signThrows = false;
    state.selections.length = 0;
    state.signed.mockReset().mockImplementation(async (paths: string[], expiresIn: number) => {
      if (state.signThrows) throw new Error("thrown storage token detail");
      return {
      data: state.signError ? null : state.signData,
      error: state.signError,
      paths,
      expiresIn,
    };
    });
  });

  it("queries the private evidence table and signs unique owned paths for five minutes", async () => {
    state.rows = [
      storedRow,
      { ...storedRow, id: "evidence-2", source_url: "https://www.instagram.com/p/other/" },
    ];
    state.signData = [{
      path: storedRow.storage_path,
      signedUrl: `https://project.supabase.co/storage/v1/object/sign/report-evidence/${storedRow.storage_path}?token=signed-token`,
    }];

    const model = await loadAuthorizedEvidence("job-1");

    expect(state.selections).toEqual([expect.objectContaining({
      table: "report_evidence",
      jobId: "job-1",
    })]);
    expect(state.signed).toHaveBeenCalledWith([storedRow.storage_path], 300);
    expect(model.items).toHaveLength(2);
    expect(model.items[0]?.mediaUrl).toContain("signed-token");
  });

  it("does not invoke Storage when no valid stored paths exist", async () => {
    state.rows = [{
      ...storedRow,
      storage_path: null,
      collection_status: "metadata_only",
      limitation_code: "snapshot_not_permitted",
    }];

    const model = await loadAuthorizedEvidence("job-1");

    expect(state.signed).not.toHaveBeenCalled();
    expect(model.items[0]).toMatchObject({
      mediaUrl: null,
      status: "metadata_only",
      limitationCode: "snapshot_not_permitted",
    });
  });

  it("skips malformed rows and refuses paths outside the authorized report", async () => {
    state.rows = [
      { ...storedRow, id: "", provider: "bad-provider" },
      { ...storedRow, id: "other-job", storage_path: `job-2/instagram/post/${digest}.jpg` },
      { ...storedRow, id: "unsafe-source", source_url: "javascript:alert(1)", storage_path: null,
        collection_status: "metadata_only",
        metadata: { apiKey: "must-not-survive", followers: 120, nested: { secret: true } } },
    ];

    const model = await loadAuthorizedEvidence("job-1");

    expect(state.signed).not.toHaveBeenCalled();
    expect(model.items).toEqual([
      expect.objectContaining({ id: "unsafe-source", sourceUrl: null, mediaUrl: null, metadata: { followers: 120 } }),
    ]);
  });

  it("removes established credential names from source URLs and metadata", async () => {
    state.rows = [{
      ...storedRow,
      id: "credential-bearing",
      source_url: "https://example.com/post?key=provider-secret",
      storage_path: null,
      collection_status: "metadata_only",
      metadata: {
        key: "provider-secret",
        auth: "provider-secret",
        sig: "provider-secret",
        jwt: "provider-secret",
        xGoogCredential: "provider-secret",
        followers: 120,
      },
    }];

    const model = await loadAuthorizedEvidence("job-1");

    expect(model.items).toEqual([
      expect.objectContaining({
        id: "credential-bearing",
        sourceUrl: null,
        metadata: { followers: 120 },
      }),
    ]);
  });

  it("rejects rows whose collection status and storage path disagree", async () => {
    state.rows = [
      storedRow,
      {
        ...storedRow,
        id: "metadata-with-path",
        collection_status: "metadata_only",
        limitation_code: "snapshot_not_permitted",
      },
      {
        ...storedRow,
        id: "failed-with-path",
        collection_status: "failed",
        limitation_code: "media_copy_failed",
      },
      {
        ...storedRow,
        id: "stored-without-path",
        storage_path: null,
      },
      {
        ...storedRow,
        id: "valid-metadata",
        storage_path: null,
        collection_status: "metadata_only",
        limitation_code: "snapshot_not_permitted",
      },
    ];
    state.signData = [{
      path: storedRow.storage_path,
      signedUrl: `https://project.supabase.co/storage/v1/object/sign/report-evidence/${storedRow.storage_path}?token=signed-token`,
    }];

    const model = await loadAuthorizedEvidence("job-1");

    expect(state.signed).toHaveBeenCalledWith([storedRow.storage_path], 300);
    expect(model.items.map((item) => item.id)).toEqual([
      "evidence-1",
      "valid-metadata",
    ]);
  });

  it("accepts only an exact signed URL with one non-empty bounded token", async () => {
    const secondDigest = "b".repeat(64);
    const secondPath = `job-1/instagram/post/${secondDigest}.jpg`;
    state.rows = [
      storedRow,
      { ...storedRow, id: "evidence-2", storage_path: secondPath },
    ];
    state.signData = [
      {
        path: storedRow.storage_path,
        signedUrl: `https://project.supabase.co/storage/v1/object/sign/report-evidence/${storedRow.storage_path}?token=&debug=credential-detail`,
      },
      {
        path: secondPath,
        signedUrl: `https://project.supabase.co/storage/v1/object/sign/report-evidence/${secondPath}?token=signed-token#fragment`,
      },
      {
        path: secondPath,
        signedUrl: `https://project.supabase.co/storage/v1/object/sign/report-evidence/${secondPath}?token=signed-token`,
      },
    ];

    const model = await loadAuthorizedEvidence("job-1");

    expect(model.items[0]?.mediaUrl).toBeNull();
    expect(model.items[1]?.mediaUrl).toBe(
      `https://project.supabase.co/storage/v1/object/sign/report-evidence/${secondPath}?token=signed-token`,
    );
  });

  it("rejects an invalid report identifier before querying private evidence", async () => {
    await expect(loadAuthorizedEvidence("../other-job"))
      .rejects.toThrow("evidence_job_id_invalid");
    expect(state.selections).toEqual([]);
    expect(state.signed).not.toHaveBeenCalled();
  });

  it("never exposes provider database or signing errors", async () => {
    state.queryThrows = true;
    await expect(loadAuthorizedEvidence("job-1")).rejects.toThrow("evidence_query_failed");
    await expect(loadAuthorizedEvidence("job-1")).rejects.not.toThrow("thrown database credential detail");
    state.queryThrows = false;

    state.queryError = new Error("database credential detail");
    await expect(loadAuthorizedEvidence("job-1")).rejects.toThrow("evidence_query_failed");
    await expect(loadAuthorizedEvidence("job-1")).rejects.not.toThrow("database credential detail");

    state.queryError = null;
    state.rows = [storedRow];
    state.signThrows = true;
    await expect(loadAuthorizedEvidence("job-1")).rejects.toThrow("evidence_signing_failed");
    await expect(loadAuthorizedEvidence("job-1")).rejects.not.toThrow("thrown storage token detail");
    state.signThrows = false;

    state.signError = new Error("storage token detail");
    await expect(loadAuthorizedEvidence("job-1")).rejects.toThrow("evidence_signing_failed");
    await expect(loadAuthorizedEvidence("job-1")).rejects.not.toThrow("storage token detail");
  });
});


describe("server-only boundary", () => {
  it("marks the privileged evidence loader as server-only", () => {
    const source = readFileSync(new URL("./load-authorized.ts", import.meta.url), "utf8");
    expect(source).toMatch(/^import "server-only";/);
  });
});
