import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../domain/settings';
import type { ScoreDoc } from './estimate';
import { calibration, countdown, estimateAt, fullMocks, projectedAt, readiness, trendPerWeek } from './readiness';

const NOW = new Date('2026-11-12T10:00:00Z').getTime();
const DAY = 86_400_000;
const all = (v: number) => ({ reading: v, uoe: v, writing: v, listening: v, speaking: v });
const crit = DEFAULT_SETTINGS.readiness;

const mock = (daysAgo: number, skills: ScoreDoc['skills'], kind: ScoreDoc['kind'] = 'mock'): ScoreDoc => {
  const vals = Object.values(skills) as number[];
  return { kind, skills, overall: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length), at: NOW - daysAgo * DAY, ...(kind === 'mock' ? { paper: 'full' } : {}) };
};

describe('estimación con margen', () => {
  it('pondera por tipo y antigüedad; un solo dato da ±5', () => {
    const one = estimateAt([mock(1, { reading: 180 })], NOW);
    expect(one.skills.reading).toEqual({ value: 180, margin: 5, n: 1 });
    expect(one.complete).toBe(false);
    // Un oficial reciente (×3) pesa más que un mini viejo (×1, 60 días → ×0,25).
    const e = estimateAt([mock(60, all(160), 'mini'), mock(2, all(190), 'official')], NOW);
    expect(e.skills.uoe!.value).toBeGreaterThan(187);
    expect(e.complete).toBe(true);
    expect(e.margin).toBeGreaterThanOrEqual(3);
  });

  it('las notas de hace más de 4 meses no cuentan', () => {
    expect(estimateAt([mock(130, all(170))], NOW).overall).toBeNull();
  });

  it('tendencia: sube si las notas nuevas son mejores', () => {
    const s = [mock(50, all(170), 'diagnostic'), mock(35, all(172)), mock(3, all(180))];
    expect(trendPerWeek(s, NOW)).toBeGreaterThan(0.5);
    expect(trendPerWeek([mock(50, all(170))], NOW)).toBeNull();
  });
});

describe('criterio de «listo»', () => {
  it('pide los 2 últimos simulacros completos ≥185 y ninguna destreza <170', () => {
    const ok = readiness([mock(3, all(188)), mock(12, all(186))], crit, NOW);
    expect(ok.ready).toBe(true);
    expect(ok.bookNow).toBe(true);

    const oneLow = readiness([mock(3, { ...all(192), speaking: 166 }), mock(12, all(188))], crit, NOW);
    expect(oneLow.checks[0].ok).toBe(true);
    expect(oneLow.checks[1].ok).toBe(false);
    expect(oneLow.ready).toBe(false);

    const onlyOne = readiness([mock(3, all(190))], crit, NOW);
    expect(onlyOne.ready).toBe(false);
    expect(onlyOne.checks[0].detail).toContain('llevas 1 de 2');
  });

  it('un simulacro de un solo paper no cuenta como completo; un oficial completo sí', () => {
    const partial: ScoreDoc = { kind: 'mock', paper: 'speaking', skills: { speaking: 190 }, overall: 190, at: NOW - DAY };
    expect(fullMocks([partial])).toHaveLength(0);
    expect(fullMocks([mock(5, all(186), 'official')])).toHaveLength(1);
  });

  it('aviso de reservar cuando al ritmo actual faltan ≤10 semanas', () => {
    const rising = [mock(40, all(172), 'diagnostic'), mock(25, all(176)), mock(2, all(181))];
    const r = readiness(rising, crit, NOW);
    expect(r.ready).toBe(false);
    expect(r.weeksToTarget).not.toBeNull();
    expect(r.weeksToTarget!).toBeLessThanOrEqual(10);
    expect(r.bookNow).toBe(true);
    const flat = readiness([mock(40, all(166), 'diagnostic'), mock(2, all(166))], crit, NOW);
    expect(flat.bookNow).toBe(false);
  });
});

describe('cuenta atrás', () => {
  it('días que faltan (hora de Madrid) y consejo por tramo', () => {
    expect(countdown('2026-11-12', NOW)).toMatchObject({ days: 0, phase: 'rest' });
    expect(countdown('2026-11-22', NOW)).toMatchObject({ days: 10, phase: 'final' });
    expect(countdown('2026-12-24', NOW)).toMatchObject({ days: 42, phase: 'sharpen' });
    expect(countdown('2027-03-06', NOW).phase).toBe('build');
    expect(countdown('2026-11-01', NOW).phase).toBe('past');
  });

  it('proyección al día del examen con el ritmo topado', () => {
    const r = readiness([mock(40, all(160), 'diagnostic'), mock(2, all(180))], crit, NOW);
    const p = projectedAt(r, 70)!;
    expect(p).toBeLessThanOrEqual(r.estimate.overall! + 20); // como mucho +2/semana
    expect(p).toBeGreaterThan(r.estimate.overall!);
  });
});

describe('calibración con sample tests oficiales', () => {
  it('compara la nota oficial con lo que estimaba la app justo antes', () => {
    const s = [mock(20, all(176)), mock(5, all(181), 'official')];
    const c = calibration(s);
    expect(c.rows[0].app).toBe(176);
    expect(c.rows[0].diff).toBe(5);
    expect(c.mean).toBe(5);
  });
});
