import { expect, it, vi } from "vitest";
import { encryptToken } from "@/lib/security/token-crypto";
import { GSC_SCOPE_REQUIRED } from "./google-connection";
import { withGscAccessToken } from "./gsc-access-token";
const connection={id:"c",status:"active",scopes:[GSC_SCOPE_REQUIRED],accessTokenEncrypted:encryptToken("fixture-access"),refreshTokenEncrypted:encryptToken("fixture-refresh"),expiresAt:"2099-01-01T00:00:00Z"};
it("refuses disconnected and wrong-scope credentials without handing tokens to an adapter", async()=>{
  const run=vi.fn();
  for (const row of [null,{...connection,scopes:["https://www.googleapis.com/auth/business.manage"]},{...connection,status:"expired"}]) {
    const repository={gscConnection:vi.fn().mockResolvedValue(row),refreshGsc:vi.fn(),expireGsc:vi.fn()};
    await expect(withGscAccessToken("w",run,{repository})).rejects.toMatchObject({code:row?"reconnect":"disconnected"});
  }
  expect(run).not.toHaveBeenCalled();
});
it("refreshes an expired access token and marks rejected refresh for reconnect",async()=>{
  const repository={gscConnection:vi.fn().mockResolvedValue({...connection,expiresAt:"2020-01-01"}),refreshGsc:vi.fn().mockResolvedValue(true),expireGsc:vi.fn()};
  const refresh=vi.fn().mockResolvedValue({accessToken:"renewed",expiresAt:"2099-01-01",refreshToken:null,scopes:[]});
  expect(await withGscAccessToken("w",async token=>token,{repository,refresh})).toBe("renewed");
  expect(repository.refreshGsc).toHaveBeenCalled();
  refresh.mockResolvedValue(null);await expect(withGscAccessToken("w",async token=>token,{repository,refresh})).rejects.toMatchObject({code:"reconnect"});expect(repository.expireGsc).toHaveBeenCalled();
});

it("keeps an active refresh credential retryable when the token endpoint is temporarily unavailable",async()=>{
  const repository={gscConnection:vi.fn().mockResolvedValue({...connection,expiresAt:"2020-01-01"}),refreshGsc:vi.fn(),expireGsc:vi.fn()};
  const refresh=vi.fn().mockRejectedValue(new DOMException("timed out","TimeoutError"));
  await expect(withGscAccessToken("w",async token=>token,{repository,refresh})).rejects.toMatchObject({name:"TimeoutError"});
  expect(repository.expireGsc).not.toHaveBeenCalled();
  refresh.mockResolvedValue({accessToken:"retry-access",refreshToken:null,expiresAt:"2099-01-01",scopes:[GSC_SCOPE_REQUIRED]});repository.refreshGsc.mockResolvedValue(true);
  expect(await withGscAccessToken("w",async token=>token,{repository,refresh})).toBe("retry-access");
  expect(repository.expireGsc).not.toHaveBeenCalled();
});
