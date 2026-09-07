import { randomUUID } from "node:crypto";
import { assertLocalOrigin } from "./safety";
import { sql, type AcceptanceEnvironment } from "./environment";
export interface MerchantSeed { workspaceId: string; slug: string; locationId: string; otherLocationId: string; actionId: string; emails: Record<"owner" | "manager" | "viewer", string> }
export async function seedMerchant(env: AcceptanceEnvironment, market: "hk" | "tw"): Promise<MerchantSeed> {
  assertLocalOrigin(env.api);
  const workspaceId = randomUUID(), locationId = randomUUID(), otherLocationId = randomUUID(), actionId = randomUUID();
  const slug = `acceptance-${market}-${workspaceId.slice(0, 8)}`;
  const emails = { owner: `owner-${workspaceId}@acceptance.test`, manager: `manager-${workspaceId}@acceptance.test`, viewer: `viewer-${workspaceId}@acceptance.test` };
  for (const email of Object.values(emails)) {const userId=randomUUID();sql(env.db, `insert into app_users(id,email) values ('${userId}','${email}'); insert into auth_identities(provider,subject,user_id) values ('neon','fixture:${email}','${userId}');`);}
  sql(env.db, `insert into workspaces(id, business_name, market, slug, tier, timezone) values ('${workspaceId}','Acceptance ${market.toUpperCase()}','${market}','${slug}','lite','${market === "tw" ? "Asia/Taipei" : "Asia/Hong_Kong"}');
    insert into locations(id,workspace_id,slug,name,is_primary) values ('${locationId}','${workspaceId}','primary','Primary',true),('${otherLocationId}','${workspaceId}','other','Other',false);
    insert into workspace_members(workspace_id,email,role,location_scope) values ('${workspaceId}','${emails.owner}','owner',null),('${workspaceId}','${emails.manager}','manager',array['${otherLocationId}']::uuid[]),('${workspaceId}','${emails.viewer}','viewer',null);
    insert into actions(id,workspace_id,location_id,template_key,title,summary,evidence,priority,priority_score,priority_factors,effort_minutes,capability,dedupe_key,provided_inputs) values ('${actionId}','${workspaceId}','${locationId}','review-response','{"en":"Reply to reviews","zh-HK":"回覆評論","zh-TW":"回覆評論"}','{"en":"Fixture review"}','{}','high',80,'{}',10,'Live','${actionId}','{"brand_voice":"warm","reviews_without_response":"Thank you for the service","language":"en"}');`);
  return { workspaceId, slug, locationId, otherLocationId, actionId, emails };
}
