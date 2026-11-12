// Práctica de gramática: corrección de producción libre (Gemini, gratis), progreso por punto
// (se da por dominado con 4 de las 5 últimas bien) y explicación alternativa.
import { z } from 'zod';
import { runAI } from '../ai/client';
import { fill, getPrompt } from '../ai/prompts';
import { store } from '../state';
import type { Lesson } from './lessons';

export const GrammarCheck = z.object({ ok: z.boolean(), minor: z.boolean(), corrected: z.string(), comment: z.string() });
export type GrammarResult = z.infer<typeof GrammarCheck>;

export async function checkGrammar(l: Lesson, task: string, answer: string): Promise<GrammarResult> {
  const r = await runAI({
    task: 'grammar',
    system: fill(getPrompt('grammar-check').body, { point: l.title, rule: l.es, task, answer: answer.trim() }),
    messages: [{ role: 'user', parts: [{ text: 'Check my answer. Return only the JSON.' }] }],
    schema: GrammarCheck,
    maxTokens: 600,
    thinking: 'low',
    timeoutMs: 45_000,
    cache: true,
  });
  return r.data!;
}

export async function explainAgain(l: Lesson): Promise<string> {
  const r = await runAI({
    task: 'explain-es',
    messages: [{ role: 'user', parts: [{ text: fill(getPrompt('grammar-explain').body, { point: l.title, es: l.es, examples: l.examples.join(' | ') }) }] }],
    maxTokens: 700,
    cache: true,
  });
  return r.text.trim();
}

export interface GrammarProgress {
  results: boolean[];
  done: boolean;
  at: number;
}

export const isMastered = (results: boolean[]) => results.length >= 5 && results.slice(-5).filter(Boolean).length >= 4;

export async function getGrammarProgress(): Promise<Record<string, GrammarProgress>> {
  const rows = await store()
    .list<GrammarProgress>('grammar', { limit: 100 })
    .catch(() => []);
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}

export async function recordGrammar(id: string, ok: boolean, prev?: GrammarProgress): Promise<GrammarProgress> {
  const results = [...(prev?.results ?? []), ok].slice(-10);
  const next: GrammarProgress = { results, done: (prev?.done ?? false) || isMastered(results), at: Date.now() };
  await store().set(`grammar/${id}`, next as unknown as Record<string, unknown>);
  return next;
}
