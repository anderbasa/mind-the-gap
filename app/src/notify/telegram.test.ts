import { describe, expect, it } from 'vitest';
import { computeStreak, shiftDay, type DayDoc } from '../progress/rules';
import { DEFAULT_TELEGRAM, dailyText, due, eveningText, examDaysLeft, madridNow, sundayText } from './telegram';

// 12-nov-2026 (jueves), invierno: Madrid = UTC+1
const at = (iso: string) => Date.parse(iso);
const day = (date: string, min: number): DayDoc => ({ date, activeSec: min * 60, xp: min * 2 });
const streakWith = (todayMin: number) =>
  computeStreak([day('2026-11-12', todayMin), day('2026-11-11', 20), day('2026-11-10', 20)], '2026-11-12');

describe('hora de Madrid', () => {
  it('invierno UTC+1 y verano UTC+2', () => {
    expect(madridNow(at('2026-11-12T13:07:00Z'))).toEqual({ date: '2026-11-12', hour: 14, weekday: 3 });
    expect(madridNow(at('2026-07-12T12:07:00Z')).hour).toBe(14);
    expect(madridNow(at('2026-11-15T18:37:00Z')).weekday).toBe(6); // domingo
  });
});

describe('qué aviso toca', () => {
  it('mediodía: dentro de su hora y una sola vez al día', () => {
    const s = streakWith(0);
    expect(due(at('2026-11-12T13:07:00Z'), DEFAULT_TELEGRAM, {}, s)).toEqual(['daily']);
    expect(due(at('2026-11-12T13:37:00Z'), DEFAULT_TELEGRAM, { daily: '2026-11-12' }, s)).toEqual([]);
    expect(due(at('2026-11-12T12:37:00Z'), DEFAULT_TELEGRAM, {}, s)).toEqual([]); // 13:37 en Madrid
    // GitHub llega tarde: a las 15:37 aún se manda; a las 18:37, ya no
    expect(due(at('2026-11-12T14:37:00Z'), DEFAULT_TELEGRAM, {}, s)).toEqual(['daily']);
    expect(due(at('2026-11-12T17:37:00Z'), { ...DEFAULT_TELEGRAM, evening: false }, {}, s)).toEqual([]);
  });

  it('noche: solo si la racha está en juego', () => {
    expect(due(at('2026-11-12T20:07:00Z'), DEFAULT_TELEGRAM, {}, streakWith(3))).toEqual(['evening']);
    expect(due(at('2026-11-12T20:07:00Z'), DEFAULT_TELEGRAM, {}, streakWith(15))).toEqual([]); // hoy ya cuenta
    expect(due(at('2026-11-12T20:07:00Z'), { ...DEFAULT_TELEGRAM, evening: false }, {}, streakWith(3))).toEqual([]);
  });

  it('domingo por la tarde: resumen de la semana', () => {
    const sunday = computeStreak([day('2026-11-15', 20), day('2026-11-14', 20)], '2026-11-15');
    expect(due(at('2026-11-15T18:07:00Z'), DEFAULT_TELEGRAM, {}, sunday)).toEqual(['sunday']);
    expect(due(at('2026-11-15T18:07:00Z'), DEFAULT_TELEGRAM, { sunday: '2026-11-15' }, sunday)).toEqual([]);
  });
});

describe('textos', () => {
  it('mediodía con la sesión sugerida, el mini reto y la cuenta atrás; HTML escapado', () => {
    const t = dailyText({
      tasks: [{ id: 'a', kind: 'rue', title: 'Part 4 <transformations>', why: 'Use of English a 16 de 180', minutes: 12, route: '/x' }],
      challenge: 'Use "hardly" & an inversion',
      streak: streakWith(0),
      examDays: examDaysLeft('2027-01-23', '2026-11-12'),
    });
    expect(t).toContain('Examen en <b>72 días</b>');
    expect(t).toContain('Part 4 &lt;transformations&gt;');
    expect(t).toContain('&amp; an inversion');
    expect(t).toContain('Racha: <b>2 días</b>');
  });

  it('noche y domingo con números concretos', () => {
    expect(eveningText({ streak: streakWith(3), todayMin: 3 })).toContain('faltan 7 minutos');
    const week = [0, 1, 2, 3, 4, 5, 6].map((i) => day(shiftDay('2026-11-09', i), i < 4 ? 15 : 0));
    const s = sundayText({ week, streak: computeStreak(week, '2026-11-15'), estimate: { overall: 176, margin: 3 } });
    expect(s).toContain('60 min de estudio');
    expect(s).toContain('4 de 7 días');
    expect(s).toContain('te faltan unos 4');
  });
});

describe('Theo en el resumen del domingo', () => {
  it('los datos para Theo llevan números reales y las prioridades; su comentario va escapado', async () => {
    const { weekStatsText } = await import('./telegram');
    const week = [day('2026-11-09', 20), day('2026-11-10', 5)];
    const txt = weekStatsText({ week, streak: computeStreak(week, '2026-11-15'), estimate: null, priorities: [{ label: 'uoe', why: 'a 16 de 180' }], examDays: null });
    expect(txt).toContain('25 min over 1 of 7 days');
    expect(txt).toContain('uoe (a 16 de 180)');
    expect(txt).toContain('diagnostic not done');
    const s = sundayText({ week, streak: computeStreak(week, '2026-11-15'), theo: 'Only 25 minutes <this> week.' });
    expect(s).toContain('<b>Theo:</b> <i>Only 25 minutes &lt;this&gt; week.</i>');
  });
});
