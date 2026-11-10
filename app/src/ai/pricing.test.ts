import { describe, expect, it } from 'vitest';
import { listCost, madridDay, priceFor, realCost } from './pricing';
import type { Usage } from './types';

const u = (inputTokens: number, outputTokens: number, extra: Partial<Usage> = {}): Usage => ({
  inputTokens,
  outputTokens,
  audioInputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  ...extra,
});

describe('precios', () => {
  it('aplica la subida de Gemini 3.8 Flash el 1-1-2027', () => {
    const ref = { provider: 'gemini' as const, model: 'gemini-3.8-flash' };
    expect(priceFor(ref, '2026-12-31')!.input).toBe(0.75);
    expect(priceFor(ref, '2027-01-01')!.input).toBe(1.5);
  });

  it('calcula el coste de Claude Sonnet 5.5 con caché', () => {
    const ref = { provider: 'claude' as const, model: 'claude-sonnet-5-5' };
    // 10k entrada (de ellos 8k leídos de caché) + 2k salida
    const cost = listCost(ref, u(10_000, 2_000, { cacheReadTokens: 8_000 }), '2026-11-10');
    expect(cost).toBeCloseTo((2_000 * 2 + 8_000 * 0.1 + 2_000 * 10) / 1e6, 8);
  });

  it('Gemini en capa gratuita cuesta 0 de verdad', () => {
    const ref = { provider: 'gemini' as const, model: 'gemini-3.5-flash-lite' };
    expect(realCost(ref, u(5000, 1000), '2026-11-10', 'free')).toBe(0);
    expect(realCost(ref, u(5000, 1000), '2026-11-10', 'paid')).toBeGreaterThan(0);
  });

  it('un modelo desconocido no rompe nada', () => {
    expect(listCost({ provider: 'gemini', model: 'nuevo' }, u(1, 1), '2026-11-10')).toBe(0);
  });

  it('el día se calcula en hora de Madrid', () => {
    // 23:30 UTC del 31-12 ya es 1-1 en Madrid (UTC+1 en invierno)
    expect(madridDay(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
  });
});
