// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const push = vi.hoisted(()=>vi.fn());
vi.mock("next/navigation",()=>({useRouter:()=>({push}),usePathname:()=>"/en/owner/shop/actions",useSearchParams:()=>new URLSearchParams("location=primary&channel=google&cursor=old")}));
import { ActionSearch } from "./action-filters";
afterEach(cleanup);
it("submits trimmed search, preserves scope and clears cursor",()=>{
  render(<ActionSearch value="" label="Search title and summary" submitLabel="Search" />);
  fireEvent.change(screen.getByRole("searchbox"),{target:{value:"  100%_literal  "}}); fireEvent.click(screen.getByRole("button",{name:"Search"}));
  const url = new URL(push.mock.calls[0][0],"https://fixture.example.test");
  expect(Object.fromEntries(url.searchParams)).toEqual({location:"primary",channel:"google",q:"100%_literal"});
});
