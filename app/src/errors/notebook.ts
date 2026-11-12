// Cuaderno de errores: todos tus errores (ejercicios, writings, speakings…), agrupados en patrones
// por la IA (Gemini, gratis). Al tercer error del mismo tipo, es un patrón; con ellos se practican
// frases dirigidas y se crean tarjetas.
import { z } from 'zod';
import { runAI } from '../ai/client';
import { fill, getPrompt } from '../ai/prompts';
import { store } from '../state';

export interface ErrorRow {
  id: string;
  kind: string;
  category?: string;
  focus?: string;
  part?: string;
  yourAnswer?: string;
  correct?: string;
  explanation?: string;
  at: number;
}

export const KIND_ES: Record<string, string> = {
  rue: 'Reading & Use of English',
  listening: 'Listening',
  writing: 'Writing',
  speaking: 'Speaking',
  rephrase: 'Reformular',
  'say-it-better': 'Dímelo mejor',
};

export async function listErrors(limit = 300): Promise<ErrorRow[]> {
  return store().list<Omit<ErrorRow, 'id'>>('errors', { orderBy: 'at', desc: true, limit });
}

export const PatternSchema = z.object({
  patterns: z.array(
    z.object({
      name: z.string(),
      rule: z.string(),
      category: z.string(),
      errorIds: z.array(z.string()),
      examples: z.array(z.object({ wrong: z.string(), right: z.string() })).max(3),
    }),
  ),
});
export type Pattern = z.infer<typeof PatternSchema>['patterns'][number] & { count: number };

export interface PatternsDoc {
  patterns: Pattern[];
  at: number;
  basedOn: number;
}

const clip = (s: string | undefined, n: number) => (s ?? '').replace(/\s+/g, ' ').slice(0, n);

export async function analysePatterns(errors: ErrorRow[]): Promise<PatternsDoc> {
  const list = errors
    .slice(0, 200)
    .map((e) => `${e.id} [${e.kind}${e.category ? `/${e.category}` : ''}${e.focus ? `/${clip(e.focus, 30)}` : ''}] "${clip(e.yourAnswer, 80)}" → "${clip(e.correct, 80)}"${e.explanation ? ` (${clip(e.explanation, 90)})` : ''}`)
    .join('\n');
  const r = await runAI({
    task: 'error-patterns',
    system: fill(getPrompt('error-patterns').body, { errors: list || '(none)' }),
    messages: [{ role: 'user', parts: [{ text: 'Group my errors. Return only the JSON.' }] }],
    schema: PatternSchema,
    maxTokens: 6000,
    thinking: 'low',
    timeoutMs: 120_000,
    retries: 1,
  });
  const ids = new Set(errors.map((e) => e.id));
  const patterns = r.data!.patterns
    .map((p) => ({ ...p, errorIds: p.errorIds.filter((x) => ids.has(x)) }))
    .map((p) => ({ ...p, count: p.errorIds.length }))
    .filter((p) => p.count >= 2)
    .sort((a, b) => b.count - a.count);
  const doc: PatternsDoc = { patterns, at: Date.now(), basedOn: errors.length };
  await store().set('meta/errorPatterns', JSON.parse(JSON.stringify(doc)) as Record<string, unknown>);
  return doc;
}

export async function getPatterns(): Promise<PatternsDoc | null> {
  return store().get<PatternsDoc>('meta/errorPatterns');
}

/** Tus 5 errores top: los patrones con más repeticiones (de 3 en adelante, o los mayores si aún no hay). */
export function topFive(doc: PatternsDoc | null): Pattern[] {
  if (!doc) return [];
  const real = doc.patterns.filter((p) => p.count >= 3);
  return (real.length ? real : doc.patterns).slice(0, 5);
}

/* ── Práctica dirigida ────────────────────────────────────────── */

export const PracticeSchema = z.object({
  items: z.array(z.object({ wrong: z.string(), right: z.string(), accepted: z.array(z.string()), why: z.string() })).min(3).max(6),
});
export type PracticeItem = z.infer<typeof PracticeSchema>['items'][number];

/** Cinco frases nuevas con ese error para que las corrijas (Gemini, gratis; nunca de pago). */
export async function practiceFor(p: Pattern): Promise<PracticeItem[]> {
  const r = await runAI({
    task: 'generate',
    system: fill(getPrompt('error-practice').body, { name: p.name, rule: p.rule, examples: p.examples.map((e) => `"${e.wrong}" → "${e.right}"`).join('\n') }),
    messages: [{ role: 'user', parts: [{ text: 'Return only the JSON.' }] }],
    schema: PracticeSchema,
    maxTokens: 2000,
    thinking: 'low',
    timeoutMs: 60_000,
    retries: 1,
    allowPaid: false,
  });
  return r.data!.items;
}
