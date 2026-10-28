// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

it("refreshes a pending account's availability without sending a paid request",async()=>{
  const context={source:"firecrawl",status:"blocked",reason:"account_reconciliation_pending",scope:"https://shop.example/",items:[],observedAt:null};
  const requests=vi.fn()
    .mockResolvedValueOnce({ok:true,json:async()=>({connectors:[context]})})
    .mockResolvedValueOnce({ok:true,json:async()=>({connectors:[{...context,status:"empty",reason:"research_available"}]})});
  vi.stubGlobal("fetch",requests);
  render(<ConversationConnectors {...props} workspaceSlug="shop"/>);
  expect(await screen.findByRole("button",{name:"Read context"})).toBeDisabled();
  fireEvent.click(screen.getByRole("button",{name:"Refresh availability"}));
  await waitFor(()=>expect(screen.getByRole("button",{name:"Read context"})).toBeEnabled());
  expect(requests).toHaveBeenCalledTimes(2);
  for(const [url,init] of requests.mock.calls){
    expect(url).toBe("/api/workspaces/w/conversation/connectors?location_id=l");
    expect(init).toMatchObject({credentials:"same-origin",cache:"no-store"});
    expect(init.method??"GET").toBe("GET");
    expect(init.body).toBeUndefined();
  }
});

it("can retry an unavailable status read without reloading or calling a provider",async()=>{
  const requests=vi.fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ok:true,json:async()=>({connectors:[{source:"firecrawl",status:"empty",reason:"research_available",scope:"https://shop.example/",items:[],observedAt:null}]})});
  vi.stubGlobal("fetch",requests);
  render(<ConversationConnectors {...props} workspaceSlug="shop"/>);
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Refresh availability"}));
  expect(await screen.findByRole("button",{name:"Read context"})).toBeEnabled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(requests.mock.calls.every(([,init])=>(init.method??"GET")==="GET")).toBe(true);
});

it("keeps reads disabled during a status refresh and after a failed refresh",async()=>{
  let rejectStatus!:(error:Error)=>void;
  const requests=vi.fn()
    .mockResolvedValueOnce({ok:true,json:async()=>({connectors:[{source:"firecrawl",status:"blocked",reason:"account_reconciliation_pending",scope:"https://shop.example/",items:[],observedAt:null}]})})
    .mockImplementationOnce(()=>new Promise((_,reject)=>{rejectStatus=reject;}));
  vi.stubGlobal("fetch",requests);
  render(<ConversationConnectors {...props} workspaceSlug="shop"/>);
  const read=await screen.findByRole("button",{name:"Read context"});
  const refresh=screen.getByRole("button",{name:"Refresh availability"});
  fireEvent.click(refresh);
  expect(read).toBeDisabled();expect(refresh).toBeDisabled();
  rejectStatus(new Error("offline"));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(read).toBeDisabled();expect(refresh).toBeEnabled();
  expect(requests).toHaveBeenCalledTimes(2);
});

it("lets an owner correct an unsupported search phrase without refreshing availability",async()=>{
  const context={source:"dataforseo",status:"empty",reason:"research_available",scope:"https://shop.example/",items:[],observedAt:null};
  const requests=vi.fn()
    .mockResolvedValueOnce({ok:true,json:async()=>({connectors:[context]})})
    .mockResolvedValueOnce({ok:true,json:async()=>({context:{...context,status:"unsupported",reason:"keyword_unsupported"}})})
    .mockResolvedValueOnce({ok:true,json:async()=>({context:{...context,status:"ready",reason:undefined,scope:"tw: coffee",items:[{title:"Synthetic coffee result"}]}})});
  vi.stubGlobal("fetch",requests);
  render(<ConversationConnectors {...props} workspaceSlug="shop"/>);
  const keyword=await screen.findByLabelText("Search phrase");
  fireEvent.change(keyword,{target:{value:"site:example.com"}});
  fireEvent.click(screen.getByRole("button",{name:"Read context"}));
  await waitFor(()=>expect(requests).toHaveBeenCalledTimes(2));
  await waitFor(()=>expect(screen.getByRole("button",{name:"Read context"})).toBeEnabled());
  expect(screen.getByText(/Search operators.*No paid request was sent/)).toBeInTheDocument();
  fireEvent.change(keyword,{target:{value:"coffee"}});
  fireEvent.click(screen.getByRole("button",{name:"Read context"}));
  expect(await screen.findByText("Synthetic coffee result")).toBeInTheDocument();
  expect(requests).toHaveBeenCalledTimes(3);
});
