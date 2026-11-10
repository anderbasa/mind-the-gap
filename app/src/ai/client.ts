// La interfaz única de IA: runAI({ task, system, messages, schema }).
// Recorre la cadena de modelos de la tarea con reintentos, valida la salida,
// cuenta el uso y guarda en caché si se pide.
import { IS_DEMO } from '../config';
import { hasStore, settings, store } from '../state';
import { callGemini } from './gemini';
import { mockProvider } from './mock';
import { chainFor, modelKey } from './providers';
import { withRetry } from './retry';
import { AiError, EMPTY_USAGE, type AiRequest, type AiResult, type ModelRef, type ProviderOutput } from './types';
import { claudeSpentThisMonth, recordUsage } from './usage';

/** Modelos con la cuota diaria gratuita agotada: se saltan hasta el reset (medianoche del Pacífico). */
const exhausted = new Map<string, number>();

function nextPacificMidnight(now = new Date()): number {
  const pt = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const diff = now.getTime() - pt.getTime();
  const next = new Date(pt);
  next.setHours(24, 0, 0, 0);
  return next.getTime() + diff;
}

function isExhausted(ref: ModelRef): boolean {
  const until = exhausted.get(modelKey(ref));
  if (until == null) return false;
  if (Date.now() >= until) {
    exhausted.delete(modelKey(ref));
    return false;
  }
  return true;
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function callProvider(ref: ModelRef, req: AiRequest): Promise<ProviderOutput> {
  if (IS_DEMO) return mockProvider(ref, req);
  // El SDK de Claude solo se descarga cuando hace falta (correcciones).
  return ref.provider === 'claude' ? import('./claude').then((m) => m.callClaude(ref.model, req)) : callGemini(ref.model, req);
}

const FALLBACK_KINDS = new Set(['rate', 'quota-day', 'overloaded', 'network', 'refusal', 'invalid-output', 'budget', 'bad-request', 'unavailable']);

export async function runAI<T>(req: AiRequest<T>): Promise<AiResult<T>> {
  const cfg = settings.value;
  const chain = chainFor(req.task, cfg.providerOverrides);

  let cacheKey: string | null = null;
  if (req.cache && hasStore()) {
    cacheKey = await sha256(JSON.stringify([req.task, req.system ?? '', req.messages]));
    const hit = await store().get<{ text: string; data?: T; model: ModelRef }>(`aiCache/${cacheKey}`);
    if (hit) return { text: hit.text, data: hit.data, model: hit.model, usage: EMPTY_USAGE, cached: true, fellBack: false };
  }

  let lastErr: unknown = new AiError('unavailable', 'No hay ningún modelo disponible para esta tarea.');
  for (let i = 0; i < chain.length; i++) {
    const ref = chain[i];
    if (isExhausted(ref)) continue;
    if (ref.provider === 'claude' && !IS_DEMO) {
      const spent = await claudeSpentThisMonth();
      if (spent >= cfg.claudeMonthlyCapUsd) {
        lastErr = new AiError('budget', `Tope mensual de Claude alcanzado (${cfg.claudeMonthlyCapUsd} $).`);
        continue;
      }
    }
    try {
      const out = await withRetry(() => callProvider(ref, req));
      let data: T | undefined;
      if (req.schema) {
        const raw = out.data ?? safeJson(out.text);
        const parsed = req.schema.safeParse(raw);
        if (!parsed.success) throw new AiError('invalid-output', 'La respuesta no cumple el formato esperado.', { model: ref.model });
        data = parsed.data;
      }
      await recordUsage(ref, out.usage, cfg.geminiTier).catch((e) => console.warn('[uso]', e));
      if (cacheKey) {
        await store()
          .set(`aiCache/${cacheKey}`, { text: out.text, ...(data !== undefined ? { data } : {}), model: ref, task: req.task, at: Date.now() })
          .catch((e) => console.warn('[caché]', e));
      }
      return { text: out.text, data, model: ref, usage: out.usage, cached: false, fellBack: i > 0 };
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      lastErr = e;
      if (e instanceof AiError && e.kind === 'quota-day') exhausted.set(modelKey(ref), nextPacificMidnight());
      if (!(e instanceof AiError) || !FALLBACK_KINDS.has(e.kind)) throw e;
      console.warn(`[ia] ${modelKey(ref)} falló (${(e as AiError).kind}); probando el siguiente`);
    }
  }
  throw lastErr;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const a = text.indexOf('{');
    const b = text.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(text.slice(a, b + 1));
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

/** Mensaje en castellano para mostrar al usuario. */
export function aiErrorMessage(e: unknown): string {
  if (!(e instanceof AiError)) return 'Algo ha fallado con la IA. Inténtalo de nuevo.';
  switch (e.kind) {
    case 'config':
      return e.message;
    case 'auth':
      return 'El Worker no ha aceptado tu sesión. Cierra sesión y vuelve a entrar; si sigue, revisa Ajustes → Conexión.';
    case 'quota-day':
      return 'Se ha agotado la cuota gratuita de hoy. Puedes practicar con el banco de ejercicios; lo que necesite IA queda en cola.';
    case 'rate':
    case 'overloaded':
      return 'La IA está saturada ahora mismo. Prueba en un minuto.';
    case 'network':
      return 'Sin conexión. Comprueba internet y vuelve a probar.';
    case 'budget':
      return e.message;
    case 'refusal':
      return 'La IA no ha querido responder a esto. Reformúlalo.';
    default:
      return e.message || 'Algo ha fallado con la IA.';
  }
}
