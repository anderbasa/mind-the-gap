// Tu día en números (users/{uid}/days/{AAAA-MM-DD}): minutos de estudio activo, XP y si hiciste la sesión.
// De ahí salen la racha (con comodín semanal), la XP del día frente a tu objetivo y la gráfica de la semana.
import { signal } from '@preact/signals';
import { currentEstimate } from '../scoring/readiness';
import type { SkillScores } from '../scoring/estimate';
import { hasStore, settings, store } from '../state';
import { sharedAudio } from '../voice/audio';
import { isRecording } from '../voice/recorder';
import { SKILLS } from '../domain/skills';
import { CARD_XP_CAP, computeStreak, xpFor, type Activity, type DayDoc, type Streak } from './rules';

export const madridDay = (t = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(t);

export interface ProgressView {
  days: DayDoc[];
  today: DayDoc;
  streak: Streak;
  xpTotal: number;
}
export const progress = signal<ProgressView | null>(null);

export async function loadProgress(): Promise<ProgressView | null> {
  if (!hasStore()) return null;
  const s = store();
  const [days, meta] = await Promise.all([
    s.list<DayDoc>('days', { orderBy: 'date', desc: true, limit: 400 }).catch(() => [] as DayDoc[]),
    s.get<{ xpTotal?: number }>('meta/progress').catch(() => null),
  ]);
  const day = madridDay();
  const today = days.find((d) => d.date === day) ?? { date: day };
  const view: ProgressView = { days, today, streak: computeStreak(days, day), xpTotal: meta?.xpTotal ?? 0 };
  progress.value = view;
  return view;
}

/** Aplica un cambio del día de hoy a la vista local sin volver a leer de Firestore. */
function bumpLocal(patch: { activeSec?: number; xp?: number; xpCards?: number; skill?: string; sessionDone?: boolean }) {
  const v = progress.value;
  if (!v) return;
  const day = madridDay();
  const cur: DayDoc = v.today.date === day ? { ...v.today } : { date: day };
  cur.activeSec = (cur.activeSec ?? 0) + (patch.activeSec ?? 0);
  cur.xp = (cur.xp ?? 0) + (patch.xp ?? 0);
  cur.xpCards = (cur.xpCards ?? 0) + (patch.xpCards ?? 0);
  if (patch.skill && patch.xp) cur.xpBySkill = { ...(cur.xpBySkill ?? {}), [patch.skill]: (cur.xpBySkill?.[patch.skill as 'reading'] ?? 0) + patch.xp };
  if (patch.sessionDone) cur.sessionDone = true;
  const days = [cur, ...v.days.filter((d) => d.date !== day)];
  progress.value = { days, today: cur, streak: computeStreak(days, day), xpTotal: v.xpTotal + (patch.xp ?? 0) };
}

/* ── XP ───────────────────────────────────────────────────────── */

let scoresCache: { at: number; scores: SkillScores } | null = null;
async function scoresNow(): Promise<SkillScores> {
  if (scoresCache && Date.now() - scoresCache.at < 10 * 60_000) return scoresCache.scores;
  const { estimate } = await currentEstimate().catch(() => ({ estimate: { skills: {} } }) as never);
  const scores = Object.fromEntries(Object.entries(estimate.skills ?? {}).map(([k, v]) => [k, (v as { value: number }).value])) as SkillScores;
  scoresCache = { at: Date.now(), scores };
  return scores;
}

const WHY: Record<Activity['kind'], string> = {
  rue: 'Reading & Use of English',
  listening: 'Listening',
  dictation: 'dictado',
  writing: 'writing',
  speaking: 'speaking',
  rephrase: 'reformular',
  grammar: 'gramática',
  card: 'tarjeta',
  'error-practice': 'cuaderno de errores',
  series: 'escena de serie',
};

/** Lo llaman las pantallas al terminar algo. Nunca falla hacia fuera (la XP no debe romper nada). */
export async function recordActivity(a: Activity): Promise<number> {
  if (!hasStore()) return 0;
  try {
    if (!progress.value) await loadProgress();
    const scores = await scoresNow();
    let { xp, skill, mult } = xpFor(a, scores);
    if (a.kind === 'card') xp = Math.max(0, Math.min(xp, CARD_XP_CAP - (progress.value?.today.xpCards ?? 0)));
    if (!xp) return 0;
    const s = store();
    const day = madridDay();
    await s.set(
      `days/${day}`,
      { date: day, xp: s.inc(xp), xpBySkill: { [skill]: s.inc(xp) }, ...(a.kind === 'card' ? { xpCards: s.inc(xp) } : {}) },
      { merge: true },
    );
    await s.set('meta/progress', { xpTotal: s.inc(xp) }, { merge: true });
    bumpLocal({ xp, skill, ...(a.kind === 'card' ? { xpCards: xp } : {}) });
    if (a.kind !== 'card') {
      const what = a.kind === 'rue' && skill !== 'vocab' ? SKILLS[skill].label : WHY[a.kind];
      const why = mult > 1.05 ? `${what} · ×${mult.toFixed(2).replace('.', ',')} por ser tu punto débil` : what;
      void import('../ui/components').then((m) => m.toast(`+${xp} XP · ${why}`, 3200));
    }
    void import('./achievements').then((m) => m.scheduleCheck());
    return xp;
  } catch (e) {
    console.warn('[xp]', e);
    return 0;
  }
}

/** La sesión de hoy completa también hace que el día cuente para la racha. */
export async function markSessionDone(): Promise<void> {
  if (!hasStore()) return;
  const day = madridDay();
  await store()
    .set(`days/${day}`, { date: day, sessionDone: true }, { merge: true })
    .catch(() => undefined);
  bumpLocal({ sessionDone: true });
}

/* ── Tiempo de estudio activo ─────────────────────────────────── */

const TICK = 15; // segundos
const IDLE_MS = 120_000; // sin tocar nada 2 min (y sin audio ni micro) = no cuenta
let lastInput = Date.now();
let pending = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function mediaBusy(): boolean {
  try {
    if (isRecording()) return true;
    const a = sharedAudio();
    if (!a.paused && !a.ended) return true;
    return typeof speechSynthesis !== 'undefined' && speechSynthesis.speaking;
  } catch {
    return false;
  }
}

async function flush(): Promise<void> {
  if (!pending || !hasStore()) return;
  const sec = pending;
  pending = 0;
  const day = madridDay();
  try {
    const s = store();
    await s.set(`days/${day}`, { date: day, activeSec: s.inc(sec) }, { merge: true });
    bumpLocal({ activeSec: sec });
  } catch {
    pending += sec; // se reintenta en el siguiente
  }
}

export function startTracker(): void {
  if (timer || typeof window === 'undefined') return;
  const mark = () => (lastInput = Date.now());
  for (const ev of ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const) addEventListener(ev, mark, { passive: true, capture: true });
  timer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastInput < IDLE_MS || mediaBusy()) pending += TICK;
    if (pending >= 60) void flush();
  }, TICK * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
  addEventListener('pagehide', () => void flush());
}

/** Objetivo diario de XP (Ajustes). */
export const xpGoal = () => settings.value.xpDailyGoal;
