// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { VersionRow } from "@/lib/workspace/queries-pages";
import { ActionProgress, approvalStepFor } from "./action-progress";

const version = (overrides: Partial<VersionRow>): VersionRow => ({
  id: "v", action_id: "a", version_no: 1, body: "Thank you", alt_text: null, author_type: "agent", author_user_id: null,
  approval_state: "draft", delivery_state: "not_requested", approved_at: null, reviewer_comment: null, created_at: "2026-10-01T00:00:00Z",
  first_exported_at: null, ...overrides,
} as VersionRow);

describe("approvalStepFor", () => {
  it.each([
    [{ approval_state: "draft" }, "needsApproval"],
    [{ approval_state: "changes_requested" }, "needsApproval"],
    [{ approval_state: "approved", delivery_state: "export_ready" }, "approved"],
    [{ approval_state: "approved", first_exported_at: "2026-10-02T00:00:00Z" }, "delivered"],
    [{ approval_state: "approved", delivery_state: "published" }, "delivered"],
    [{ approval_state: "rejected" }, "draft"],
    [{ approval_state: "superseded" }, "draft"],
  ] as const)("%o → %s", (state, step) => {
    expect(approvalStepFor(version(state as Partial<VersionRow>))).toBe(step);
  });
});

describe("ActionProgress", () => {
  const html = (versions: VersionRow[]) => { const root = document.createElement("div"); root.innerHTML = renderToStaticMarkup(<ActionProgress versions={versions} locale="en" />); return root; };

  it("renders nothing before the first version", () => {
    expect(html([]).innerHTML).toBe("");
  });

  it("compares the latest version with the one before it, collapsed", () => {
    const root = html([version({ id: "v2", version_no: 2, body: "Thank you so much" }), version({ id: "v1", version_no: 1, body: "Thank you" })]);
    const diff = root.querySelector("details");
    expect(diff?.hasAttribute("open")).toBe(false);
    expect(diff?.textContent).toContain("Version 1 → Version 2");
    expect(root.querySelector("ins")?.textContent).toContain("so much");
  });

  it("shows no comparison for a single version", () => {
    expect(html([version({})]).querySelector("details")).toBeNull();
  });
});
