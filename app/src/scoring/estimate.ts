// Notas estimadas en la escala Cambridge (orientativas hasta calibrarlas en la Fase 7).
import type { Skill } from '../domain/skills';

/**
 * Porcentaje de aciertos → escala. Anclas del documento oficial de conversión del Reading
 * (43/50 → 200, 32/50 → 180, 23/50 → 160, es decir 86 %, 64 % y 46 %). Se usan también para
 * Use of English y Listening hasta verificar sus tablas propias.
 */
const PCT: [number, number][] = [
  [0, 120],
  [46, 160],
  [64, 180],
  [86, 200],
  [100, 210],
];

export function pctToScale(pct: number): number {
  const p = Math.max(0, Math.min(100, pct));
  for (let i = 1; i < PCT.length; i++) {
    const [x0, y0] = PCT[i - 1];
    const [x1, y1] = PCT[i];
    if (p <= x1) return Math.round(y0 + ((p - x0) / (x1 - x0)) * (y1 - y0));
  }
  return 210;
}

export type SkillScores = Partial<Record<Skill, number>>;

/** La global de Cambridge es la media de las cinco notas (solo con las que haya). */
export function overallOf(s: SkillScores): number | null {
  const vals = Object.values(s).filter((x): x is number => typeof x === 'number');
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
}

export interface ScoreDoc {
  kind: 'diagnostic' | 'mini';
  skills: SkillScores;
  overall: number;
  at: number;
}
