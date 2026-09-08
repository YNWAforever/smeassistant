import { describe, expect, it, vi } from "vitest";
import { createReportStore } from "./store";
function fixture(rows: unknown[] = []) { const query = vi.fn().mockResolvedValue({ rows }); return { query, store: createReportStore({ query }) }; }
describe("PostgreSQL report store", () => {
    it("caps public findings and counts all independently", async () => { const { query, store } = fixture(); query.mockResolvedValueOnce({ rows: [{ id: "f" }] }).mockResolvedValueOnce({ rows: [{ count: 34 }] }); expect(await store.readPublicFindings("job")).toEqual({ findings: [{ id: "f" }], count: 34 }); expect(query.mock.calls[0]).toEqual([expect.stringMatching(/ORDER BY score_impact ASC NULLS LAST LIMIT 12$/), ["job"]]); expect(query.mock.calls[0][0]).not.toMatch(/evidence|owner_message/); });
    it("excludes private fields from public job queries", async () => { const { query, store } = fixture(); await store.readPublicJobBySlug("slug"); expect(query.mock.calls[0]).toEqual([expect.stringContaining("workspace_id,location_id,completed_at::text AS completed_at FROM audit_jobs WHERE share_slug=$1"), ["slug"]]); expect(query.mock.calls[0][0]).not.toMatch(/raw_data|summary|SELECT \*/); });
    it("returns null for absent public jobs", async () => { expect(await fixture().store.readPublicJobBySlug("missing")).toBeNull(); });
    it("binds bounded history to the displayed job and validates offsets", async () => {
      const { query, store } = fixture();
      await store.readEarlierReportJobs("current", 25);
      expect(query.mock.calls[0][1]).toEqual(["current", 25]);
      expect(query.mock.calls[0][0]).toMatch(/JOIN audit_jobs current ON current\.id=\$1/);
      expect(query.mock.calls[0][0]).toMatch(/candidate\.workspace_id=current\.workspace_id/);
      expect(query.mock.calls[0][0]).toMatch(/candidate\.location_id=current\.location_id/);
      expect(query.mock.calls[0][0]).toMatch(/ORDER BY candidate\.completed_at DESC,candidate\.id DESC|ORDER BY candidate\.completed_at DESC, candidate\.id DESC/);
      expect(query.mock.calls[0][0]).toMatch(/LIMIT 25 OFFSET \$2$/);
      expect(query.mock.calls[0][0]).not.toMatch(/raw_data|findings|grants|SELECT \*/);
      await expect(store.readEarlierReportJobs("current", -1)).rejects.toThrow("invalid_history_offset");
      await expect(store.readEarlierReportJobs("current", 1.5)).rejects.toThrow("invalid_history_offset");
    });
    it("loads only private job projection and rejects missing authorized jobs", async () => { const { query, store } = fixture([{ raw_data: { proof: true } }]); expect(await store.readAuthorizedJobData("job")).toEqual({ raw_data: { proof: true } }); expect(query.mock.calls[0]).toEqual(["SELECT raw_data,summary_zh,summary_en,summary_tw FROM audit_jobs WHERE id=$1", ["job"]]); await expect(fixture().store.readAuthorizedJobData("job")).rejects.toThrow("authorized_report_missing"); });
    it("includes localized messages/actions and evidence for authorized findings", async () => { const { query, store } = fixture([{ evidence: { proof: true } }]); expect(await store.readAuthorizedFindings("job")).toEqual([{ evidence: { proof: true } }]); expect(query.mock.calls[0][0]).toContain("owner_message_zh,owner_message_en,owner_message_tw,owner_action_zh,owner_action_en,evidence,v02_agent_hint"); expect(query.mock.calls[0][1]).toEqual(["job"]); });
    it("returns only approved agent runs", async () => { const { query, store } = fixture([{ finding_key: "finding", agent_key: "agent", output: { draft: "x" } }]); expect(await store.readApprovedAgentRuns("job")).toEqual([{ findingKey: "finding", agentKey: "agent", output: { draft: "x" } }]); expect(query.mock.calls[0]).toEqual(["SELECT finding_key,agent_key,output FROM agent_runs WHERE job_id=$1 AND status='approved'", ["job"]]); });
    it("binds grant lookup to both job and grant and returns null when absent", async () => { const { query, store } = fixture(); expect(await store.findViewerGrant("job", "grant")).toBeNull(); expect(query.mock.calls[0]).toEqual([expect.stringContaining("WHERE id=$1 AND job_id=$2"), ["grant", "job"]]); });
    it("sanitizes driver failures without leaking credentials", async () => { const { query, store } = fixture(); query.mockRejectedValue(Error("postgresql://user:secret@host/db")); await expect(store.readPublicFindings("job")).rejects.toThrow(/^report_persistence_unavailable$/); });
    it("updates usage only for the bound unrevoked grant", async () => { const { query, store } = fixture(); await store.markViewerGrantUsed("job", "grant"); expect(query.mock.calls[0]).toEqual(["UPDATE report_access_grants SET last_used_at=now() WHERE id=$1 AND job_id=$2 AND revoked_at IS NULL", ["grant", "job"]]); });
    it.each(["summary_zh", "summary_en", "summary_tw"] as const)("only updates allowed %s with bound values", async (column) => { const { query, store } = fixture(); await store.cacheSummary("job", column, "value"); expect(query.mock.calls[0]).toEqual([`UPDATE audit_jobs SET ${column}=$2 WHERE id=$1`, ["job", "value"]]); });
});
