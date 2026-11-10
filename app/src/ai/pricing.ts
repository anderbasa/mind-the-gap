// Precios por millón de tokens (USD), con fecha de entrada en vigor.
// Fuente: páginas oficiales de precios de Google AI Studio y Anthropic (consultadas el 10-11-2026).
// Gemini sube 3.8 Flash y 3.8 Flash TTS el 1-1-2027.
import type { ModelRef, Usage } from './types';

export interface Price {
  from: string; // YYYY-MM-DD
  input: number;
  output: number;
  audioInput?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export const PRICES: Record<string, Price[]> = {
  'gemini:gemini-3.8-flash': [
    { from: '2026-01-01', input: 0.75, output: 3.75 },
    { from: '2027-01-01', input: 1.5, output: 7.5 },
  ],
  'gemini:gemini-3.6-flash': [{ from: '2026-01-01', input: 0.75, output: 3.75 }],
  'gemini:gemini-3.5-flash-lite': [{ from: '2026-01-01', input: 0.3, output: 2.5, audioInput: 0.3 }],
  'gemini:gemini-3.1-flash-lite': [{ from: '2026-01-01', input: 0.25, output: 1.5, audioInput: 0.5 }],
  'gemini:gemini-3.8-flash-tts': [
    { from: '2026-01-01', input: 0.5, output: 9 },
    { from: '2027-01-01', input: 1, output: 18 },
  ],
  'gemini:gemini-3.8-flash-lite-tts': [{ from: '2026-01-01', input: 0.5, output: 6 }],
  'gemini:gemini-3.8-live': [{ from: '2026-01-01', input: 0.75, output: 4.5, audioInput: 3 }],
  'claude:claude-sonnet-5-5': [{ from: '2026-01-01', input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 }],
  'claude:claude-haiku-5-5': [{ from: '2026-01-01', input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 }],
};

export function priceFor(ref: ModelRef, day: string): Price | null {
  const list = PRICES[`${ref.provider}:${ref.model}`];
  if (!list) return null;
  let found: Price | null = null;
  for (const p of list) if (p.from <= day) found = p;
  return found;
}

/** Coste en USD de una llamada según la tarifa de pago (aunque se haya usado la capa gratuita). */
export function listCost(ref: ModelRef, u: Usage, day: string): number {
  const p = priceFor(ref, day);
  if (!p) return 0;
  const textIn = Math.max(0, u.inputTokens - u.audioInputTokens - u.cacheReadTokens - u.cacheWriteTokens);
  const cost =
    textIn * p.input +
    u.audioInputTokens * (p.audioInput ?? p.input) +
    u.cacheReadTokens * (p.cacheRead ?? p.input) +
    u.cacheWriteTokens * (p.cacheWrite ?? p.input) +
    u.outputTokens * p.output;
  return cost / 1_000_000;
}

/** Lo que de verdad se paga: Gemini en capa gratuita = 0. */
export function realCost(ref: ModelRef, u: Usage, day: string, geminiTier: 'free' | 'paid'): number {
  if (ref.provider === 'gemini' && geminiTier === 'free') return 0;
  return listCost(ref, u, day);
}

/** Día en hora de Madrid, YYYY-MM-DD. */
export function madridDay(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function formatUsd(n: number): string {
  if (n === 0) return '0 $';
  if (n < 0.01) return '< 0,01 $';
  return `${n.toFixed(2).replace('.', ',')} $`;
}
