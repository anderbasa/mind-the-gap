// Writings guardados (users/{uid}/writings/{id}) y su corrección en segundo plano:
// si sales de la pantalla mientras Theo corrige, la corrección sigue y te avisa al acabar.
import { signal } from '@preact/signals';
import { aiErrorMessage, runAI } from '../ai/client';
import { buildSystem } from '../ai/prompts';
import { AiError } from '../ai/types';
import { claudeSpentThisMonth } from '../ai/usage';
import { profile, settings, store } from '../state';
import { toast } from '../ui/components';
import { analyse, analysisForPrompt, countWords, habitualWords } from './analysis';
import { estimateScale, FeedbackSchema, total, type Feedback } from './schema';
import { getTask, taskAsText, type WritingType } from './tasks';

export interface WritingVersion {
  text: string;
  words: number;
  source: 'typed' | 'photo';
  at: number;
  feedback?: Feedback;
  /** Suma de los 4 criterios, sobre 20. */
  raw?: number;
  scale?: number;
  model?: string;
  paid?: boolean;
  correctedAt?: number;
}

export interface WritingDoc {
  taskId: string;
  part: 1 | 2;
  type: WritingType;
  title: string;
  plan?: string;
  /** Minutos que tardaste, si usaste el cronómetro. */
  minutes?: number;
  versions: WritingVersion[];
  createdAt: number;
  updatedAt: number;
}

export type WritingRow = WritingDoc & { id: string };

/** Firestore no acepta `undefined`: se quitan antes de guardar. */
const clean = <T>(o: T): T => JSON.parse(JSON.stringify(o));

export async function listWritings(limit = 50): Promise<WritingRow[]> {
  return store().list<WritingDoc>('writings', { orderBy: 'createdAt', desc: true, limit });
}

export async function createWriting(input: { taskId: string; text: string; source: 'typed' | 'photo'; plan?: string; minutes?: number }): Promise<string> {
  const task = getTask(input.taskId);
  if (!task) throw new Error('Enunciado desconocido');
  const now = Date.now();
  const doc: WritingDoc = {
    taskId: task.id,
    part: task.part,
    type: task.type,
    title: task.title,
    ...(input.plan?.trim() ? { plan: input.plan.trim() } : {}),
    ...(input.minutes ? { minutes: input.minutes } : {}),
    versions: [{ text: input.text.trim(), words: countWords(input.text), source: input.source, at: now }],
    createdAt: now,
    updatedAt: now,
  };
  return store().add('writings', clean(doc) as unknown as Record<string, unknown>);
}

export async function addVersion(id: string, text: string, source: 'typed' | 'photo'): Promise<void> {
  const doc = await store().get<WritingDoc>(`writings/${id}`);
  if (!doc) throw new Error('No encuentro ese writing');
  const versions = [...doc.versions, { text: text.trim(), words: countWords(text), source, at: Date.now() }];
  await store().set(`writings/${id}`, clean({ versions, updatedAt: Date.now() }), { merge: true });
}

/* ── Corrección ─────────────────────────────────────────────────── */

export interface CorrectJob {
  startedAt: number;
  paid: boolean;
  error?: string;
}

export const correcting = signal<Record<string, CorrectJob>>({});

function setJob(id: string, job: CorrectJob | null) {
  const next = { ...correcting.value };
  if (job) next[id] = job;
  else delete next[id];
  correcting.value = next;
}

/** Lo que cuesta, más o menos, una corrección con Claude Sonnet (entrada ~5k tokens, salida ~8k). */
export const EST_CLAUDE_CORRECTION_USD = 0.1;

/** Pide confirmación antes de gastar saldo. Devuelve false si no quieres o si no queda tope. */
export async function confirmPaidCorrection(): Promise<boolean> {
  const cfg = settings.value;
  const spent = await claudeSpentThisMonth().catch(() => 0);
  if (spent + EST_CLAUDE_CORRECTION_USD > cfg.claudeMonthlyCapUsd) {
    alert(`Con esta corrección pasarías tu tope mensual de Claude (${cfg.claudeMonthlyCapUsd} $; llevas ${spent.toFixed(2)} $). Corrige gratis con Gemini o sube el tope en Ajustes.`);
    return false;
  }
  return confirm(
    `Esta corrección usará Claude y costará unos ${EST_CLAUDE_CORRECTION_USD.toFixed(2).replace('.', ',')} $ de tu saldo.\n\nEste mes llevas ${spent.toFixed(2).replace('.', ',')} $ de ${cfg.claudeMonthlyCapUsd} $. ¿Seguir?`,
  );
}

async function previousTexts(excludeId: string): Promise<string[]> {
  const rows = await listWritings(8);
  return rows
    .filter((r) => r.id !== excludeId)
    .slice(0, 6)
    .map((r) => r.versions[r.versions.length - 1]?.text ?? '')
    .filter(Boolean);
}

function previousFeedback(doc: WritingDoc, vIdx: number): string {
  const prev = vIdx > 0 ? doc.versions[vIdx - 1] : undefined;
  if (!prev?.feedback) return '';
  const f = prev.feedback;
  return [
    `THIS IS A REWRITE (version ${vIdx + 1}). Feedback given on version ${vIdx}:`,
    `Scores then: content ${f.scores.content}, communicative ${f.scores.communicative}, organisation ${f.scores.organisation}, language ${f.scores.language}.`,
    `Main errors then: ${f.topErrors.map((e) => `"${e.quote}" → "${e.correction}"`).join('; ') || 'none'}.`,
    'Mark this version on its own merits, then mention in the summary what improved and what did not.',
  ].join('\n');
}

async function correct(id: string, paid: boolean): Promise<WritingDoc> {
  const doc = await store().get<WritingDoc>(`writings/${id}`);
  if (!doc) throw new Error('No encuentro ese writing');
  const task = getTask(doc.taskId);
  if (!task) throw new Error('Enunciado desconocido');
  const vIdx = doc.versions.length - 1;
  const v = doc.versions[vIdx];
  const prev = await previousTexts(id).catch(() => [] as string[]);
  const analysis = analysisForPrompt(analyse(v.text), habitualWords(prev, v.text));
  const system = buildSystem({ profile: profile.value! }, 'writing-correct', {
    task: taskAsText(task),
    plan: doc.plan || '(no plan)',
    analysis,
    previous: previousFeedback(doc, vIdx),
    version: String(vIdx + 1),
    text: v.text,
  });
  const r = await runAI({
    task: 'correct-writing',
    system,
    messages: [{ role: 'user', parts: [{ text: 'Here is my writing. Mark it and correct it, please. Return only the JSON.' }] }],
    schema: FeedbackSchema,
    maxTokens: 16000,
    thinking: 'low',
    effort: 'medium',
    timeoutMs: 180_000,
    retries: 1,
    allowPaid: paid, // solo si has elegido «con Claude» y lo has confirmado
  });
  const fb = r.data!;
  const raw = total(fb.scores);
  const versions = doc.versions.map((x, i) =>
    i === vIdx ? { ...x, feedback: fb, raw, scale: estimateScale(raw), model: r.model.model, paid: r.model.provider === 'claude', correctedAt: Date.now() } : x,
  );
  await store().set(`writings/${id}`, clean({ versions, updatedAt: Date.now() }), { merge: true });

  // Todos los errores van al cuaderno de errores.
  for (const e of [...fb.topErrors, ...fb.otherErrors]) {
    void store()
      .add('errors', {
        kind: 'writing',
        writingId: id,
        version: vIdx + 1,
        category: e.category,
        yourAnswer: e.quote,
        correct: e.correction,
        explanation: e.why,
        example: e.example,
        at: Date.now(),
      })
      .catch(() => undefined);
  }
  return { ...doc, versions };
}

/** Empieza a corregir la última versión. Sigue aunque cambies de pantalla. */
export function startCorrection(id: string, paid: boolean): void {
  const cur = correcting.value[id];
  if (cur && !cur.error) return;
  setJob(id, { startedAt: Date.now(), paid });
  correct(id, paid)
    .then((doc) => {
      setJob(id, null);
      if (!location.hash.includes(id)) toast(`Corrección lista: «${doc.title}»`, 4500);
    })
    .catch((e) => {
      console.warn('[writing]', e);
      const msg = e instanceof AiError ? aiErrorMessage(e) : (e as Error).message || 'No se ha podido corregir.';
      setJob(id, { startedAt: Date.now(), paid, error: msg });
    });
}

export function clearCorrectionError(id: string): void {
  if (correcting.value[id]?.error) setJob(id, null);
}

/* ── Vocabulario adoptado ───────────────────────────────────────── */

export async function adoptWord(term: string, context: string, writingId: string): Promise<void> {
  await store().add('vocab', { term, context, source: { kind: 'writing', writingId }, state: 'new', createdAt: Date.now() });
}
