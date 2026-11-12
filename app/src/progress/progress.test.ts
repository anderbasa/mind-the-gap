import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../domain/settings';
import { estimateAt } from '../scoring/readiness';
import type { ScoreDoc } from '../scoring/estimate';
import { DEFS, evaluate, type Ctx } from './achievements';
import { computeStreak, mondayOf, shiftDay, weakness, xpFor, type DayDoc } from './rules';

const TODAY = '2026-11-12'; // jueves
const day = (offset: number, min: number, extra: Partial<DayDoc> = {}): DayDoc => ({ date: shiftDay(TODAY, offset), activeSec: min * 60, ...extra });

describe('racha', () => {
  it('cuenta con 10 minutos o con la sesión completa; hoy sin hacer no rompe', () => {
    const s = computeStreak([day(-1, 12), day(-2, 3, { sessionDone: true }), day(-3, 15)], TODAY);
    expect(s.current).toBe(3);
    expect(s.todayDone).toBe(false);
    const done = computeStreak([day(0, 10), day(-1, 12)], TODAY);
    expect(done.current).toBe(2);
    expect(done.todayDone).toBe(true);
  });

  it('el comodín semanal protege un día fallado (y solo uno por semana)', () => {
    // martes fallado, protegido; el resto de la semana bien
    const s = computeStreak([day(-1, 20), day(-2, 0), day(-3, 20), day(-4, 20)], TODAY);
    expect(s.protectedDays).toEqual([shiftDay(TODAY, -2)]);
    expect(s.current).toBe(3);
    expect(s.wildcardFree).toBe(false);
    expect(s.atRisk).toBe(true); // hoy aún no cuenta y no queda comodín
    // dos fallos en la misma semana: se corta
    const two = computeStreak([day(-1, 20), day(-2, 0), day(-3, 0), day(-4, 20)], TODAY);
    expect(two.current).toBe(1);
  });

  it('mejor racha a lo largo del historial', () => {
    const hist = [...Array.from({ length: 9 }, (_, i) => day(-20 - i, 15)), day(-1, 15)];
    const s = computeStreak(hist, TODAY);
    expect(s.best).toBe(9);
    expect(s.current).toBe(1);
  });

  it('lunes de la semana', () => {
    expect(mondayOf('2026-11-12')).toBe('2026-11-09');
    expect(mondayOf('2026-11-15')).toBe('2026-11-09');
    expect(mondayOf('2026-11-16')).toBe('2026-11-16');
  });
});

describe('XP', () => {
  it('premia lo que te cuesta: la destreza floja da más que la fuerte', () => {
    const scores = { uoe: 164, listening: 188 };
    const weak = xpFor({ kind: 'rue', part: 'p4', mode: 'practice' }, scores);
    const strong = xpFor({ kind: 'listening', part: 'l4', mode: 'practice' }, scores);
    expect(weak.xp).toBeGreaterThan(18); // 12 × 1,75
    expect(strong.xp).toBeLessThan(10); // 10 × 0,75
    expect(weakness(180)).toBe(1);
  });

  it('lo difícil vale más que lo fácil, y el modo examen un poco más', () => {
    const w = xpFor({ kind: 'writing' }, {}).xp;
    const card = xpFor({ kind: 'card' }, {}).xp;
    expect(w).toBe(40);
    expect(card).toBe(1);
    expect(xpFor({ kind: 'rue', part: 'p4', mode: 'exam' }, {}).xp).toBeGreaterThan(xpFor({ kind: 'rue', part: 'p4', mode: 'practice' }, {}).xp);
  });
});

describe('logros', () => {
  const NOW = Date.parse('2026-11-12T10:00:00Z');
  const scores: ScoreDoc[] = [
    { kind: 'diagnostic', skills: { reading: 176, uoe: 164, writing: 178, listening: 184, speaking: 172 }, overall: 175, at: NOW - 20 * 86_400_000 },
    { kind: 'mock', paper: 'full', label: 'Simulacro completo', skills: { reading: 182, uoe: 178, writing: 181, listening: 186, speaking: 180 }, overall: 181, at: NOW - 86_400_000 },
  ];
  const base: Ctx = {
    now: NOW,
    scores,
    estimate: estimateAt(scores, NOW),
    streak: computeStreak([], TODAY),
    days: [],
    xpTotal: 120,
    writings: [{ title: 'Should university be free?', type: 'essay', versions: [{ raw: 12 }, { raw: 16, feedback: { scores: { content: 4, communicative: 4, organisation: 4, language: 4 } } }] }],
    speakings: [{ mode: 'long-turn', title: 'Long turn 60 s', scale: 178, items: [{ durationMs: 61_000, metrics: { wpm: 128, pauses: 0, spanish: 0, seconds: 61 } }] }],
    attempts: [{ kind: 'rue', part: 'p4', mode: 'exam', marks: 12, max: 12 }],
    mastered: [],
    grammarDone: 3,
    readinessCrit: DEFAULT_SETTINGS.readiness,
  };

  it('se celebran con datos concretos, no con frases genéricas', () => {
    const got = evaluate(base);
    expect(got['first-diagnostic']).toContain('175');
    expect(got['first-mock-pass']).toContain('181');
    expect(got['first-essay-15']).toContain('16/20');
    expect(got['longturn-60']).toContain('61 segundos');
    expect(got['p4-perfect']).toContain('12/12');
    expect(got['first-skill-180']).toBeTruthy();
    expect(got['all-180']).toBeUndefined();
    expect(got['xp-1000']).toBeUndefined();
    expect(got['ready']).toBeUndefined(); // 181 < 185 y solo un simulacro
  });

  it('cada logro tiene título y cómo se consigue', () => {
    expect(new Set(DEFS.map((d) => d.id)).size).toBe(DEFS.length);
    expect(DEFS.every((d) => d.title && d.how.length > 10)).toBe(true);
  });
});
