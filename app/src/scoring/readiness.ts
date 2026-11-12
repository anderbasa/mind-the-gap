// «¿Estoy listo?»: estimación actual con margen y tendencia, criterio configurable,
// aviso para reservar, cuenta atrás y calibración con los sample tests oficiales.
// Todo sale de users/{uid}/scores (diagnósticos, minis, simulacros y notas oficiales).
import type { Settings } from '../domain/settings';
import { SKILL_ORDER, type Skill } from '../domain/skills';
import { hasStore, store } from '../state';
import { type ScoreDoc } from './estimate';

const DAY = 86_400_000;
/** Cuánto pesa cada tipo de nota: un sample test oficial más que un simulacro, y este más que un mini. */
export const KIND_WEIGHT: Record<ScoreDoc['kind'], number> = { official: 3, mock: 2, diagnostic: 1.5, mini: 1 };
const HALF_LIFE_DAYS = 30; // una nota de hace un mes pesa la mitad
const WINDOW_DAYS = 120; // más antiguas no cuentan

export interface SkillEstimate {
  value: number;
  margin: number;
  n: number;
}
export interface Estimate {
  skills: Partial<Record<Skill, SkillEstimate>>;
  overall: number | null;
  margin: number;
  /** Las cinco destrezas tienen nota. */
  complete: boolean;
}

/** Estimación en el momento «at» con las notas anteriores (media ponderada por tipo y antigüedad). */
export function estimateAt(scores: ScoreDoc[], at: number): Estimate {
  const skills: Partial<Record<Skill, SkillEstimate>> = {};
  for (const k of SKILL_ORDER) {
    let w = 0;
    let sum = 0;
    const pts: [number, number][] = [];
    for (const s of scores) {
      const v = s.skills?.[k];
      if (typeof v !== 'number' || s.at > at) continue;
      const age = (at - s.at) / DAY;
      if (age > WINDOW_DAYS) continue;
      const wt = KIND_WEIGHT[s.kind] * 0.5 ** (age / HALF_LIFE_DAYS);
      w += wt;
      sum += wt * v;
      pts.push([v, wt]);
    }
    if (!w) continue;
    const mean = sum / w;
    const sd = Math.sqrt(pts.reduce((a, [v, wt]) => a + wt * (v - mean) ** 2, 0) / w);
    // Cambridge pide mirar ±3 cerca de un límite; con un único dato, ±5.
    skills[k] = { value: Math.round(mean), margin: Math.round(Math.max(pts.length === 1 ? 5 : 3, sd)), n: pts.length };
  }
  const list = Object.values(skills);
  const overall = list.length ? Math.round(list.reduce((a, s) => a + s.value, 0) / list.length) : null;
  const margin = list.length ? Math.max(3, Math.round(Math.sqrt(list.reduce((a, s) => a + s.margin ** 2, 0)) / list.length)) : 0;
  return { skills, overall, margin, complete: list.length === SKILL_ORDER.length };
}

/** Puntos por semana: estimación de hoy frente a la de hace 4 semanas. */
export function trendPerWeek(scores: ScoreDoc[], now: number): number | null {
  const a = estimateAt(scores, now - 28 * DAY).overall;
  const b = estimateAt(scores, now).overall;
  if (a == null || b == null) return null;
  if (!scores.some((s) => s.at > now - 28 * DAY)) return null; // nada nuevo en un mes
  return Math.round(((b - a) / 4) * 10) / 10;
}

/** Simulacros completos (los cinco papers) y sample tests oficiales completos, del más reciente al más antiguo. */
export function fullMocks(scores: ScoreDoc[]): ScoreDoc[] {
  return scores
    .filter((s) => (s.kind === 'mock' && (s.paper === 'full' || s.label === 'Simulacro completo')) || s.kind === 'official')
    .filter((s) => SKILL_ORDER.every((k) => typeof s.skills?.[k] === 'number'))
    .sort((a, b) => b.at - a.at);
}

export interface Check {
  label: string;
  ok: boolean;
  detail: string;
}
export interface Readiness {
  estimate: Estimate;
  trend: number | null;
  mocks: ScoreDoc[];
  checks: Check[];
  ready: boolean;
  /** Semanas hasta el objetivo al ritmo actual (null si no sube o no hay datos). */
  weeksToTarget: number | null;
  /** Momento de reservar: ya cumples o te faltan ≤10 semanas al ritmo actual. */
  bookNow: boolean;
}

export function readiness(scores: ScoreDoc[], crit: Settings['readiness'], now: number): Readiness {
  const estimate = estimateAt(scores, now);
  const trend = trendPerWeek(scores, now);
  const mocks = fullMocks(scores);
  const last = mocks.slice(0, crit.mocksNeeded);
  const enough = last.length >= crit.mocksNeeded;
  const minSkill = (m: ScoreDoc) => Math.min(...SKILL_ORDER.map((k) => m.skills[k] ?? 0));
  const checks: Check[] = [
    {
      label: `Global ≥ ${crit.globalMin} en tus últimos ${crit.mocksNeeded} simulacros completos`,
      ok: enough && last.every((m) => m.overall >= crit.globalMin),
      detail: last.length ? `${last.map((m) => m.overall).join(' · ')}${enough ? '' : ` (llevas ${last.length} de ${crit.mocksNeeded})`}` : 'Aún no has hecho ninguno',
    },
    {
      label: `Ninguna destreza por debajo de ${crit.skillMin} en esos simulacros`,
      ok: enough && last.every((m) => minSkill(m) >= crit.skillMin),
      detail: last.length ? `La más baja: ${last.map(minSkill).join(' · ')}` : '—',
    },
  ];
  const ready = checks.every((c) => c.ok);
  const gap = estimate.overall == null ? null : crit.globalMin - estimate.overall;
  const weeksToTarget = gap == null ? null : gap <= 0 ? 0 : trend && trend >= 0.3 ? Math.min(52, Math.ceil(gap / trend)) : null;
  return { estimate, trend, mocks, checks, ready, weeksToTarget, bookNow: ready || (weeksToTarget != null && weeksToTarget <= 10) };
}

/* ── Cuenta atrás ─────────────────────────────────────────────── */

export interface Countdown {
  days: number;
  weeks: number;
  phase: 'build' | 'sharpen' | 'final' | 'rest' | 'past';
  advice: string;
}

const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T12:00:00Z`) / DAY);
const madridIso = (t: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(t);

export function countdown(examDate: string, now: number): Countdown {
  const days = dayNumber(examDate) - dayNumber(madridIso(now));
  const weeks = Math.floor(days / 7);
  if (days < 0) return { days, weeks, phase: 'past', advice: 'La fecha ya ha pasado. Cuando tengas la nota, apúntala abajo como oficial y pon la siguiente fecha si la hay.' };
  if (days <= 2) return { days, weeks, phase: 'rest', advice: 'Nada nuevo: repasa tu banco de lenguaje y tus 5 errores top, prepara el DNI y duerme bien.' };
  if (days <= 14) return { days, weeks, phase: 'final', advice: 'Últimas dos semanas: un paper cronometrado al día, el cuaderno de errores y speaking en voz alta. Nada de temas nuevos.' };
  if (days <= 56) return { days, weeks, phase: 'sharpen', advice: 'Un simulacro completo cada 1–2 semanas y, entre medias, lo que más te baje la media.' };
  return { days, weeks, phase: 'build', advice: 'Aún hay margen para construir: sesiones normales y un simulacro completo cada 3–4 semanas para medirte.' };
}

/** Al ritmo actual, cuánto tendrías el día del examen (con el ritmo topado: no se sube para siempre). */
export function projectedAt(r: Readiness, days: number): number | null {
  if (r.estimate.overall == null || days < 0) return null;
  const perWeek = Math.max(-1, Math.min(2, r.trend ?? 0));
  return Math.min(210, Math.round(r.estimate.overall + (perWeek * days) / 7));
}

/* ── Calibración con sample tests oficiales ───────────────────── */

export interface Calibration {
  doc: ScoreDoc;
  app: number | null;
  diff: number | null;
}

/** Cada nota oficial frente a lo que estimaba la app justo antes (sin contar otras oficiales). */
export function calibration(scores: ScoreDoc[]): { rows: Calibration[]; mean: number | null } {
  const app = scores.filter((s) => s.kind !== 'official');
  const rows = scores
    .filter((s) => s.kind === 'official')
    .sort((a, b) => b.at - a.at)
    .map((doc) => {
      const e = estimateAt(app, doc.at - 1);
      // Compara solo las destrezas que tienen las dos.
      const ks = SKILL_ORDER.filter((k) => typeof doc.skills[k] === 'number' && e.skills[k]);
      if (!ks.length) return { doc, app: null, diff: null };
      const mine = Math.round(ks.reduce((a, k) => a + e.skills[k]!.value, 0) / ks.length);
      const theirs = Math.round(ks.reduce((a, k) => a + doc.skills[k]!, 0) / ks.length);
      return { doc, app: mine, diff: theirs - mine };
    });
  const diffs = rows.map((r) => r.diff).filter((d): d is number => d != null);
  return { rows, mean: diffs.length ? Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length) : null };
}

/* ── Datos ────────────────────────────────────────────────────── */

export async function loadScores(limit = 80): Promise<ScoreDoc[]> {
  if (!hasStore()) return [];
  return store()
    .list<ScoreDoc>('scores', { orderBy: 'at', desc: true, limit })
    .catch(() => []);
}

/** Estimación de ahora más la última medición «amplia» (para el aviso del mini mensual). */
export async function currentEstimate(): Promise<{ estimate: Estimate; scores: ScoreDoc[]; lastBroad: ScoreDoc | null }> {
  const scores = await loadScores();
  const lastBroad = scores.find((s) => Object.keys(s.skills ?? {}).length >= 4) ?? null;
  return { estimate: estimateAt(scores, Date.now()), scores, lastBroad };
}

export async function saveOfficial(doc: Omit<ScoreDoc, 'kind'>): Promise<void> {
  await store().set(`scores/official-${doc.at.toString(36)}`, { ...doc, kind: 'official' } as unknown as Record<string, unknown>);
}

export async function deleteOfficial(at: number): Promise<void> {
  await store().remove(`scores/official-${at.toString(36)}`);
}
