import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { makeVerifier } from './auth';
import { createHandler, type Env } from './index';

const PROJECT = 'mind-the-gap-ander';
const UID = 'uid-del-dueno';
const ORIGIN = 'https://anderbasa.github.io';

let privateKey: CryptoKey;
let jwk: JWK;
let handler: ReturnType<typeof createHandler>;

const env: Env = {
  FIREBASE_PROJECT_ID: PROJECT,
  ALLOWED_UID: UID,
  ALLOWED_ORIGINS: `${ORIGIN},http://localhost:5181`,
  GEMINI_API_KEY: 'gemini-secreta',
  ANTHROPIC_API_KEY: 'anthropic-secreta',
};

async function token(sub = UID, project = PROJECT) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(`https://securetoken.google.com/${project}`)
    .setAudience(project)
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);
}

const req = (path: string, init: RequestInit = {}) => new Request(`https://w.example${path}`, { ...init, headers: { Origin: ORIGIN, ...(init.headers ?? {}) } });

beforeAll(async () => {
  const kp = await generateKeyPair('RS256', { extractable: true });
  privateKey = kp.privateKey as CryptoKey;
  jwk = { ...(await exportJWK(kp.publicKey)), kid: 'k1', alg: 'RS256' };
  handler = createHandler(makeVerifier(createLocalJWKSet({ keys: [jwk] })));
});

afterEach(() => vi.unstubAllGlobals());

describe('autenticación', () => {
  it('/health responde sin token', async () => {
    const r = await handler.fetch(req('/health'), env);
    expect(r.status).toBe(200);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  });

  it('sin token → 401', async () => {
    expect((await handler.fetch(req('/whoami'), env)).status).toBe(401);
  });

  it('token de otro usuario → 403', async () => {
    const r = await handler.fetch(req('/whoami', { headers: { Authorization: `Bearer ${await token('otro')}` } }), env);
    expect(r.status).toBe(403);
  });

  it('token de otro proyecto → 401', async () => {
    const r = await handler.fetch(req('/whoami', { headers: { Authorization: `Bearer ${await token(UID, 'otro-proyecto')}` } }), env);
    expect(r.status).toBe(401);
  });

  it('sin UID configurado no atiende a nadie', async () => {
    const r = await handler.fetch(req('/whoami', { headers: { Authorization: `Bearer ${await token()}` } }), { ...env, ALLOWED_UID: '' });
    expect(r.status).toBe(403);
  });

  it('tu token → 200 con tu UID', async () => {
    const r = await handler.fetch(req('/whoami', { headers: { Authorization: `Bearer ${await token()}` } }), env);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ uid: UID });
  });

  it('rechaza orígenes desconocidos', async () => {
    const r = await handler.fetch(new Request('https://w.example/health', { headers: { Origin: 'https://malo.example' } }), env);
    expect(r.status).toBe(403);
  });

  it('responde al preflight CORS de la app', async () => {
    const r = await handler.fetch(
      req('/gemini/models/gemini-3.5-flash-lite:generateContent', {
        method: 'OPTIONS',
        headers: { 'Access-Control-Request-Headers': 'authorization, content-type, x-stainless-os' },
      }),
      env,
    );
    expect(r.status).toBe(204);
    expect(r.headers.get('Access-Control-Allow-Headers')).toContain('x-stainless-os');
  });
});

describe('proxy', () => {
  it('reenvía a Gemini con la clave del Worker y sin el token del usuario', async () => {
    const fetchMock = vi.fn(async () => new Response('{"candidates":[]}', { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await handler.fetch(
      req('/gemini/models/gemini-3.5-flash-lite:generateContent', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await token()}`, 'content-type': 'application/json' },
        body: '{"contents":[]}',
      }),
      env,
    );
    expect(r.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    const h = new Headers(init.headers);
    expect(h.get('x-goog-api-key')).toBe('gemini-secreta');
    expect(h.get('authorization')).toBeNull();
  });

  it('reenvía a Claude con x-api-key, versión y betas', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 429, headers: { 'retry-after': '5' } }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await handler.fetch(
      req('/claude/v1/messages', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await token()}`,
          'x-api-key': 'la-pone-el-worker',
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'server-side-fallback-2026-07-01',
        },
        body: '{}',
      }),
      env,
    );
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toBe('5');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const h = new Headers(init.headers);
    expect(h.get('x-api-key')).toBe('anthropic-secreta');
    expect(h.get('anthropic-beta')).toBe('server-side-fallback-2026-07-01');
  });

  it('voz: reenvía a Interactions solo con modelos TTS', async () => {
    const fetchMock = vi.fn(async () => new Response('{"steps":[]}', { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const auth = { Authorization: `Bearer ${await token()}`, 'content-type': 'application/json' };
    const ok = await handler.fetch(req('/gemini/interactions', { method: 'POST', headers: auth, body: JSON.stringify({ model: 'gemini-3.8-flash-tts', input: [] }) }), env);
    expect(ok.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
    expect(new Headers(init.headers).get('x-goog-api-key')).toBe('gemini-secreta');
    const bad = await handler.fetch(req('/gemini/interactions', { method: 'POST', headers: auth, body: JSON.stringify({ model: 'gemini-3.8-flash' }) }), env);
    expect(bad.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('Live: pide el token efímero con liveConnectConstraints y devuelve su nombre', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ name: 'auth_tokens/abc', expireTime: 'x' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await handler.fetch(
      req('/gemini/live-token', { method: 'POST', headers: { Authorization: `Bearer ${await token()}` }, body: JSON.stringify({ model: 'gemini-3.8-live' }) }),
      env,
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ token: 'auth_tokens/abc', expireTime: 'x' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/auth_tokens');
    const body = JSON.parse(String(init.body));
    expect(body.uses).toBe(1);
    expect(body.liveConnectConstraints.model).toBe('models/gemini-3.8-live');
  });

  it('voces: solo pasa los filtros conocidos', async () => {
    const fetchMock = vi.fn(async () => new Response('{"voices":[]}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await handler.fetch(req('/gemini/voices?language_code=en-GB&gender=female&key=robada', { headers: { Authorization: `Bearer ${await token()}` } }), env);
    expect(r.status).toBe(200);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/voices?language_code=en-GB&gender=female');
  });

  it('sin clave de Claude responde 501 para que la app use el respaldo', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const r = await handler.fetch(
      req('/claude/v1/messages', { method: 'POST', headers: { Authorization: `Bearer ${await token()}` }, body: '{}' }),
      { ...env, ANTHROPIC_API_KEY: undefined },
    );
    expect(r.status).toBe(501);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no deja llamar a rutas o modelos fuera de la lista', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const auth = { Authorization: `Bearer ${await token()}` };
    expect((await handler.fetch(req('/gemini/models/../../files:list', { method: 'POST', headers: auth }), env)).status).toBe(404);
    expect((await handler.fetch(req('/claude/v1/models', { method: 'POST', headers: auth }), env)).status).toBe(404);
    expect(
      (await handler.fetch(req('/gemini/live-token', { method: 'POST', headers: auth, body: JSON.stringify({ model: 'gemini-3.8-flash' }) }), env)).status,
    ).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
