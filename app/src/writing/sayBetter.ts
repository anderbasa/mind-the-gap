// «Dímelo mejor»: pegas una frase tuya y Theo la corrige y te da tres versiones.
import { z } from 'zod';
import { runAI } from '../ai/client';
import { fill, getPrompt } from '../ai/prompts';
import { store } from '../state';

export const SayBetterSchema = z.object({
  hadErrors: z.boolean(),
  corrected: z.string(),
  errors: z
    .array(
      z.object({
        quote: z.string(),
        correction: z.string(),
        why: z.string(),
        category: z.enum(['grammar', 'vocabulary', 'collocation', 'preposition', 'article', 'tense', 'word order', 'register', 'spelling', 'punctuation']),
      }),
    )
    .max(12),
  register: z.enum(['formal', 'neutral', 'informal']),
  neutral: z.string(),
  formal: z.string(),
  natural: z.string(),
  tip: z.string(),
});
export type SayBetter = z.infer<typeof SayBetterSchema>;

export interface SayBetterRow {
  id: string;
  text: string;
  context: string;
  result: SayBetter;
  at: number;
}

export async function sayItBetter(text: string, context: string): Promise<SayBetter> {
  const r = await runAI({
    task: 'rephrase',
    system: fill(getPrompt('say-it-better').body, { text: text.trim(), context: context.trim() || '(not given)' }),
    messages: [{ role: 'user', parts: [{ text: 'Say it better. Return only the JSON.' }] }],
    schema: SayBetterSchema,
    maxTokens: 2500,
    thinking: 'low',
    timeoutMs: 60_000,
    cache: true,
  });
  const result = r.data!;
  await store()
    .add('sayItBetter', { text: text.trim(), context: context.trim(), result, at: Date.now() })
    .catch(() => undefined);
  for (const e of result.errors) {
    void store()
      .add('errors', { kind: 'say-it-better', category: e.category, yourAnswer: e.quote, correct: e.correction, explanation: e.why, at: Date.now() })
      .catch(() => undefined);
  }
  return result;
}

export async function recentSayBetter(n = 8): Promise<SayBetterRow[]> {
  return store().list<Omit<SayBetterRow, 'id'>>('sayItBetter', { orderBy: 'at', desc: true, limit: n });
}
