// Escenas de series: pegas un trozo de subtítulos de algo que hayas visto (la app no descarga nada)
// y Theo monta una lección: de qué va, vocabulario coloquial, gramática, huecos por niveles,
// frases para reformular y preguntas corregidas. Lo que te falte va a tu vocabulario (FSRS).
import { z } from 'zod';
import { runAI } from '../ai/client';
import { fill, getPrompt } from '../ai/prompts';
import { gapCorrect } from '../listening/marking';
import { store } from '../state';

export const MIN_CHARS = 250;
export const MAX_CHARS = 3500;

/** Quita números de línea, tiempos (SRT/VTT), etiquetas y repeticiones; deja una línea por frase. */
export function cleanSubtitles(raw: string): string {
  const lines = raw
    .replace(/\r/g, '')
    .replace(/^WEBVTT.*$/m, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^\d+$/.test(l) && !/^\d{1,2}:\d{2}(:\d{2})?[.,]\d{1,3}\s*-->/.test(l) && !/^(NOTE|STYLE|REGION)\b/.test(l))
    .map((l) =>
      l
        .replace(/<[^>]+>/g, '')
        .replace(/\{\\[^}]*\}/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
  // Las líneas partidas por el subtitulado se unen salvo que empiecen por guion (cambio de personaje).
  const out: string[] = [];
  for (const l of lines) {
    const prev = out[out.length - 1];
    if (prev && !/^[-–]/.test(l) && !/[.!?…"”)\]]$/.test(prev)) out[out.length - 1] = `${prev} ${l}`;
    else out.push(l);
  }
  return out.join('\n');
}

/* ── Lección ──────────────────────────────────────────────────── */

export const SeriesLessonSchema = z.object({
  title: z.string(),
  summary: z.string(),
  summaryEs: z.string(),
  register: z.string(),
  vocab: z
    .array(
      z.object({
        term: z.string(),
        type: z.enum(['word', 'phrasal verb', 'idiom', 'collocation', 'slang', 'discourse marker', 'expression']),
        level: z.enum(['B2', 'C1', 'C2']),
        meaning: z.string(),
        es: z.string(),
        quote: z.string(),
      }),
    )
    .min(3)
    .max(16),
  grammar: z.array(z.object({ point: z.string(), quote: z.string(), es: z.string() })).max(6),
  gaps: z
    .array(z.object({ word: z.string(), occurrence: z.number().int().min(1), level: z.number().int().min(1).max(3), hint: z.string() }))
    .min(3)
    .max(24),
  rephrase: z.array(z.object({ quote: z.string(), instruction: z.string(), model: z.array(z.string()) })).max(5),
  questions: z.array(z.object({ q: z.string(), answer: z.string() })).max(5),
});
export type SeriesLesson = z.infer<typeof SeriesLessonSchema>;

export const SeriesCheckSchema = z.object({
  rephrase: z.array(z.object({ ok: z.boolean(), corrected: z.string(), comment: z.string() })),
  questions: z.array(z.object({ ok: z.boolean(), comment: z.string() })),
});
export type SeriesCheck = z.infer<typeof SeriesCheckSchema>;

export interface SeriesDoc {
  show?: string;
  text: string;
  lesson: SeriesLesson;
  model?: string;
  createdAt: number;
  gapScore?: { level: number; ok: number; total: number };
  check?: SeriesCheck;
  answers?: { rephrase: string[]; questions: string[] };
  xp?: boolean;
}

export async function makeLesson(text: string, show: string): Promise<{ id: string; doc: SeriesDoc }> {
  const r = await runAI({
    task: 'series',
    system: fill(getPrompt('series-lesson').body, { text, show: show.trim() || '(not given)' }),
    messages: [{ role: 'user', parts: [{ text: 'Build the lesson. Return only the JSON.' }] }],
    schema: SeriesLessonSchema,
    maxTokens: 6000,
    thinking: 'low',
    timeoutMs: 90_000,
  });
  const doc: SeriesDoc = { ...(show.trim() ? { show: show.trim() } : {}), text, lesson: r.data!, model: r.model.model, createdAt: Date.now() };
  const id = await store().add('series', JSON.parse(JSON.stringify(doc)) as Record<string, unknown>);
  return { id, doc };
}

export async function checkAnswers(lesson: SeriesLesson, answers: { rephrase: string[]; questions: string[] }): Promise<SeriesCheck> {
  const reph = lesson.rephrase.map((x, i) => `${i} · "${x.quote}" · ${x.instruction} · models: ${x.model.join(' / ')} · student: "${answers.rephrase[i]?.trim() || '(blank)'}"`).join('\n');
  const qs = lesson.questions.map((x, i) => `${i} · ${x.q} · model: ${x.answer} · student: "${answers.questions[i]?.trim() || '(blank)'}"`).join('\n');
  const r = await runAI({
    task: 'series',
    system: fill(getPrompt('series-check').body, { summary: lesson.summary, rephrase: reph || '(none)', questions: qs || '(none)' }),
    messages: [{ role: 'user', parts: [{ text: 'Check my answers. Return only the JSON.' }] }],
    schema: SeriesCheckSchema,
    maxTokens: 1500,
    thinking: 'low',
    timeoutMs: 60_000,
  });
  return r.data!;
}

export async function getSeries(id: string): Promise<SeriesDoc | null> {
  return store().get<SeriesDoc>(`series/${id}`);
}
export async function listSeries(limit = 20): Promise<(SeriesDoc & { id: string })[]> {
  return store()
    .list<SeriesDoc>('series', { orderBy: 'createdAt', desc: true, limit })
    .catch(() => []);
}
export async function patchSeries(id: string, patch: Partial<SeriesDoc>): Promise<void> {
  await store().set(`series/${id}`, JSON.parse(JSON.stringify(patch)) as Record<string, unknown>, { merge: true });
}

/* ── Huecos ───────────────────────────────────────────────────── */

export type Segment = { t: 'text'; s: string } | { t: 'gap'; i: number; word: string; hint: string; level: number };

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Parte el texto en trozos y huecos para un nivel (1: solo los fáciles; 3: todos). Ignora los que no encuentra. */
export function placeGaps(text: string, gaps: SeriesLesson['gaps'], level: number): Segment[] {
  const spans: { start: number; end: number; i: number; g: SeriesLesson['gaps'][number] }[] = [];
  gaps.forEach((g, i) => {
    if (g.level > level || !g.word.trim()) return;
    const re = new RegExp(`(?<![A-Za-z'])${esc(g.word.trim())}(?![A-Za-z'])`, 'g');
    let m: RegExpExecArray | null;
    let n = 0;
    while ((m = re.exec(text))) {
      n++;
      if (n === g.occurrence) {
        spans.push({ start: m.index, end: m.index + m[0].length, i, g });
        break;
      }
    }
  });
  spans.sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let pos = 0;
  for (const sp of spans) {
    if (sp.start < pos) continue; // se solapa con otro hueco
    if (sp.start > pos) out.push({ t: 'text', s: text.slice(pos, sp.start) });
    out.push({ t: 'gap', i: sp.i, word: text.slice(sp.start, sp.end), hint: sp.g.hint, level: sp.g.level });
    pos = sp.end;
  }
  if (pos < text.length) out.push({ t: 'text', s: text.slice(pos) });
  return out;
}

export function markGaps(segs: Segment[], given: Record<number, string>): { ok: number; total: number; wrong: { word: string; hint: string }[] } {
  const gaps = segs.filter((s): s is Extract<Segment, { t: 'gap' }> => s.t === 'gap');
  const wrong = gaps.filter((g) => !gapCorrect(given[g.i] ?? '', [g.word])).map((g) => ({ word: g.word, hint: g.hint }));
  return { ok: gaps.length - wrong.length, total: gaps.length, wrong };
}

/* ── Al vocabulario ───────────────────────────────────────────── */

/** Tarjeta de hueco con la frase de la escena (o de significado si la frase no la contiene). */
export function cardFor(v: { term: string; meaning: string; es?: string; quote?: string }, show?: string) {
  const quote = (v.quote ?? '').replace(/^[-–]\s*/, '').trim(); // sin el guion de cambio de personaje
  const re = new RegExp(`(?<![A-Za-z'])${esc(v.term)}(?![A-Za-z'])`, 'i');
  const inQuote = quote && re.test(quote);
  return inQuote
    ? { type: 'gap' as const, term: v.term, front: quote.replace(re, '_____'), answer: quote.match(re)![0], back: v.meaning, ...(v.es ? { es: v.es } : {}), hint: show ? `De «${show}»` : 'De una escena de serie', say: quote, source: 'series' as const }
    : { type: 'meaning' as const, term: v.term, front: v.term, back: v.meaning, ...(v.es ? { es: v.es } : {}), say: v.term, source: 'series' as const };
}
