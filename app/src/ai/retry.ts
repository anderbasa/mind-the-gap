// Reintentos con espera exponencial ante límites de uso (429) y saturación (503/529).
import { AiError } from './types';

export interface RetryOpts {
  retries?: number;
  baseMs?: number;
  maxWaitMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function isRetryable(e: unknown): boolean {
  return e instanceof AiError && (e.kind === 'rate' || e.kind === 'overloaded' || e.kind === 'network');
}

export function backoffMs(attempt: number, opts: { baseMs: number; maxWaitMs: number; random: () => number }, retryAfterMs?: number): number {
  if (retryAfterMs != null && retryAfterMs > 0) return Math.min(retryAfterMs, opts.maxWaitMs);
  const exp = opts.baseMs * 2 ** attempt;
  const jitter = exp * 0.3 * opts.random();
  return Math.min(exp + jitter, opts.maxWaitMs);
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const retries = opts.retries ?? 2;
  const cfg = { baseMs: opts.baseMs ?? 1200, maxWaitMs: opts.maxWaitMs ?? 20_000, random: opts.random ?? Math.random };
  const sleep = opts.sleep ?? defaultSleep;
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      if (!isRetryable(e) || attempt >= retries) throw e;
      const wait = backoffMs(attempt, cfg, (e as AiError).opts.retryAfterMs);
      // Si el proveedor pide esperar mucho, mejor pasar al siguiente modelo de la cadena.
      if ((e as AiError).opts.retryAfterMs != null && (e as AiError).opts.retryAfterMs! > cfg.maxWaitMs) throw e;
      await sleep(wait);
      attempt++;
    }
  }
}

/** Convierte "34s" o "1.5s" (formato de Google) en milisegundos. */
export function parseGoogleDelay(v: unknown): number | undefined {
  if (typeof v !== 'string') return undefined;
  const m = /^([\d.]+)s$/.exec(v.trim());
  return m ? Math.round(parseFloat(m[1]) * 1000) : undefined;
}

/** Cabecera Retry-After en segundos o fecha HTTP. */
export function parseRetryAfter(v: string | null | undefined, now = Date.now()): number | undefined {
  if (!v) return undefined;
  const secs = Number(v);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const t = Date.parse(v);
  return Number.isFinite(t) ? Math.max(0, t - now) : undefined;
}

/** Clasifica un error de la API de Gemini (o del Worker) a partir del estado y el cuerpo. */
export function classifyGeminiError(status: number, body: unknown, retryAfterHeader?: string | null): AiError {
  const err = (body as { error?: { message?: string; status?: string; kind?: string; details?: unknown[] } })?.error ?? {};
  const msg = err.message ?? `Error ${status}`;
  if (err.kind === 'auth' || status === 401) return new AiError('auth', msg, { status });
  if (status === 429) {
    const details = (err.details ?? []) as { '@type'?: string; violations?: { quotaId?: string }[]; retryDelay?: string }[];
    const quotaIds = details.flatMap((d) => d.violations?.map((v) => v.quotaId ?? '') ?? []);
    const perDay = quotaIds.some((q) => /PerDay/i.test(q));
    const delay = details.map((d) => parseGoogleDelay(d.retryDelay)).find((x) => x != null) ?? parseRetryAfter(retryAfterHeader);
    return perDay ? new AiError('quota-day', msg, { status }) : new AiError('rate', msg, { status, retryAfterMs: delay });
  }
  if (status === 503 || status === 529 || status === 500 || status === 502 || status === 504) return new AiError('overloaded', msg, { status });
  if (status === 403) return new AiError('auth', msg, { status });
  return new AiError('bad-request', msg, { status });
}
