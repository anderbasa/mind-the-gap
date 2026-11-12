// Memoria de Theo: notas sobre ti (users/{uid}/tutorNotes/current) que lee antes de cada
// conversación, corrección o lección. Se actualizan tras el diagnóstico, cada writing y cada speaking.
import { signal } from '@preact/signals';
import { z } from 'zod';
import { runAI } from '../ai/client';
import { fill, getPrompt, setDefaultTutorNotes } from '../ai/prompts';
import { IS_DEMO } from '../config';
import { hasStore, store } from '../state';

export const NotesSchema = z.object({
  summary: z.string(),
  strengths: z.array(z.string()).max(5),
  weaknesses: z.array(z.string()).max(5),
  patterns: z.array(z.string()).max(8),
  nextChallenge: z.string(),
  levelGuess: z.string(),
});
export type NotesData = z.infer<typeof NotesSchema>;

export interface TutorNotes extends NotesData {
  text: string;
  updatedAt: number;
  event: string;
}

export const tutorNotes = signal<TutorNotes | null>(null);

/** El texto que se añade al prompt de Theo. */
export function notesText(n: NotesData): string {
  return [
    n.summary,
    n.levelGuess && `Level estimate: ${n.levelGuess}.`,
    n.strengths.length && `Strengths: ${n.strengths.join('; ')}.`,
    n.weaknesses.length && `Weaknesses: ${n.weaknesses.join('; ')}.`,
    n.patterns.length && `Recurring errors: ${n.patterns.join('; ')}.`,
    n.nextChallenge && `Pending mini-challenge: ${n.nextChallenge}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Se llama desde el estado global cuando cambia el documento. */
export function onNotesDoc(v: TutorNotes | null): void {
  tutorNotes.value = v;
  setDefaultTutorNotes(v?.text ?? '');
}

const short = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Resumen de tu actividad reciente para que Theo actualice sus notas. */
async function recentActivity(): Promise<string> {
  const s = store();
  const [attempts, writings, speakings, errors, scores] = await Promise.all([
    s.list<Record<string, unknown>>('attempts', { orderBy: 'at', desc: true, limit: 25 }).catch(() => []),
    s.list<Record<string, unknown>>('writings', { orderBy: 'createdAt', desc: true, limit: 4 }).catch(() => []),
    s.list<Record<string, unknown>>('speakings', { orderBy: 'at', desc: true, limit: 4 }).catch(() => []),
    s.list<Record<string, unknown>>('errors', { orderBy: 'at', desc: true, limit: 40 }).catch(() => []),
    s.list<Record<string, unknown>>('scores', { orderBy: 'at', desc: true, limit: 2 }).catch(() => []),
  ]);
  const lines: string[] = [];
  for (const sc of scores) lines.push(`Score estimate (${sc.kind}): ${JSON.stringify(sc.skills)} overall ${sc.overall}`);
  for (const a of attempts) {
    if (a.kind === 'rue' || a.kind === 'listening') lines.push(`${a.kind} ${a.part} (${a.mode}): ${a.marks}/${a.max}`);
    else if (a.kind === 'rephrase') lines.push(`rephrase ${a.topic}: ${(a.verdicts as string[] | undefined)?.join(',')}`);
    else if (a.kind === 'dictation') lines.push(`dictation: ${a.correct}/${a.total} words`);
  }
  for (const w of writings) {
    const v = (w.versions as { raw?: number; feedback?: { summary: string; topErrors: { quote: string; correction: string }[] } }[] | undefined)?.at(-1);
    if (v?.feedback) lines.push(`Writing "${w.title}": ${v.raw}/20. ${short(v.feedback.summary)} Top errors: ${v.feedback.topErrors.map((e) => `${e.quote}→${e.correction}`).join('; ')}`);
  }
  for (const sp of speakings) {
    const a = sp.assessment as { summary: string; nextFocus: string; c1Resources: { resource: string }[] } | undefined;
    if (a) lines.push(`Speaking "${sp.title}": ≈${sp.scale}. ${short(a.summary)} Next focus: ${a.nextFocus}. C1 used: ${a.c1Resources.map((r) => r.resource).join(', ') || 'none'}`);
  }
  const errs = errors.map((e) => `[${e.kind}${e.category ? `/${e.category}` : ''}] ${short(String(e.yourAnswer ?? ''), 60)} → ${short(String(e.correct ?? ''), 60)}`);
  if (errs.length) lines.push(`Recent errors:\n${errs.join('\n')}`);
  return lines.join('\n') || '(no activity yet)';
}

let running = false;

/**
 * Actualiza las notas (Gemini, gratis). Sin prisa: como mucho una vez cada 10 minutos,
 * salvo tras el diagnóstico.
 */
export async function updateTutorNotes(event: string, opts: { force?: boolean } = {}): Promise<TutorNotes | null> {
  if (!hasStore() || IS_DEMO || running) return null;
  const cur = tutorNotes.value;
  if (!opts.force && cur && Date.now() - cur.updatedAt < 10 * 60_000) return cur;
  running = true;
  try {
    const r = await runAI({
      task: 'tutor-notes',
      system: fill(getPrompt('tutor-notes').body, { event, current: cur?.text || '(none yet — first notes)', activity: await recentActivity() }),
      messages: [{ role: 'user', parts: [{ text: 'Update your notes. Return only the JSON.' }] }],
      schema: NotesSchema,
      maxTokens: 2500,
      thinking: 'low',
      timeoutMs: 90_000,
      retries: 1,
    });
    const data = r.data!;
    const doc: TutorNotes = { ...data, text: notesText(data), updatedAt: Date.now(), event };
    await store().set('tutorNotes/current', doc as unknown as Record<string, unknown>);
    void store()
      .add('tutorNotesHistory', { ...doc })
      .catch(() => undefined);
    return doc;
  } catch (e) {
    console.warn('[notas de Theo]', e);
    return null;
  } finally {
    running = false;
  }
}
