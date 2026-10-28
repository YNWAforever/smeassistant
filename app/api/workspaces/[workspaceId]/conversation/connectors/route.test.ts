import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({auth:vi.fn(),target:vi.fn(),connection:vi.fn(),disconnect:vi.fn(),gsc:vi.fn(),paid:vi.fn(),status:vi.fn(),rate:vi.fn()}));
vi.mock("@/lib/auth",()=>({authorizeWorkspaceRequest:mocks.auth}));
vi.mock("@/lib/repositories/conversation-connectors",()=>({conversationConnectorRepository:()=>({target:mocks.target,gscConnection:mocks.connection,disconnectGsc:mocks.disconnect})}));
vi.mock("@/lib/oauth/google-connection",()=>({googleOAuthConfigured:()=>true,GSC_SCOPE_REQUIRED:"readonly"}));
vi.mock("@/lib/connectors/gsc",()=>({readGscContext:mocks.gsc}));
vi.mock("@/lib/connectors/research",()=>({runResearch:mocks.paid,researchStatus:mocks.status}));
vi.mock("@/lib/security/rate-limit",()=>({enforceRateLimit:mocks.rate,rateLimitedResponse:()=>new Response(null,{status:429})}));
import { GET, POST } from "./route";
const w="11111111-1111-4111-8111-111111111111",l="22222222-2222-4222-8222-222222222222",ctx={params:Promise.resolve({workspaceId:w})};
const req=(body:Record<string,unknown>)=>new Request("https://app.test/api/connectors",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({provider:"gsc",location_id:l,...body})});
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("CONVERSATION_HOME_ENABLED","true");vi.stubEnv("VERCEL_ENV","preview");mocks.auth.mockResolvedValue({ok:true,user:{id:"u"},membership:{workspaceId:w,role:"owner",locationScope:null}});mocks.target.mockResolvedValue({url:"https://saved.example.test/",market:"hk"});mocks.connection.mockResolvedValue(null);mocks.rate.mockResolvedValue({allowed:true});mocks.status.mockImplementation(async i=>({source:i.provider,status:"disabled",scope:i.url??"",items:[],observedAt:null}));mocks.gsc.mockResolvedValue({source:"gsc",status:"empty",scope:"saved",items:[],observedAt:null});});
afterEach(()=>vi.unstubAllEnvs());
it("production refuses both surfaces before auth, repository or paid calls",async()=>{vi.stubEnv("VERCEL_ENV","production");expect((await GET(new Request(`https://app.test?location_id=${l}`),ctx)).status).toBe(404);expect((await POST(req({provider:"firecrawl"}),ctx)).status).toBe(404);expect(mocks.auth).not.toHaveBeenCalled();expect(mocks.paid).not.toHaveBeenCalled();});
it("GET shows connection/gates without any upstream sync",async()=>{const response=await GET(new Request(`https://app.test?location_id=${l}`),ctx);expect(response.status).toBe(200);expect((await response.json()).connectors[0].status).toBe("disconnected");expect(mocks.gsc).not.toHaveBeenCalled();expect(mocks.paid).not.toHaveBeenCalled();});
it("uses the server location website/market instead of client overrides",async()=>{expect((await POST(req({url:"https://attacker.test/"}),ctx)).status).toBe(400);expect(mocks.gsc).not.toHaveBeenCalled();await POST(req({}),ctx);expect(mocks.gsc).toHaveBeenCalledWith({workspaceId:w,websiteUrl:"https://saved.example.test/",market:"hk"});});
it("denies out-of-scope locations and non-owner paid/disconnect calls",async()=>{mocks.auth.mockResolvedValue({ok:true,user:{id:"u"},membership:{workspaceId:w,role:"manager",locationScope:["another"]}});expect((await POST(req({}),ctx)).status).toBe(403);expect(mocks.target).not.toHaveBeenCalled();mocks.auth.mockResolvedValue({ok:true,user:{id:"u"},membership:{workspaceId:w,role:"viewer",locationScope:null}});expect((await POST(req({provider:"firecrawl"}),ctx)).status).toBe(403);expect((await POST(req({disconnect:true}),ctx)).status).toBe(403);expect(mocks.paid).not.toHaveBeenCalled();expect(mocks.disconnect).not.toHaveBeenCalled();});


it("classifies a revoked connection as disconnected and passes the owner to disconnect accountability",async()=>{
  mocks.connection.mockResolvedValue({status:"revoked",scopes:["readonly"]});
  const response=await GET(new Request(`https://app.test?location_id=${l}`),ctx);expect((await response.json()).connectors[0].status).toBe("disconnected");
  expect((await POST(req({disconnect:true}),ctx)).status).toBe(200);expect(mocks.disconnect).toHaveBeenCalledWith(w,"u");
});
