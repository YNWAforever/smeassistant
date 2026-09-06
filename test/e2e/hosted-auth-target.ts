export function hostedAuthTarget(env:Record<string,string|undefined>) {
 const required=['NEON_AUTH_TEST_AUTHORIZED','NEON_AUTH_TEST_ISOLATED','NEON_AUTH_TEST_ORIGIN','NEON_AUTH_TEST_BRANCH','NEON_AUTH_TEST_PRODUCTION_ORIGIN','NEON_AUTH_TEST_PROVIDER_ORIGIN','NEON_AUTH_TEST_PRODUCTION_PROVIDER_ORIGIN','NEON_AUTH_TEST_RECIPIENT','NEON_AUTH_TEST_INBOX_URL','NEON_AUTH_TEST_GOOGLE_EMAIL','NEON_AUTH_TEST_GOOGLE_STATE','NEON_AUTH_TEST_LINK_TTL_MS'] as const;
 if(required.some(key=>!env[key]) || env.NEON_AUTH_TEST_AUTHORIZED!=='yes' || env.NEON_AUTH_TEST_ISOLATED!=='yes') throw new Error('hosted_auth_not_authorized_or_target_missing');
 const origin=new URL(env.NEON_AUTH_TEST_ORIGIN!);const production=new URL(env.NEON_AUTH_TEST_PRODUCTION_ORIGIN!);
 if(origin.protocol!=='https:' || origin.origin===production.origin || origin.pathname!=='/' || origin.search || origin.hash || origin.username || origin.password || !/^br-[a-z0-9-]+$/.test(env.NEON_AUTH_TEST_BRANCH!)) throw new Error('hosted_auth_requires_isolated_nonproduction_target');
 const provider=new URL(env.NEON_AUTH_TEST_PROVIDER_ORIGIN!);const productionProvider=new URL(env.NEON_AUTH_TEST_PRODUCTION_PROVIDER_ORIGIN!);
 if(provider.protocol!=='https:' || provider.origin===productionProvider.origin || provider.pathname!=='/' || provider.search || provider.hash || provider.username || provider.password)throw new Error('hosted_auth_provider_not_isolated');
 const linkTtlMs=Number(env.NEON_AUTH_TEST_LINK_TTL_MS);if(!Number.isInteger(linkTtlMs) || linkTtlMs<1000 || linkTtlMs>3600000)throw new Error('hosted_auth_link_ttl_invalid');
 const inbox=new URL(env.NEON_AUTH_TEST_INBOX_URL!);if(inbox.protocol!=='https:' || inbox.username || inbox.password)throw new Error('hosted_auth_inbox_invalid');
 for(const key of ['NEON_AUTH_TEST_RECIPIENT','NEON_AUTH_TEST_GOOGLE_EMAIL'])if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env[key]!))throw new Error('hosted_auth_account_invalid');
 return {origin:origin.origin,provider:provider.origin,inbox:inbox.href,recipient:env.NEON_AUTH_TEST_RECIPIENT!,googleEmail:env.NEON_AUTH_TEST_GOOGLE_EMAIL!,googleState:env.NEON_AUTH_TEST_GOOGLE_STATE!,linkTtlMs};
}
