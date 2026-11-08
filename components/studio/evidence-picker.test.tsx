// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioEvidencePicker } from "./evidence-picker";

const LOCATION = "11111111-1111-4111-8111-111111111111";
const DOCUMENT = "22222222-2222-4222-8222-222222222222";
const BRIEF = "33333333-3333-4333-8333-333333333333";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/conversation/documents")) {
      return jsonResponse({ versions: [{ id: DOCUMENT, title: "Shop facts.pdf", truncated: false }] });
    }
    if (url.includes("/conversation/search")) {
      return jsonResponse({ records: [
        { id: BRIEF, approvedAt: "2026-11-09T00:00:00Z", brief: { en: { title: "Review queries" } } },
        { id: "44444444-4444-4444-8444-444444444444", approvedAt: null, brief: { en: { title: "Draft brief" } } },
      ] });
    }
    return jsonResponse({});
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("StudioEvidencePicker", () => {
  it("loads documents and approved briefs and reports the selected item", async () => {
    const onChange = vi.fn();
    render(<StudioEvidencePicker locale="en" workspaceId="workspace-1" locationId={LOCATION} selected={[]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /Evidence/ }));
    expect(await screen.findByText("Shop facts.pdf")).toBeInTheDocument();
    expect(screen.getByText("Review queries")).toBeInTheDocument();
    expect(screen.queryByText("Draft brief")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Shop facts.pdf" }));
    expect(onChange).toHaveBeenCalledWith([{ source: "document", documentVersionId: DOCUMENT, title: "Shop facts.pdf", truncated: false }]);
  });

  it("shows the selected chips, removes them and disables new items at the cap", async () => {
    const selected = Array.from({ length: 5 }, (_, index) => ({
      source: "document" as const,
      documentVersionId: `document-${index}`,
      title: `Document ${index}`,
      truncated: false,
    }));
    const onChange = vi.fn();
    render(<StudioEvidencePicker locale="en" workspaceId="workspace-1" locationId={LOCATION} selected={selected} onChange={onChange} />);

    expect(screen.getByText("Document 0")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove: Document 0" }));
    expect(onChange).toHaveBeenCalledWith(selected.slice(1));

    fireEvent.click(screen.getByRole("button", { name: /Evidence/ }));
    expect(await screen.findByText("Shop facts.pdf")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Shop facts.pdf" })).toBeDisabled();
    await waitFor(() => expect(screen.getByText("Up to 5 items")).toBeInTheDocument());
  });

  it("cannot open until a single location is selected", () => {
    render(<StudioEvidencePicker locale="en" workspaceId="workspace-1" locationId={null} selected={[]} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Evidence/ })).toBeDisabled();
  });
});
