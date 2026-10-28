// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConversationDocuments, ConversationConnectors } from "./conversation-resources";
const version={id:"v1",documentId:"d1",assetId:"a1",version:1,title:"Menu.txt",createdAt:"2026-10-27T00:00:00Z",text:"Confirmed menu text",truncated:false,sha256:"hash"};
const props={locale:"en" as const,workspaceId:"w",locationId:"l",canManage:true};
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("renders server extraction/provenance, cites the exact immutable ID, and resolves it on remount",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({versions:[version]})}));
  const cite=vi.fn();const view=render(<ConversationDocuments {...props} citedIds={[]} canCite onCite={cite}/>);
  fireEvent.click(await screen.findByRole("button",{name:"Cite this version"}));expect(cite).toHaveBeenCalledWith("v1");
  expect(screen.getByText("Confirmed menu text")).toBeInTheDocument();
  view.unmount();render(<ConversationDocuments {...props} citedIds={["v1"]} canCite onCite={cite}/>);
  expect(await screen.findByText("Cited documents")).toBeInTheDocument();expect((await screen.findAllByText(/Menu.txt · v1/)).length).toBeGreaterThan(0);
});
it("shows an unavailable citation and explains unsupported files without claiming a save",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({versions:[]})}));
  render(<ConversationDocuments {...props} citedIds={["missing"]} canCite onCite={()=>{}}/>);
  expect(await screen.findByText("This cited version is unavailable in this shop and location.")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Shop document"),{target:{files:[new File(["pdf"],"menu.pdf",{type:"application/pdf"})]}});
  fireEvent.click(screen.getByRole("button",{name:"Save document version"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("UTF-8");
});
it("shows disconnected GSC recovery and blocked paid research with remaining budget",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({connectors:[{source:"gsc",status:"disconnected",scope:"",items:[],observedAt:null},{source:"firecrawl",status:"blocked",scope:"",items:[],observedAt:null,budget:{workspaceRemainingUsd:0,accountRemainingUsd:1,reservedUsd:0}}]})}));
  render(<ConversationConnectors {...props} workspaceSlug="shop"/>);
  expect(await screen.findByRole("link",{name:"Connect Google Search Console"})).toHaveAttribute("href","/api/oauth/google/start?provider=gsc&workspace=shop&locale=en");
  expect(await screen.findByText("Budget reached. No paid request was sent.")).toBeInTheDocument();
  expect(screen.getByText(/Shop budget left: USD 0.00/)).toBeInTheDocument();
});
