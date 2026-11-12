// Notas estimadas en la escala Cambridge, con las tablas oficiales de C1 Advanced
// («Converting practice test scores to Cambridge English Scale scores», UCLES):
//   Reading 43/32/23/17 de 50 · Use of English 23/16/11/8 de 28 · Writing 34/24/16/10 de 40
//   Listening 26/18/13/11 de 30 · Speaking 66/45/30/17 de 75  →  200 / 180 / 160 / 142.
// Cambridge avisa: son orientativas, y cerca de un límite hay que mirar ±3 puntos.
import type { Skill } from '../domain/skills';

export const MAX_MARKS: Record<Skill, number> = { reading: 50, uoe: 28, writing: 40, listening: 30, speaking: 75 };

/** [puntos brutos, escala] por destreza (tabla oficial; por encima de 200 y por debajo de 142, extrapolado). */
const TABLES: Record<Skill, [number, number][]> = {
  reading: [[0, 110], [17, 142], [23, 160], [32, 180], [43, 200], [50, 210]],
  uoe: [[0, 110], [8, 142], [11, 160], [16, 180], [23, 200], [28, 210]],
  writing: [[0, 110], [10, 142], [16, 160], [24, 180], [34, 200], [40, 210]],
  listening: [[0, 110], [11, 142], [13, 160], [18, 180], [26, 200], [30, 210]],
  speaking: [[0, 110], [17, 142], [30, 160], [45, 180], [66, 200], [75, 210]],
};

/** Puntos brutos sobre el máximo oficial de esa destreza → escala. */
export function rawToScale(skill: Skill, raw: number): number {
  const t = TABLES[skill];
  const r = Math.max(0, Math.min(t[t.length - 1][0], raw));
  for (let i = 1; i < t.length; i++) {
    const [x0, y0] = t[i - 1];
    const [x1, y1] = t[i];
    if (r <= x1) return Math.round(y0 + ((r - x0) / (x1 - x0)) * (y1 - y0));
  }
  return 210;
}

/** Aciertos parciales (p. ej. dos partes de un paper) → se escalan al máximo oficial y se convierten. */
export function pctToScale(pct: number, skill: Skill = 'reading'): number {
  return rawToScale(skill, (Math.max(0, Math.min(100, pct)) / 100) * MAX_MARKS[skill]);
}

/** Lo que muestra la app: por debajo de 142 Cambridge no da nota. */
export const scaleText = (s: number) => (s < 142 ? '<142' : String(s));

export type SkillScores = Partial<Record<Skill, number>>;

/** La global de Cambridge es la media de las cinco notas (solo con las que haya). */
export function overallOf(s: SkillScores): number | null {
  const vals = Object.values(s).filter((x): x is number => typeof x === 'number');
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
}

export interface ScoreDoc {
  kind: 'diagnostic' | 'mini' | 'mock' | 'official';
  skills: SkillScores;
  overall: number;
  at: number;
  label?: string;
  /** Simulacros: qué paper ('full' = los cuatro). */
  paper?: string;
}
