// Respuestas abiertas fuera de la clave (P2, P3, P4): la IA decide si son alternativas válidas.
// El veredicto se guarda en caché por ítem y respuesta.
import { z } from 'zod';
import { runAI } from '../ai/client';
import { fill, getPrompt } from '../ai/prompts';
import { normalize, type SetResult } from './marking';
import type { RueSet } from './schema';

const Verdict = z.object({ marks: z.number().int().min(0).max(2), reason: z.string() });

/** La frase del texto que contiene el hueco n (con los demás huecos como ___). */
export function sentenceAround(text: string, n: number): string {
  const flat = text.replace(/\s*\n+\s*/g, ' ');
  const i = flat.indexOf(`{${n}}`);
  if (i < 0) return '';
  const before = flat.slice(0, i);
  const start = Math.max(before.lastIndexOf('. '), before.lastIndexOf('? '), before.lastIndexOf('! ')) + 1;
  const after = flat.slice(i);
  const m = /[.?!](\s|$)/.exec(after.slice(3));
  const end = m ? i + 3 + m.index + 1 : flat.length;
  return flat
    .slice(start, end)
    .trim()
    .replace(`{${n}}`, '[GAP]')
    .replace(/\{\d+\}/g, '___');
}

function describe(set: RueSet, n: number): { item: string; key: string } | null {
  switch (set.part) {
    case 'p2': {
      const it = set.items.find((x) => x.n === n)!;
      return { item: sentenceAround(set.text, n), key: it.answers.join(' / ') };
    }
    case 'p3': {
      const it = set.items.find((x) => x.n === n)!;
      return { item: `${sentenceAround(set.text, n)}   (stem word: ${it.base})`, key: it.answers.join(' / ') };
    }
    case 'p4': {
      const it = set.items.find((x) => x.n === n)!;
      return { item: `${it.first}\nKEY WORD: ${it.keyword}\n${it.before} [GAP] ${it.after}`, key: it.answers.join(' / ') };
    }
    default:
      return null;
  }
}

export async function reviewOpenAnswers(set: RueSet, result: SetResult): Promise<{ marks: Record<number, number>; reasons: Record<number, string>; failed: number }> {
  const marks: Record<number, number> = {};
  const reasons: Record<number, string> = {};
  let failed = 0;
  const partName = { p2: 'Part 2 (open cloze)', p3: 'Part 3 (word formation)', p4: 'Part 4 (key word transformation)' }[set.part as 'p2' | 'p3' | 'p4'];
  for (const r of result.items) {
    if (!r.needsReview || !r.given.trim()) continue;
    const d = describe(set, r.n);
    if (!d || !partName) continue;
    try {
      const v = await runAI({
        task: 'open-answer',
        system: fill(getPrompt('rue-open-check').body, { part: partName, item: d.item, key: d.key, answer: normalize(r.given) }),
        messages: [{ role: 'user', parts: [{ text: 'Return {"marks": number, "reason": "one sentence"}.' }] }],
        schema: Verdict,
        maxTokens: 400,
        cache: true,
      });
      marks[r.n] = Math.min(v.data!.marks, r.max);
      reasons[r.n] = v.data!.reason;
    } catch {
      failed++;
    }
  }
  return { marks, reasons, failed };
}
