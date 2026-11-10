// Adaptador de Claude con el SDK oficial. La petición va al Worker (baseURL),
// que verifica tu sesión y añade la clave real: el navegador nunca la ve.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { getWorkerUrl } from '../config';
import { idToken } from '../state';
import { parseRetryAfter } from './retry';
import { AiError, type AiPart, type AiRequest, type ProviderOutput } from './types';

let client: Anthropic | null = null;
let clientBase = '';

function getClient(): Anthropic {
  const base = getWorkerUrl();
  if (!base) throw new AiError('config', 'Falta la dirección del Worker (Ajustes → Conexión).');
  if (!client || clientBase !== base) {
    client = new Anthropic({
      apiKey: 'la-pone-el-worker', // el Worker la sustituye por la clave real
      baseURL: `${base}/claude`,
      dangerouslyAllowBrowser: true, // seguro aquí: la clave real no está en el navegador
      maxRetries: 1,
      timeout: 180_000,
    });
    clientBase = base;
  }
  return client;
}

type ContentBlock = Anthropic.Beta.BetaTextBlockParam | Anthropic.Beta.BetaImageBlockParam;

function toBlock(p: AiPart): ContentBlock {
  if ('text' in p) return { type: 'text', text: p.text };
  const mt = p.inline.mimeType;
  if (mt === 'image/jpeg' || mt === 'image/png' || mt === 'image/webp' || mt === 'image/gif') {
    return { type: 'image', source: { type: 'base64', media_type: mt, data: p.inline.data } };
  }
  throw new AiError('bad-request', 'Claude no acepta audio: transcribe primero con Gemini.');
}

function mapError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof Anthropic.RateLimitError) {
    return new AiError('rate', e.message, { status: 429, retryAfterMs: parseRetryAfter(e.headers?.get('retry-after')) });
  }
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return new AiError('auth', e.message, { status: e.status });
  }
  if (e instanceof Anthropic.BadRequestError) return new AiError('bad-request', e.message, { status: 400 });
  if (e instanceof Anthropic.InternalServerError) return new AiError('overloaded', e.message, { status: e.status });
  if (e instanceof Anthropic.APIConnectionError) return new AiError('network', 'Sin conexión con el Worker.');
  if (e instanceof Anthropic.APIError) {
    if (e.status === 529) return new AiError('overloaded', e.message, { status: 529 });
    if (e.status === 501) return new AiError('unavailable', 'Claude aún no está configurado.', { status: 501 });
    return new AiError('bad-request', e.message, { status: e.status });
  }
  return new AiError('unavailable', (e as Error)?.message ?? 'Error desconocido');
}

export async function callClaude(model: string, req: AiRequest): Promise<ProviderOutput> {
  const c = getClient();
  const token = await idToken();
  if (!token) throw new AiError('auth', 'No hay sesión iniciada.');

  const params = {
    model,
    max_tokens: req.maxTokens ?? 16000,
    // Si el modelo rechaza la petición por seguridad, la API la reintenta con otro modelo.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default' as const,
    ...(req.system ? { system: [{ type: 'text' as const, text: req.system, cache_control: { type: 'ephemeral' as const } }] } : {}),
    messages: req.messages.map((m) => ({ role: m.role, content: m.parts.map(toBlock) })),
    output_config: {
      effort: req.effort ?? 'medium',
      ...(req.schema ? { format: betaZodOutputFormat(req.schema) } : {}),
    },
  };

  try {
    const opts = { headers: { Authorization: `Bearer ${token}` }, signal: req.signal };
    const msg = req.schema ? await c.beta.messages.parse(params, opts) : await c.beta.messages.create(params, opts);
    if (msg.stop_reason === 'refusal') throw new AiError('refusal', 'Claude ha rechazado la petición.');
    const text = msg.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const u = msg.usage;
    const cacheRead = u.cache_read_input_tokens ?? 0;
    const cacheWrite = u.cache_creation_input_tokens ?? 0;
    return {
      text,
      data: 'parsed_output' in msg ? (msg as { parsed_output: unknown }).parsed_output ?? undefined : undefined,
      usage: {
        inputTokens: u.input_tokens + cacheRead + cacheWrite,
        outputTokens: u.output_tokens,
        audioInputTokens: 0,
        cacheReadTokens: cacheRead,
        cacheWriteTokens: cacheWrite,
      },
    };
  } catch (e) {
    throw mapError(e);
  }
}
