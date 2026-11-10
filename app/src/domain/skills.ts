// Las cinco notas del C1 Advanced y sus «líneas» de color.
export type Skill = 'reading' | 'uoe' | 'writing' | 'listening' | 'speaking';

export const SKILLS: Record<Skill, { label: string; short: string; color: string }> = {
  reading: { label: 'Reading', short: 'Reading', color: 'var(--line-reading)' },
  uoe: { label: 'Use of English', short: 'Use of Eng.', color: 'var(--line-uoe)' },
  writing: { label: 'Writing', short: 'Writing', color: 'var(--line-writing)' },
  listening: { label: 'Listening', short: 'Listening', color: 'var(--line-listening)' },
  speaking: { label: 'Speaking', short: 'Speaking', color: 'var(--line-speaking)' },
};

export const SKILL_ORDER: Skill[] = ['reading', 'uoe', 'writing', 'listening', 'speaking'];

/** Escala Cambridge del C1 Advanced (verificada en noviembre de 2026). */
export const SCALE = {
  min: 142,
  max: 210,
  b2: 160,
  c1: 180,
  gradeB: 193,
  gradeA: 200,
  safeTarget: 185,
} as const;

export function gradeFor(score: number): string {
  if (score >= SCALE.gradeA) return 'Grade A · C2';
  if (score >= SCALE.gradeB) return 'Grade B · C1';
  if (score >= SCALE.c1) return 'Grade C · C1';
  if (score >= SCALE.b2) return 'Nivel B2';
  return 'Por debajo de B2';
}
