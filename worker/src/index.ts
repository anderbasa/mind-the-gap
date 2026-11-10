// Cloudflare Worker de Mind the Gap: guarda las claves de API y solo atiende a tu UID.
// Es un proxy fino: no lee ni guarda el contenido (el cuerpo pasa tal cual, en streaming).
import { verifyFirebaseToken, type Verifier } from './auth';

export interface Env {
  GEMINI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  PEXELS_API_KEY?: string;
  FIREBASE_PROJECT_ID: string;
  ALLOWED_UID: string;
  ALLOWED_ORIGINS: string;
}

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const ANTHROPIC = 'https://api.anthropic.com';
const GEMINI_ROUTE = /^\/gemini\/models\/(gemini-[a-z0-9.-]+):(generateContent|countTokens)$/;
const LIVE_MODEL = /^gemini-[a-z0-9.-]*(live|native-audio)[a-z0-9.-]*$/;
const CLAUDE_ROUTES = new Set(['/claude/v1/messages', '/claude/v1/messages/count_tokens']);

function allowedOrigin(origin: string | null, env: Env): boolean {
  if (!origin) return false;
  return env.ALLOWED_ORIGINS.split(',')
    .map((s) => s.trim())
    .includes(origin);
}

function withCors(res: Response, req: Request, env: Env): Response {
  const origin = req.headers.get('Origin');
  const out = new Response(res.body, res);
  if (allowedOrigin(origin, env)) {
    out.headers.set('Access-Control-Allow-Origin', origin!);
    out.headers.set('Vary', 'Origin');
    out.headers.set('Access-Control-Expose-Headers', 'retry-after, request-id');
  }
  return out;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

const fail = (status: number, kind: string, message: string) => json(status, { error: { kind, message, code: status } });

function passthrough(upstream: Response): Response {
  const headers = new Headers();
  for (const h of ['content-type', 'retry-after', 'request-id', 'anthropic-ratelimit-requests-remaining']) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

async function createLiveToken(model: string, env: Env): Promise<Response> {
  const now = Date.now();
  const token = {
    uses: 1,
    expireTime: new Date(now + 30 * 60_000).toISOString(),
    newSessionExpireTime: new Date(now + 2 * 60_000).toISOString(),
    bidiGenerateContentSetup: { model: `models/${model}` },
  };
  const call = (body: unknown) =>
    fetch(`${GEMINI}/auth_tokens`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY! },
      body: JSON.stringify(body),
    });
  // La API REST acepta el AuthToken directamente; algunas versiones lo piden envuelto.
  let r = await call(token);
  if (r.status === 400) r = await call({ authToken: token });
  const data = (await r.json().catch(() => ({}))) as { name?: string; expireTime?: string };
  if (!r.ok || !data.name) return json(r.ok ? 502 : r.status, data);
  return json(200, { token: data.name, expireTime: data.expireTime ?? token.expireTime });
}

export function createHandler(verify: Verifier = verifyFirebaseToken) {
  return {
    async fetch(req: Request, env: Env): Promise<Response> {
      const url = new URL(req.url);
      const origin = req.headers.get('Origin');

      if (req.method === 'OPTIONS') {
        if (!allowedOrigin(origin, env)) return new Response(null, { status: 403 });
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': origin!,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': req.headers.get('Access-Control-Request-Headers') ?? 'authorization, content-type',
            'Access-Control-Max-Age': '86400',
            Vary: 'Origin',
          },
        });
      }
      const respond = (res: Response) => withCors(res, req, env);

      if (origin && !allowedOrigin(origin, env)) return fail(403, 'auth', 'Origen no permitido.');
      if (url.pathname === '/health') return respond(json(200, { ok: true, service: 'mind-the-gap' }));

      // ── Autenticación: ID token de Firebase + UID permitido ──
      const header = req.headers.get('Authorization') ?? '';
      const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
      if (!token) return respond(fail(401, 'auth', 'Falta el token de sesión.'));
      if (!env.ALLOWED_UID) return respond(fail(403, 'auth', 'El Worker aún no tiene tu UID configurado.'));
      let uid: string;
      try {
        uid = await verify(token, env.FIREBASE_PROJECT_ID);
      } catch {
        return respond(fail(401, 'auth', 'Sesión no válida o caducada.'));
      }
      if (uid !== env.ALLOWED_UID) return respond(fail(403, 'auth', 'Esta cuenta no está autorizada.'));

      if (url.pathname === '/whoami') return respond(json(200, { uid }));

      // ── Gemini (texto, audio, TTS) ──
      const gm = GEMINI_ROUTE.exec(url.pathname);
      if (gm && req.method === 'POST') {
        if (!env.GEMINI_API_KEY) return respond(fail(500, 'config', 'Falta GEMINI_API_KEY en el Worker.'));
        const upstream = await fetch(`${GEMINI}/models/${gm[1]}:${gm[2]}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
          body: req.body,
        });
        return respond(passthrough(upstream));
      }

      // ── Gemini Live: token efímero de un solo uso ──
      if (url.pathname === '/gemini/live-token' && req.method === 'POST') {
        if (!env.GEMINI_API_KEY) return respond(fail(500, 'config', 'Falta GEMINI_API_KEY en el Worker.'));
        const { model } = (await req.json().catch(() => ({}))) as { model?: string };
        if (!model || !LIVE_MODEL.test(model)) return respond(fail(400, 'bad-request', 'Modelo de Live no válido.'));
        return respond(await createLiveToken(model, env));
      }

      // ── Claude (Messages API) ──
      if (CLAUDE_ROUTES.has(url.pathname) && req.method === 'POST') {
        // Sin clave de Claude (aún sin saldo): 501 → la app pasa directamente al modelo de respaldo.
        if (!env.ANTHROPIC_API_KEY) return respond(fail(501, 'unavailable', 'Claude aún no está configurado en el Worker.'));
        const headers = new Headers({
          'content-type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': req.headers.get('anthropic-version') ?? '2023-06-01',
        });
        const beta = req.headers.get('anthropic-beta');
        if (beta) headers.set('anthropic-beta', beta);
        const upstream = await fetch(`${ANTHROPIC}${url.pathname.replace(/^\/claude/, '')}`, { method: 'POST', headers, body: req.body });
        return respond(passthrough(upstream));
      }

      // ── Pexels (fotos del Speaking P2) ──
      if (url.pathname === '/pexels/search' && req.method === 'GET') {
        if (!env.PEXELS_API_KEY) return respond(fail(500, 'config', 'Falta PEXELS_API_KEY en el Worker.'));
        const q = url.searchParams.get('query') ?? '';
        const per = Math.min(Number(url.searchParams.get('per_page') ?? 6) || 6, 15);
        const upstream = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${per}&orientation=landscape`, {
          headers: { Authorization: env.PEXELS_API_KEY },
        });
        return respond(passthrough(upstream));
      }

      return respond(fail(404, 'bad-request', 'Ruta no encontrada.'));
    },
  };
}

export default createHandler();
