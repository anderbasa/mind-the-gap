// Generador + validador de dos pasadas.
//  1) La IA escribe el ejercicio en JSON con el esquema de la parte.
//  2) Comprobaciones deterministas de formato (checks.ts).
//  3) Otro modelo lo resuelve a ciegas (partes de elegir) o revisa la clave (partes abiertas).
// Lo que no pasa se descarta; lo que pasa se guarda en Firestore y entra en el banco.
import { z } from 'zod';
import { runAI } from '../ai/client';
import { fill, getPrompt } from '../ai/prompts';
import { AiError } from '../ai/types';
import { hasStore, profile, store } from '../state';
import { allSets, getProgress, saveAiSet } from './bank';
import { checkSet } from './checks';
import { countWords, normalize } from './marking';
import { renderSet } from './render';
import { GEN_SCHEMAS, PART_ORDER_BY_PRIORITY, PARTS, parseSet, type PartId, type RueSet } from './schema';
import { pickTopic } from './topics';

export class GenerationError extends Error {
  constructor(
    public stage: 'format' | 'validation',
    public issues: string[],
  ) {
    super(`${stage === 'format' ? 'Formato' : 'Validación'}: ${issues.slice(0, 3).join(' ')}`);
    this.name = 'GenerationError';
  }
}

const ValidationSchema = z.object({
  items: z.array(
    z.object({
      n: z.number().int(),
      answer: z.string(),
      alternatives: z.array(z.string()),
      ambiguous: z.boolean(),
      keyOk: z.boolean(),
      note: z.string(),
    }),
  ),
  levelOk: z.boolean(),
  formatOk: z.boolean(),
  problems: z.array(z.string()),
});

const CHOICE_PARTS: PartId[] = ['p1', 'p5', 'p6', 'p7', 'p8'];

function reviewTask(part: PartId): string {
  if (CHOICE_PARTS.includes(part))
    return 'Answer every item yourself. There is NO key: work from the text only. Put the letter in `answer`. Set `ambiguous` to true if any other option could also be defended. Set `keyOk` to true and `alternatives` to [].';
  if (part === 'p4')
    return 'The key is included. For each item check that every answer in the key (a) keeps the meaning of the first sentence, (b) uses the key word unchanged, (c) has 3–6 words (contractions count as two). Set `keyOk` accordingly. Write your own best answer in `answer` and list in `alternatives` any other fully correct answers not in the key. Set `ambiguous` to false.';
  return 'The key is included. For each gap write the best answer yourself in `answer`, list in `alternatives` every other single word that is also fully correct (exact spelling), and set `keyOk` to false if any answer in the key is wrong. Set `ambiguous` to true only if the gap accepts so many words that it does not test anything.';
}

function studentContext(): string {
  const p = profile.value;
  if (!p) return '(no details)';
  return [p.interests && `Interests: ${p.interests}`, p.funDetails && `Fun personal details: ${p.funDetails}`, p.studies && `Studies: ${p.studies}`]
    .filter(Boolean)
    .join('\n');
}

const letterOf = (s: string) => /[A-G]/.exec(s.toUpperCase())?.[0] ?? '';
const uniq = (xs: string[]) => [...new Map(xs.map((x) => [normalize(x), x.trim()])).values()].filter(Boolean);
const oneWord = (w: string) => /^[a-z'-]+$/i.test(w.trim());

export async function validateSet(set: RueSet, signal?: AbortSignal): Promise<RueSet> {
  const choice = CHOICE_PARTS.includes(set.part);
  const r = await runAI({
    task: 'validate',
    system: fill(getPrompt('rue-validate').body, { task: reviewTask(set.part), exercise: renderSet(set, !choice) }),
    messages: [{ role: 'user', parts: [{ text: 'Review the exercise and return the JSON.' }] }],
    schema: ValidationSchema,
    maxTokens: 4096,
    signal,
  });
  const v = r.data!;
  const problems: string[] = [];
  if (!v.levelOk) problems.push('El revisor dice que el nivel no es C1.');
  if (!v.formatOk) problems.push('El revisor dice que no sigue el formato del examen.');

  const items = set.items.map((it) => {
    const rv = v.items.find((x) => x.n === it.n);
    if (!rv) {
      problems.push(`El revisor no ha contestado el ítem ${it.n}.`);
      return it;
    }
    if (choice) {
      const key = (it as { answer: string }).answer;
      if (letterOf(rv.answer) !== key) problems.push(`Ítem ${it.n}: el revisor elige ${letterOf(rv.answer) || '?'} y la clave dice ${key}.`);
      if (rv.ambiguous) problems.push(`Ítem ${it.n}: el revisor ve más de una respuesta defendible. ${rv.note}`);
      return it;
    }
    if (!rv.keyOk) problems.push(`Ítem ${it.n}: el revisor cree que la clave está mal. ${rv.note}`);
    if (rv.ambiguous) problems.push(`Ítem ${it.n}: hueco demasiado abierto. ${rv.note}`);
    const extra = [rv.answer, ...rv.alternatives];
    if (set.part === 'p4') {
      const k = it as { keyword: string; answers: string[] };
      const ok = extra.filter((a) => {
        const wc = countWords(a);
        return wc >= 3 && wc <= 6 && ` ${normalize(a)} `.includes(` ${normalize(k.keyword)} `);
      });
      return { ...it, answers: uniq([...k.answers, ...ok]) };
    }
    const k = it as { answers: string[] };
    return { ...it, answers: uniq([...k.answers, ...extra.filter(oneWord)]) };
  });

  if (problems.length) throw Object.assign(new GenerationError('validation', problems), { model: r.model.model });
  const out = parseSet({ ...set, items, validation: { by: r.model.model, at: Date.now(), notes: v.problems } });
  if (!out) throw new GenerationError('validation', ['El ejercicio validado no encaja con el esquema.']);
  return out;
}

/** Unifica las formas en que un modelo suele marcar los huecos: {{1}}, [1], (1)____ → {1}. */
export function normalizeGaps(text: string): string {
  return text
    .replace(/\{\{\s*(\d+)\s*\}\}/g, '{$1}')
    .replace(/\{\s+(\d+)\s+\}/g, '{$1}')
    .replace(/\(\s*(\d+)\s*\)\s*_{2,}/g, '{$1}')
    .replace(/_{2,}\s*\(\s*(\d+)\s*\)/g, '{$1}')
    .replace(/\[\s*(?:GAP\s*)?(\d+)\s*\]/gi, '{$1}');
}

/** Guarda por qué se ha descartado un ejercicio (users/{uid}/genlog) para poder afinar los prompts. */
async function logFailure(part: PartId, e: unknown, model?: string): Promise<void> {
  if (!hasStore()) return;
  const entry =
    e instanceof GenerationError
      ? { stage: e.stage, issues: e.issues.slice(0, 12) }
      : e instanceof AiError
        ? { stage: 'ai', kind: e.kind, issues: [e.message.slice(0, 400)] }
        : { stage: 'other', issues: [String((e as Error)?.message ?? e).slice(0, 400)] };
  await store()
    .add('genlog', { part, ...entry, model: model ?? null, at: Date.now() })
    .catch(() => undefined);
}

export async function generateSet(part: PartId, opts: { onStep?: (s: string) => void; signal?: AbortSignal } = {}): Promise<RueSet> {
  try {
    return await generateSetInner(part, opts);
  } catch (e) {
    if ((e as Error).name !== 'AbortError') await logFailure(part, e, (e as { model?: string }).model);
    throw e;
  }
}

async function generateSetInner(part: PartId, opts: { onStep?: (s: string) => void; signal?: AbortSignal }): Promise<RueSet> {
  const existing = await allSets(part);
  const topic = pickTopic(existing.slice(-12).map((s) => `${s.topic} ${s.title}`));
  const gen = getPrompt('rue-generate');
  const spec = getPrompt(`rue-${part}`);
  opts.onStep?.(`Escribiendo un ejercicio nuevo sobre «${topic}»…`);
  const r = await runAI({
    task: 'generate',
    system: fill(gen.body, { topic, student: studentContext(), part_spec: spec.body }),
    messages: [{ role: 'user', parts: [{ text: `Write one new, original ${PARTS[part].name} exercise about "${topic}". Return only the JSON.` }] }],
    schema: GEN_SCHEMAS[part] as unknown as z.ZodType<Record<string, unknown>>,
    maxTokens: 8192,
    signal: opts.signal,
  });
  const data = { ...(r.data as Record<string, unknown>) };
  if (typeof data.text === 'string') data.text = normalizeGaps(data.text);
  const set = parseSet({
    ...data,
    part,
    id: `${part}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    source: 'ai',
    createdAt: Date.now(),
    model: r.model.model,
    promptVersion: `${gen.version}+${spec.version}`,
  });
  if (!set) throw Object.assign(new GenerationError('format', ['El JSON no encaja con el esquema.']), { model: r.model.model });
  const issues = checkSet(set);
  if (issues.length) throw Object.assign(new GenerationError('format', issues), { model: r.model.model });
  opts.onStep?.('Otro modelo lo está resolviendo a ciegas para comprobarlo…');
  const ok = await validateSet(set, opts.signal);
  await saveAiSet(ok);
  return ok;
}

/** Errores de IA que no se arreglan reintentando ahora (cuota, tope, configuración, red). */
export const isStopper = (e: unknown) => e instanceof AiError && ['quota-day', 'budget', 'config', 'auth', 'network', 'unavailable'].includes(e.kind);

/** Rellena el banco hasta tener `target` ejercicios sin hacer por parte (por orden de prioridad). */
export async function topUp(
  target: number,
  opts: { onProgress: (msg: string) => void; signal?: AbortSignal; parts?: PartId[] },
): Promise<{ made: number; discarded: number; stoppedBy?: string }> {
  let made = 0;
  let discarded = 0;
  const progress = await getProgress();
  for (const part of opts.parts ?? PART_ORDER_BY_PRIORITY) {
    const sets = await allSets(part);
    let unseen = sets.filter((s) => !progress.seen[s.id] && !progress.reported[s.id]).length;
    let failures = 0;
    while (unseen < target && failures < 2) {
      if (opts.signal?.aborted) return { made, discarded, stoppedBy: 'Cancelado.' };
      opts.onProgress(`${PARTS[part].name}: preparando (${unseen}/${target})…`);
      try {
        await generateSet(part, { signal: opts.signal, onStep: (s) => opts.onProgress(`${PARTS[part].name}: ${s}`) });
        made++;
        unseen++;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return { made, discarded, stoppedBy: 'Cancelado.' };
        if (isStopper(e)) return { made, discarded, stoppedBy: (e as Error).message };
        discarded++;
        failures++;
        console.warn('[banco] descartado', e);
      }
    }
  }
  return { made, discarded };
}
