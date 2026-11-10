import { describe, expect, it, vi } from 'vitest';
import { backoffMs, classifyGeminiError, parseGoogleDelay, parseRetryAfter, withRetry } from './retry';
import { AiError } from './types';

describe('classifyGeminiError', () => {
  it('distingue cuota diaria agotada de límite por minuto', () => {
    const perDay = classifyGeminiError(429, {
      error: {
        status: 'RESOURCE_EXHAUSTED',
        message: 'Quota exceeded',
        details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }],
      },
    });
    expect(perDay.kind).toBe('quota-day');

    const perMin = classifyGeminiError(429, {
      error: {
        details: [
          { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] },
          { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '7s' },
        ],
      },
    });
    expect(perMin.kind).toBe('rate');
    expect(perMin.opts.retryAfterMs).toBe(7000);
  });

  it('trata 503 como saturación y 401 como problema de sesión', () => {
    expect(classifyGeminiError(503, {}).kind).toBe('overloaded');
    expect(classifyGeminiError(401, { error: { kind: 'auth', message: 'x' } }).kind).toBe('auth');
    expect(classifyGeminiError(400, {}).kind).toBe('bad-request');
  });
});

describe('esperas', () => {
  it('lee los formatos de Google y Retry-After', () => {
    expect(parseGoogleDelay('1.5s')).toBe(1500);
    expect(parseGoogleDelay(undefined)).toBeUndefined();
    expect(parseRetryAfter('3')).toBe(3000);
    expect(parseRetryAfter(null)).toBeUndefined();
  });

  it('respeta la espera pedida y si no, crece exponencialmente', () => {
    const cfg = { baseMs: 1000, maxWaitMs: 20000, random: () => 0 };
    expect(backoffMs(0, cfg)).toBe(1000);
    expect(backoffMs(2, cfg)).toBe(4000);
    expect(backoffMs(0, cfg, 2500)).toBe(2500);
    expect(backoffMs(10, cfg)).toBe(20000);
  });
});

describe('withRetry', () => {
  it('reintenta un 429 y acaba devolviendo el resultado', async () => {
    const sleep = vi.fn(async () => undefined);
    let n = 0;
    const out = await withRetry(
      async () => {
        if (n++ < 2) throw new AiError('rate', 'slow down');
        return 'ok';
      },
      { sleep, random: () => 0 },
    );
    expect(out).toBe('ok');
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('no reintenta una cuota diaria agotada (se pasa al siguiente modelo)', async () => {
    const sleep = vi.fn(async () => undefined);
    await expect(withRetry(async () => Promise.reject(new AiError('quota-day', 'x')), { sleep })).rejects.toMatchObject({ kind: 'quota-day' });
    expect(sleep).not.toHaveBeenCalled();
  });

  it('si el proveedor pide esperar demasiado, no espera', async () => {
    const sleep = vi.fn(async () => undefined);
    await expect(
      withRetry(async () => Promise.reject(new AiError('rate', 'x', { retryAfterMs: 60_000 })), { sleep, maxWaitMs: 20_000 }),
    ).rejects.toMatchObject({ kind: 'rate' });
    expect(sleep).not.toHaveBeenCalled();
  });
});
