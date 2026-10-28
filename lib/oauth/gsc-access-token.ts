import "server-only";
import { conversationConnectorRepository } from "@/lib/repositories/conversation-connectors";
import { decryptToken, encryptToken } from "@/lib/security/token-crypto";
import { GSC_SCOPE_REQUIRED, needsRefresh, refreshAccessToken } from "./google-connection";
export class GscConnectionError extends Error {
  constructor(readonly code:"disconnected"|"reconnect"|"forbidden") { super(code);this.name="GscConnectionError"; }
}
type Repository=Pick<ReturnType<typeof conversationConnectorRepository>,"gscConnection"|"refreshGsc"|"expireGsc">;
export async function withGscAccessToken<T>(workspaceId:string,run:(token:string)=>Promise<T>,deps:{repository?:Repository;refresh?:typeof refreshAccessToken}={}):Promise<T> {
  const repository=deps.repository??conversationConnectorRepository();
  const row=await repository.gscConnection(workspaceId);
  if (!row || row.status === "revoked") throw new GscConnectionError("disconnected");
  if (row.status!=="active"||!row.scopes.includes(GSC_SCOPE_REQUIRED)) throw new GscConnectionError("reconnect");
  let token:string;
  if (needsRefresh(row.expiresAt)) {
    const tokens=row.refreshTokenEncrypted?await (deps.refresh??(token=>refreshAccessToken(token,{throwOnTransient:true})))(decryptToken(row.refreshTokenEncrypted)):null;
    if (!tokens) {await repository.expireGsc(workspaceId,row.id);throw new GscConnectionError("reconnect");}
    if (!await repository.refreshGsc({workspaceId,id:row.id,accessTokenEncrypted:encryptToken(tokens.accessToken),expiresAt:tokens.expiresAt})) throw new GscConnectionError("reconnect");
    token=tokens.accessToken;
  } else {token=decryptToken(row.accessTokenEncrypted);}
  try {return await run(token);}
  catch (error) {
    if (error instanceof GscConnectionError && error.code==="reconnect") await repository.expireGsc(workspaceId,row.id);
    throw error;
  }
}
