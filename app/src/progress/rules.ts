// Reglas de la racha y de la XP (funciones puras, con tests).
// Racha: un día cuenta con 10 min de estudio activo o con la sesión de hoy completa.
//        Un comodín por semana (lunes–domingo) protege automáticamente un día fallado.
// XP: más por lo que te cuesta (tu destreza más floja) y por lo difícil; menos por repetir lo fácil.
import type { Skill } from '../domain/skills';
import type { SkillScores } from '../scoring/estimate';

export const DAY_MIN_SEC = 600; // 10 minutos
export const CARD_XP_CAP = 20; // tope diario de XP por tarjetas: repasar es bueno, pero no lo único

export interface DayDoc {
  date: string; // AAAA-MM-DD (hora de Madrid)
  activeSec?: number;
  xp?: number;
  xpCards?: number;
  xpBySkill?: Partial<Record<Skill | 'vocab', number>>;
  sessionDone?: boolean;
}

export type Activity =
  | { kind: 'rue'; part: string; mode: 'exam' | 'practice' }
  | { kind: 'listening'; part: string; mode: 'exam' | 'practice' }
  | { kind: 'dictation' }
  | { kind: 'writing'; rewrite?: boolean }
  | { kind: 'speaking'; mode: 'mock' | 'part' | 'long-turn' | 'conversation' }
  | { kind: 'rephrase' }
  | { kind: 'grammar' }
  | { kind: 'card' }
  | { kind: 'error-practice' }
  | { kind: 'series' };

const READING = new Set(['p1', 'p5', 'p6', 'p7', 'p8']);

export function skillOf(a: Activity): Skill | 'vocab' {
  switch (a.kind) {
    case 'rue':
      return READING.has(a.part) ? 'reading' : 'uoe';
    case 'listening':
    case 'dictation':
    case 'series':
      return 'listening';
    case 'writing':
    case 'rephrase':
      return 'writing';
    case 'speaking':
      return 'speaking';
    case 'grammar':
    case 'error-practice':
      return 'uoe';
    case 'card':
      return 'vocab';
  }
}

/** XP base: refleja el esfuerzo. Las partes más difíciles (P4, P7, Listening P3…) valen más. */
const RUE_BASE: Record<string, number> = { p1: 8, p2: 8, p3: 10, p4: 12, p5: 12, p6: 10, p7: 12, p8: 10 };
const LISTENING_BASE: Record<string, number> = { l1: 8, l2: 10, l3: 12, l4: 10 };
const SPEAKING_BASE = { mock: 50, part: 14, 'long-turn': 10, conversation: 20 } as const;

export function baseXp(a: Activity): number {
  switch (a.kind) {
    case 'rue':
      return (RUE_BASE[a.part] ?? 10) * (a.mode === 'exam' ? 1.2 : 1);
    case 'listening':
      return (LISTENING_BASE[a.part] ?? 10) * (a.mode === 'exam' ? 1.2 : 1);
    case 'dictation':
      return 3;
    case 'writing':
      return a.rewrite ? 20 : 40;
    case 'speaking':
      return SPEAKING_BASE[a.mode];
    case 'rephrase':
      return 4;
    case 'grammar':
      return 4;
    case 'card':
      return 1;
    case 'error-practice':
      return 5;
    case 'series':
      return 15;
  }
}

/** Multiplicador por debilidad: ×1,75 si la destreza va floja (≤165), ×1 en 180, ×0,75 desde 185. */
export function weakness(score: number | undefined): number {
  if (score == null) return 1;
  return Math.max(0.75, Math.min(1.75, 1 + (180 - score) / 20));
}

export function xpFor(a: Activity, scores: SkillScores): { xp: number; skill: Skill | 'vocab'; mult: number } {
  const skill = skillOf(a);
  const mult = skill === 'vocab' ? 1 : weakness(scores[skill]);
  return { xp: Math.max(1, Math.round(baseXp(a) * mult)), skill, mult };
}

/* ── Racha ────────────────────────────────────────────────────── */

const DAY = 86_400_000;
// Mediodía UTC para que nunca caiga en otro día; floor (no round: 12:00 es medio día y redondearía al siguiente).
const toNum = (iso: string) => Math.floor(Date.parse(`${iso}T12:00:00Z`) / DAY);
const toIso = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
export const shiftDay = (iso: string, n: number) => toIso(toNum(iso) + n);
/** Lunes de la semana de ese día. */
export function mondayOf(iso: string): string {
  const n = toNum(iso);
  const dow = (new Date(n * DAY).getUTCDay() + 6) % 7; // 0 = lunes
  return toIso(n - dow);
}

export const dayCounts = (d: DayDoc | undefined) => !!d && ((d.activeSec ?? 0) >= DAY_MIN_SEC || !!d.sessionDone);

export interface Streak {
  current: number;
  best: number;
  todayDone: boolean;
  /** Minutos de estudio de hoy. */
  todayMin: number;
  /** El comodín de esta semana sigue libre (si hoy fallas, te cubre). */
  wildcardFree: boolean;
  /** Días protegidos por el comodín dentro de la racha actual. */
  protectedDays: string[];
  /** Racha en peligro: hoy aún no cuenta y el comodín de esta semana ya está gastado. */
  atRisk: boolean;
}

export function computeStreak(days: DayDoc[], today: string): Streak {
  const by = new Map(days.map((d) => [d.date, d]));
  const counts = (iso: string) => dayCounts(by.get(iso));
  const todayDone = counts(today);

  // Hacia atrás desde hoy (si hoy aún no cuenta, no rompe: el día no ha terminado).
  let current = 0;
  const used = new Set<string>();
  const protectedDays: string[] = [];
  const first = days.length ? days.map((d) => d.date).sort()[0] : today;
  let d = todayDone ? today : shiftDay(today, -1);
  while (d >= first) {
    if (counts(d)) {
      current++;
    } else {
      const w = mondayOf(d);
      if (!used.has(w) && counts(shiftDay(d, -1))) {
        used.add(w);
        protectedDays.push(d);
      } else break;
    }
    d = shiftDay(d, -1);
  }

  // Mejor racha: hacia delante por todo el historial, con las mismas reglas.
  let best = 0;
  let run = 0;
  const usedF = new Set<string>();
  for (let n = toNum(first); n <= toNum(today); n++) {
    const iso = toIso(n);
    if (counts(iso)) {
      run++;
      best = Math.max(best, run);
    } else if (iso === today) {
      // hoy aún puede contar
    } else if (run > 0 && !usedF.has(mondayOf(iso)) && counts(shiftDay(iso, 1))) {
      usedF.add(mondayOf(iso));
    } else run = 0;
  }
  best = Math.max(best, current);

  const wildcardFree = !used.has(mondayOf(today));
  return {
    current,
    best,
    todayDone,
    todayMin: Math.floor((by.get(today)?.activeSec ?? 0) / 60),
    wildcardFree,
    protectedDays,
    atRisk: !todayDone && current > 0 && !wildcardFree,
  };
}
