// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BulkActionSelection } from "./bulk-action-dialog";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const items = Array.from({ length: 4 }, (_, i) => ({ actionId: id(i + 1), expectedUpdatedAt: "2026-10-01T00:00:00.123456Z", title: `Action ${i + 1}`, closed: false }));
const fetchMock = vi.fn();
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const draw = (locale: "en" | "zh-HK" | "zh-TW" = "en", key = "scope") => <BulkActionSelection key={key} locale={locale} workspaceId={id(99)} timezone="Asia/Hong_Kong" items={items} cards={items.map(i => <p key={i.actionId}>{i.title}</p>)} members={[]} />;
it.each(["en", "zh-HK", "zh-TW"] as const)("%s requires explicit selection and preview before confirmation", locale => {
  render(draw(locale));
  const trigger = screen.getByRole("button", { name: locale === "en" ? "Assign selected" : "分派已選行動" });
  expect(trigger).toBeDisabled(); fireEvent.click(screen.getAllByRole("checkbox")[0]); fireEvent.click(trigger);
  expect(screen.getByRole("dialog")).toBeVisible(); expect(screen.getByRole("button", { name: locale === "en" ? "Confirm changes" : "確認變更" })).toBeDisabled();
  expect(fetchMock).not.toHaveBeenCalled();
});
it("preserves successful results and re-previews only failures before retrying", async () => {
  const result = (n: number, status: string, eligible: boolean) => ({ actionId: id(n), status, eligible, expectedUpdatedAt: "2026-10-02T00:00:00.123456Z", before: { assignee_user_id: null, due_at: null }, after: { assignee_user_id: null, due_at: null } });
  fetchMock.mockResolvedValueOnce(Response.json({ results: [result(1,"updated",true),result(2,"updated",true),result(3,"forbidden",false),result(4,"updated",true)] }))
    .mockResolvedValueOnce(Response.json({ results: [result(1,"updated",true),result(2,"updated",true),result(4,"conflict",false)] }))
    .mockResolvedValueOnce(Response.json({ results: [result(3,"forbidden",false),result(4,"updated",true)] }))
    .mockResolvedValueOnce(Response.json({ results: [result(4,"updated",true)] }));
  render(draw()); for (const checkbox of screen.getAllByRole("checkbox")) fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole("button", { name: "Assign selected" }));
  fireEvent.change(screen.getByLabelText("Assignee change"), { target: { value: "clear" } });
  fireEvent.click(screen.getByRole("button", { name: "Preview changes" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Confirm changes" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Confirm changes" }));
  await screen.findByText("2 of 4 completed. Review each result.");
  fireEvent.click(screen.getByRole("button", { name: "Read again and preview failed items" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  const payload = JSON.parse(fetchMock.mock.calls[2][1].body);
  expect(payload.mode).toBe("preview"); expect(payload.items.map((i: { actionId: string }) => i.actionId)).toEqual([id(3),id(4)]);
  await waitFor(() => expect(screen.getByRole("button", { name: "Confirm changes" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Confirm changes" }));
  await screen.findByText("3 of 4 completed. Review each result.");
  const retry = JSON.parse(fetchMock.mock.calls[3][1].body);
  expect(retry.items).toEqual([{ actionId: id(4), expectedUpdatedAt: "2026-10-02T00:00:00.123456Z" }]);
});
it("retains explicit selection across pages and clears it with a new filter scope", () => {
  const view = render(draw()); fireEvent.click(screen.getAllByRole("checkbox")[0]);
  view.rerender(<BulkActionSelection key="scope" locale="en" workspaceId={id(99)} timezone="Asia/Hong_Kong" items={[]} cards={[]} members={[]} />);
  expect(screen.getByText("1 selected (maximum 50)")).toBeVisible();
  view.rerender(draw("en", "changed-filter")); expect(screen.getByText("0 selected (maximum 50)")).toBeVisible();
});
it("caps explicit selection at 50 without offering all query results", () => {
  const many = Array.from({ length: 51 }, (_, i) => ({ ...items[0], actionId: id(i+1), title: `Action ${i+1}` }));
  render(<BulkActionSelection locale="en" workspaceId={id(99)} timezone="UTC" items={many} cards={many.map(i=><p key={i.actionId}>{i.title}</p>)} members={[]} />);
  const boxes = screen.getAllByRole("checkbox"); for (const box of boxes.slice(0,50)) fireEvent.click(box);
  expect(boxes[50]).toBeDisabled(); expect(screen.getByText("50 selected (maximum 50)")).toBeVisible();
});
it("closes with Escape and returns focus to the trigger", async () => {
  render(draw()); fireEvent.click(screen.getAllByRole("checkbox")[0]);
  const trigger = screen.getByRole("button",{name:"Assign selected"}); trigger.focus(); fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole("dialog"),{key:"Escape"});
  await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull()); await waitFor(()=>expect(trigger).toHaveFocus());
});
