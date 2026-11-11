// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioEvidencePicker } from "./evidence-picker";

const LOCATION = "11111111-1111-4111-8111-111111111111";
const DOCUMENT = "22222222-2222-4222-8222-222222222222";
const BRIEF = "33333333-3333-4333-8333-333333333333";
const UPLOADED = "55555555-5555-4555-8555-555555555555";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/conversation/documents")) {
      if (init?.method === "POST") {
        return jsonResponse({ version: { id: UPLOADED, title: "menu.md", truncated: false } }, 201);
      }
      return jsonResponse({ versions: [{ id: DOCUMENT, title: "Shop facts.pdf", truncated: false }] });
    }
    if (url.includes("/conversation/search")) {
      return jsonResponse({ records: [
        { id: BRIEF, approvedAt: "2026-11-09T00:00:00Z", brief: { en: { title: "Review queries" } } },
        { id: "44444444-4444-4444-8444-444444444444", approvedAt: null, brief: { en: { title: "Draft brief" } } },
      ] });
    }
    return jsonResponse({});
  });
  vi.stubGlobal("fetch", fetchMock);
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

  it("uploads a text document for owners and attaches the new version", async () => {
    const onChange = vi.fn();
    render(<StudioEvidencePicker locale="en" workspaceId="workspace-1" locationId={LOCATION} selected={[]} onChange={onChange} canUpload />);
    fireEvent.click(screen.getByRole("button", { name: /Evidence/ }));
    await screen.findByText("Shop facts.pdf");

    const file = new File(["# Menu\n\nSoup of the day"], "menu.md", { type: "text/markdown" });
    fireEvent.change(screen.getByLabelText("Upload document"), { target: { files: [file] } });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith([
      { source: "document", documentVersionId: UPLOADED, title: "menu.md", truncated: false },
    ]));
    expect(await screen.findByText("menu.md")).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(post).toBeTruthy();
    expect((post?.[1] as RequestInit).body).toBeInstanceOf(FormData);
  });

  it("rejects non-text files before uploading", async () => {
    const onChange = vi.fn();
    render(<StudioEvidencePicker locale="en" workspaceId="workspace-1" locationId={LOCATION} selected={[]} onChange={onChange} canUpload />);
    fireEvent.click(screen.getByRole("button", { name: /Evidence/ }));
    await screen.findByText("Shop facts.pdf");
    const callsBefore = fetchMock.mock.calls.length;

    const file = new File(["%PDF-1.7"], "menu.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Upload document"), { target: { files: [file] } });

    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a TXT, MD or CSV file.");
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not offer uploads to managers or viewers", async () => {
    render(<StudioEvidencePicker locale="en" workspaceId="workspace-1" locationId={LOCATION} selected={[]} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Evidence/ }));
    await screen.findByText("Shop facts.pdf");
    expect(screen.queryByRole("button", { name: "Upload document" })).toBeNull();
    expect(screen.queryByLabelText("Upload document")).toBeNull();
  });
});
