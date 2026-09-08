import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';

import { assertLocalOrigin, listen } from './safety';

type Link = { email: string; callbackURL: string; expires: number };
type FixtureFault = 'binding' | 'mapping' | 'revoked' | 'upstream' | null;
type Session = { email: string; subject: string; fault: FixtureFault };
type GoogleVerifier = { email: string; callbackURL: string; expires: number; fault: FixtureFault };

function validFixtureEmail(value: unknown): value is string {
 return typeof value === 'string' && /^[^\s@]+@acceptance\.test$/.test(value);
}

export async function startIdentityServer(app: string, secret: string) {
 assertLocalOrigin(app);
 const links = new Map<string, Link>();
 const sessions = new Map<string, Session>();
 const verifiers = new Map<string, GoogleVerifier>();
 const messages: { ID: string; To: { Address: string }[]; HTML: string; Text: string }[] = [];
 let selectedGoogleEmail: string | null = null;
 let nextFault: FixtureFault = null;
 let completionHold: Promise<void> | null = null;
 let releaseCompletionHold: (() => void) | null = null;

 const server = createServer(async (req, res) => {
  const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => {
   res.writeHead(status, { 'content-type': 'application/json', ...headers }).end(JSON.stringify(value));
  };
  const redirect = (location: string) => res.writeHead(303, { location }).end();
  const requestOrigin = () => req.headers['x-fixture-origin'];
  const controller = () => req.headers.authorization === `Bearer ${secret}` && requestOrigin() === app;
  const read = async (): Promise<Record<string, unknown>> => {
   const chunks: Buffer[] = [];
   for await (const chunk of req) chunks.push(Buffer.from(chunk));
   const raw = Buffer.concat(chunks).toString();
   return raw ? JSON.parse(raw) as Record<string, unknown> : {};
  };
  const safeCallback = (value: unknown): URL | null => {
   try {
    const callback = new URL(String(value));
    return callback.origin === app && callback.pathname === '/auth/callback' ? callback : null;
   } catch { return null; }
  };
  try {
   if (req.method === 'GET' && req.url === '/api/v1/messages') return json({ messages: [...messages].reverse() });
   if (req.method === 'GET' && req.url?.startsWith('/api/v1/message/')) return json(messages.find(message => message.ID === req.url!.split('/').pop()) ?? {});
   if (req.method === 'GET' && req.url?.startsWith('/google/authorize')) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const verifier = url.searchParams.get('verifier') ?? '';
    const entry = verifiers.get(verifier);
    if (!entry || entry.expires <= Date.now()) return json({ error: 'invalid_verifier' }, 401);
    if (entry.fault === 'upstream') {
     const callback = new URL(entry.callbackURL);
     callback.searchParams.set('error', 'access_denied');
     return redirect(callback.href);
    }
    const callback = new URL(entry.callbackURL);
    callback.searchParams.set('neon_auth_session_verifier', verifier);
    return redirect(callback.href);
   }
   if (!controller()) return json({ error: 'unauthorized' }, 401);
   const body = await read();
   if (req.url === '/send') {
    const callback = safeCallback(body.callbackURL);
    if (!callback || !validFixtureEmail(body.email)) return json({ error: 'unsafe_fixture_recipient_or_callback' }, 400);
    const code = randomBytes(32).toString('base64url');
    links.set(code, { email: body.email, callbackURL: callback.href, expires: Date.now() + 60_000 });
    const link = `${app}/api/auth/verify?token=${code}`;
    messages.push({ ID: randomUUID(), To: [{ Address: body.email }], HTML: `<a href="${link}">Local contract sign-in</a>`, Text: link });
    return json({ ok: true });
   }
   if (req.url === '/redeem') {
    const link = links.get(String(body.code ?? ''));
    links.delete(String(body.code ?? ''));
    if (!link || link.expires <= Date.now()) return json({ error: 'invalid_token' }, 401);
    const token = randomBytes(32).toString('base64url');
    sessions.set(token, { email: link.email, subject: `fixture:${link.email}`, fault: null });
    return json({ token, callbackURL: link.callbackURL });
   }
   if (req.url === '/google/start') {
    const callback = safeCallback(body.callbackURL);
    const email = selectedGoogleEmail;
    if (!callback || !email) return json({ error: 'fixture_google_account_missing' }, 400);
    const verifier = randomBytes(32).toString('base64url');
    verifiers.set(verifier, { email, callbackURL: callback.href, expires: Date.now() + 60_000, fault: nextFault });
    nextFault = null;
    return json({ url: `${(await listenUrl())}/google/authorize?verifier=${encodeURIComponent(verifier)}`, redirect: true });
   }
   if (req.url === '/google/exchange') {
    const verifier = String(body.verifier ?? '');
    const entry = verifiers.get(verifier);
    verifiers.delete(verifier);
    if (!entry || entry.expires <= Date.now() || entry.fault === 'upstream') return json({ error: 'invalid_verifier' }, 401);
    const token = randomBytes(32).toString('base64url');
    sessions.set(token, { email: entry.email, subject: `fixture:${entry.email}`, fault: entry.fault });
    return json({ token });
   }
   if (req.url === '/session') {
    const hold = completionHold;
    if (hold) await hold;
    const identity = sessions.get(String(body.token ?? ''));
    if (!identity || identity.fault === 'revoked') return json(null);
    if (identity.fault === 'upstream') return json({ error: 'fixture_upstream_unavailable' }, 503);
    return json({ email: identity.email, subject: identity.subject, provider: 'neon', verified: true, fixtureFault: identity.fault });
   }
   if (req.url === '/revoke') { sessions.delete(String(body.token ?? '')); return json({ ok: true }); }
   if (req.url === '/test/google-account') {
    if (!validFixtureEmail(body.email)) return json({ error: 'invalid_fixture_account' }, 400);
    selectedGoogleEmail = body.email;
    return json({ ok: true });
   }
   if (req.url === '/test/fault') {
    const fault = body.fault;
    if (fault !== null && !['binding', 'mapping', 'revoked', 'upstream'].includes(String(fault))) return json({ error: 'invalid_fixture_fault' }, 400);
    nextFault = fault as FixtureFault;
    return json({ ok: true });
   }
   if (req.url === '/test/completion-hold') {
    if (completionHold) return json({ error: 'completion_hold_active' }, 409);
    completionHold = new Promise<void>(resolve => { releaseCompletionHold = resolve; });
    return json({ ok: true });
   }
   if (req.url === '/test/completion-release') {
    if (!completionHold || !releaseCompletionHold) return json({ error: 'completion_hold_missing' }, 409);
    const release = releaseCompletionHold;
    completionHold = null;
    releaseCompletionHold = null;
    release();
    return json({ ok: true });
   }
   return json({ error: 'not_found' }, 404);
  } catch { return json({ error: 'invalid_request' }, 400); }
 });
 const url = await listen(server);
 async function listenUrl() { return url; }
 return {
  url,
  expireLink(link: string) {
   const target = new URL(link);
   if (target.origin !== app) throw new Error('unsafe_fixture_link');
   const entry = links.get(target.searchParams.get('token') ?? '');
   if (!entry) throw new Error('fixture_link_missing');
   entry.expires = 0;
  },
  async stop() {
   if (releaseCompletionHold) { const release = releaseCompletionHold; completionHold = null; releaseCompletionHold = null; release(); }
   server.closeAllConnections();
   await new Promise<void>(resolve => server.close(() => resolve()));
  },
 };
}