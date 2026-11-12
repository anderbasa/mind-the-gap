// Datos para el plan del día (lo que has hecho y cuándo, notas, errores…), la sesión guardada
// (users/{uid}/sessions/{día}) y la detección automática de tareas hechas.
import { BLOCKS, getRun, nextPart, partRoute } from '../diagnostic/run';
import { currentEstimate } from '../scoring/readiness';
import type { Skill } from '../domain/skills';
import { getPatterns } from '../errors/notebook';
import { LESSONS } from '../grammar/lessons';
import { getGrammarProgress } from '../grammar/practice';
import { listCards, todaysQueue } from '../srs/srs';
import { store } from '../state';
import type { CheckIn, PlannerState, PlanTask } from './plan';

const READING_PARTS = new Set(['p1', 'p5', 'p6', 'p7', 'p8']);
const skillOfRue = (part?: string): Skill => (part && READING_PARTS.has(part) ? 'reading' : 'uoe');

export const madridDay = (t = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(t);

type Row = Record<string, unknown> & { id: string };

export async function gatherState(): Promise<PlannerState> {
  const s = store();
  const [cur, attempts, writings, speakings, errors, cards, gprog, patterns, meta, run] = await Promise.all([
    currentEstimate().catch(() => null),
    s.list<Record<string, unknown>>('attempts', { orderBy: 'at', desc: true, limit: 200 }).catch(() => [] as Row[]),
    s.list<Record<string, unknown>>('writings', { orderBy: 'createdAt', desc: true, limit: 20 }).catch(() => [] as Row[]),
    s.list<Record<string, unknown>>('speakings', { orderBy: 'at', desc: true, limit: 20 }).catch(() => [] as Row[]),
    s.list<Record<string, unknown>>('errors', { orderBy: 'at', desc: true, limit: 200 }).catch(() => [] as Row[]),
    listCards().catch(() => []),
    getGrammarProgress().catch(() => ({})),
    getPatterns().catch(() => null),
    s.get<{ pendingSpeaking?: boolean }>('meta/session').catch(() => null),
    getRun().catch(() => null),
  ]);

  const last: Partial<Record<Skill, number>> = {};
  const bump = (k: Skill, t: unknown) => {
    const n = Number(t);
    if (n && (!last[k] || n > last[k]!)) last[k] = n;
  };
  for (const a of attempts) {
    if (a.kind === 'rue') bump(skillOfRue(a.part as string), a.at);
    else if (a.kind === 'listening' || a.kind === 'dictation') bump('listening', a.at);
    else if (a.kind === 'rephrase') bump('writing', a.at);
  }
  for (const w of writings) bump('writing', w.createdAt);
  for (const sp of speakings) bump('speaking', sp.at);

  const since = Date.now() - 14 * 86_400_000;
  const recent: Partial<Record<Skill, number>> = {};
  for (const e of errors) {
    if (Number(e.at) < since) continue;
    const k: Skill =
      e.kind === 'rue' ? skillOfRue(e.part as string) : e.kind === 'listening' ? 'listening' : e.kind === 'speaking' ? 'speaking' : 'writing';
    recent[k] = (recent[k] ?? 0) + 1;
  }

  // Nota por destreza: la estimación combinada (diagnóstico, simulacros, oficiales).
  const scores = Object.fromEntries(Object.entries(cur?.estimate.skills ?? {}).map(([k, v]) => [k, v.value])) as PlannerState['scores'];
  const score = cur && cur.scores.some((x) => x.kind !== 'mock' || x.paper === 'full') ? cur : null;
  const q = todaysQueue(cards);
  const next = LESSONS.find((l) => !(gprog as Record<string, { done?: boolean }>)[l.id]?.done);
  const np = run && !run.finishedAt ? nextPart(run) : null;
  const lastActivity = Math.max(0, ...Object.values(last).map(Number), ...cards.map((c) => c.fsrs.last_review ?? 0)) || null;

  return {
    scores,
    lastBySkill: last,
    recentErrors: recent,
    dueCards: q.due.length + q.fresh.length,
    nextGrammar: next ? { id: next.id, title: next.title } : null,
    patterns: patterns ? patterns.patterns.filter((p) => p.count >= 3).length : 0,
    pendingSpeaking: !!meta?.pendingSpeaking,
    lastActivity,
    hasDiagnostic: !!score,
    diagnosticNext: score ? null : np ? { label: np.label, route: partRoute(np), minutes: BLOCKS.find((b) => b.id === np.block)?.minutes ?? 15 } : { label: 'empezar', route: '/diagnostico', minutes: 15 },
  };
}

/* ── Sesión guardada ─────────────────────────────────────────── */

export interface SessionDoc {
  date: string;
  checkin: CheckIn;
  tasks: PlanTask[];
  greeting: string;
  startedAt: number;
}

export async function getToday(): Promise<SessionDoc | null> {
  return store().get<SessionDoc>(`sessions/${madridDay()}`);
}

export async function saveToday(doc: SessionDoc): Promise<void> {
  await store().set(`sessions/${doc.date}`, JSON.parse(JSON.stringify(doc)) as Record<string, unknown>);
  const active = doc.tasks.filter((t) => !t.postponed);
  // Sesión completa = el día cuenta para la racha aunque no llegues a 10 minutos.
  if (active.length && active.every((t) => t.done)) void import('../progress/progress').then((m) => m.markSessionDone());
  const postponed = doc.tasks.some((t) => t.postponed);
  if (postponed) await store().set('meta/session', { pendingSpeaking: true }, { merge: true });
}

/** Marca como hechas las tareas que ya se ven en tu actividad desde que empezó la sesión. */
export async function detectDone(doc: SessionDoc): Promise<SessionDoc> {
  const s = store();
  const t0 = doc.startedAt;
  const [attempts, writings, speakings, cards, gprog, run] = await Promise.all([
    s.list<Record<string, unknown>>('attempts', { orderBy: 'at', desc: true, limit: 80 }).catch(() => [] as Row[]),
    s.list<Record<string, unknown>>('writings', { orderBy: 'createdAt', desc: true, limit: 5 }).catch(() => [] as Row[]),
    s.list<Record<string, unknown>>('speakings', { orderBy: 'at', desc: true, limit: 5 }).catch(() => [] as Row[]),
    listCards().catch(() => []),
    getGrammarProgress().catch(() => ({}) as Record<string, { at: number }>),
    getRun().catch(() => null),
  ]);
  const newer = (t: unknown) => Number(t) > t0;
  const att = attempts.filter((a) => newer(a.at));
  let spoke = false;
  const tasks = doc.tasks.map((t) => {
    if (t.done || t.postponed) return t;
    let done = false;
    switch (t.kind) {
      case 'rue':
        done = att.some((a) => a.kind === 'rue' && a.part === t.part);
        break;
      case 'listening':
        done = att.some((a) => a.kind === 'listening' && a.part === t.part);
        break;
      case 'dictation':
        done = att.filter((a) => a.kind === 'dictation').length >= 3;
        break;
      case 'rephrase':
        done = att.filter((a) => a.kind === 'rephrase').length >= 3;
        break;
      case 'errors':
        done = att.filter((a) => a.kind === 'error-practice').length >= 3;
        break;
      case 'writing':
        done = writings.some((w) => newer(w.createdAt));
        break;
      case 'speaking':
        done = speakings.some((x) => newer(x.at));
        spoke = spoke || done;
        break;
      case 'grammar':
        done = Object.values(gprog as Record<string, { at: number }>).some((g) => newer(g.at));
        break;
      case 'vocab':
        done = cards.filter((c) => newer(c.fsrs.last_review)).length >= 5;
        break;
      case 'diagnostic':
        done = !!run?.parts.some((p) => p.done && newer(p.at));
        break;
    }
    return done ? { ...t, done: true } : t;
  });
  const next = { ...doc, tasks };
  if (tasks.some((t, i) => t.done !== doc.tasks[i].done)) await saveToday(next).catch(() => undefined);
  if (spoke) await store().set('meta/session', { pendingSpeaking: false }, { merge: true }).catch(() => undefined);
  return next;
}
