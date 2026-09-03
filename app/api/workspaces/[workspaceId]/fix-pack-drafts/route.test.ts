import { afterEach, describe, expect, it, vi } from "vitest";

const authorizeWorkspaceRequest = vi.fn();
const from = vi.fn();

vi.mock("@/lib/auth", () => ({ authorizeWorkspaceRequest: (...args: unknown[]) => authorizeWorkspaceRequest(...args) }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseServer: () => ({ from }) }));

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";

function auth(role: string) {
  return {
    ok: true,
    user: { id: "user-1", email: "u@example.com", verified: true },
    membership: { workspaceId: WORKSPACE_ID, workspaceSlug: "demo", userId: "user-1", email: "u@example.com", role, locationScope: null },
  };
}

function get(query = "?locale=zh-HK") {
  return import("./route").then(({ GET }) =>
    GET(new Request(`https://app.test/api/workspaces/${WORKSPACE_ID}/fix-pack-drafts${query}`), {
      params: Promise.resolve({ workspaceId: WORKSPACE_ID }),
    }),
  );
}

function draftsTable(rows: unknown[]) {
  return {
    select: () => ({
      eq: () => ({
        in: () => ({
          order: () => ({ limit: async () => ({ data: rows, error: null }) }),
        }),
      }),
    }),
  };
}

const DRAFT_ROW = {
  id: "run-1",
  job_id: "job-1",
  finding_key: "gbp.rating_low",
  agent_key: "review_reply_agent",
  status: "draft",
  output: { agentKey: "review_reply_agent", draftReply: "多謝支持！", reviewExcerpt: "x", reviewRating: 5, reviewLanguage: "zh" },
  created_at: "2026-08-20T00:00:00.000Z",
  audit_jobs: { workspace_id: WORKSPACE_ID, business_name: "Demo Cafe" },
};

afterEach(() => vi.resetAllMocks());

describe("GET /api/workspaces/[workspaceId]/fix-pack-drafts", () => {
  it("returns display-ready rows for any member, viewer included", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(auth("viewer"));
    from.mockImplementation((table: string) => {
      if (table !== "agent_runs") throw new Error(`unexpected table ${table}`);
      return draftsTable([DRAFT_ROW]);
    });

    const res = await get();

    expect(res.status).toBe(200);
    expect(authorizeWorkspaceRequest).toHaveBeenCalledWith({ id: WORKSPACE_ID });
    expect(await res.json()).toEqual({
      drafts: [
        {
          id: "run-1",
          jobId: "job-1",
          businessName: "Demo Cafe",
          // report.findingGbpRatingLow from lib/messages/zh-HK.json
          findingLabel: "Google 評分",
          agentKey: "review_reply_agent",
          status: "draft",
          draftText: "多謝支持！",
          reviewExcerpt: "x",
          reviewRating: 5,
          createdAt: "2026-08-20T00:00:00.000Z",
        },
      ],
    });
  });

  it("ships a gbp post draft without review fields, text picked by locale, and humanises an unknown finding key", async () => {
    authorizeWorkspaceRequest.mockResolvedValue(auth("owner"));
    from.mockImplementation(() =>
      draftsTable([
        {
          ...DRAFT_ROW,
          id: "run-2",
          finding_key: "gbp.brand_new_key",
          agent_key: "gbp_post_agent",
          output: { agentKey: "gbp_post_agent", draftPostZh: "中文帖", draftPostEn: "English post", seedEvidence: [] },
        },
      ]),
    );

    const res = await get("?locale=en");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.drafts).toHaveLength(1);
    expect(body.drafts[0]).toMatchObject({
      id: "run-2",
      agentKey: "gbp_post_agent",
      findingLabel: "brand new key",
      draftText: "English post",
      reviewExcerpt: null,
      reviewRating: null,
    });
  });

  it("refuses a non-member with the auth status", async () => {
    authorizeWorkspaceRequest.mockResolvedValue({ ok: false, status: 403, code: "forbidden" });
    const res = await get();
    expect(res.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects an unknown locale before touching auth", async () => {
    expect((await get("?locale=fr")).status).toBe(400);
    expect(authorizeWorkspaceRequest).not.toHaveBeenCalled();
  });
});
