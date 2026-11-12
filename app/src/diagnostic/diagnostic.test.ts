import { describe, expect, it } from 'vitest';
import { fill, getPrompt } from '../ai/prompts';
import { overallOf, pctToScale, rawToScale } from '../scoring/estimate';
import { SCENARIOS } from '../speaking/scenarios';
import { notesText } from '../tutor/notes';
import { nextPart, partRoute, skillsOf, type DiagRun } from './run';

const run: DiagRun = {
  id: 'x',
  mode: 'full',
  startedAt: 0,
  parts: [
    { block: 'uoe', kind: 'rue', ref: 'p4-a', part: 'p4', label: 'P4', done: true, marks: 8, max: 12 },
    { block: 'uoe', kind: 'rue', ref: 'p3-a', part: 'p3', label: 'P3', done: true, marks: 6, max: 8 },
    { block: 'reading', kind: 'rue', ref: 'p1-a', part: 'p1', label: 'P1' },
    { block: 'listening', kind: 'listening', ref: 'l1-a', part: 'l1', label: 'L1', done: true, marks: 6, max: 6 },
    { block: 'writing', kind: 'writing', ref: 'w-review-app', part: 'w', label: 'W', done: true, scale: 175 },
    { block: 'speaking', kind: 'speaking', ref: 'diag', part: 's', label: 'S' },
  ],
};

describe('notas estimadas', () => {
  it('tablas oficiales: Use of English y Listening tienen umbrales más bajos que el Reading', () => {
    expect(rawToScale('uoe', 16)).toBe(180);
    expect(rawToScale('listening', 18)).toBe(180);
    expect(rawToScale('writing', 24)).toBe(180);
    expect(rawToScale('speaking', 45)).toBe(180);
    expect(rawToScale('reading', 32)).toBe(180);
    expect(rawToScale('uoe', 8)).toBe(142);
  });

  it('porcentaje → escala con las anclas oficiales del Reading', () => {
    expect(pctToScale(46)).toBe(160);
    expect(pctToScale(64)).toBe(180);
    expect(pctToScale(86)).toBe(200);
    expect(pctToScale(100)).toBe(210);
    expect(pctToScale(55)).toBe(170);
  });

  it('la global es la media de las notas que haya', () => {
    expect(overallOf({ reading: 180, uoe: 170, writing: 175, listening: 190, speaking: 165 })).toBe(176);
    expect(overallOf({})).toBeNull();
  });
});

describe('diagnóstico', () => {
  it('nota por destreza con lo hecho hasta ahora', () => {
    const s = skillsOf(run);
    expect(s.uoe).toBe(pctToScale(70, 'uoe'));
    expect(s.uoe).toBe(190); // 70 % de 28 = 19,6 → entre 16 (180) y 23 (200)
    expect(s.listening).toBe(210);
    expect(s.writing).toBe(175);
    expect(s.reading).toBeUndefined();
    expect(s.speaking).toBeUndefined();
  });

  it('siguiente parte y ruta de cada pantalla, en modo examen', () => {
    expect(nextPart(run)?.ref).toBe('p1-a');
    expect(nextPart(run, 'speaking')?.ref).toBe('diag');
    expect(partRoute(run.parts[0])).toBe('/practicar/rue/p4?mode=exam&id=p4-a&diag=1');
    expect(partRoute(run.parts[3])).toBe('/practicar/listening/l1?mode=exam&id=l1-a&diag=1');
    expect(partRoute(run.parts[4])).toBe('/practicar/writing/escribir?task=w-review-app&diag=1');
    expect(partRoute(run.parts[5])).toBe('/practicar/speaking/conversacion?s=diag&diag=1');
  });

  it('la conversación del diagnóstico existe pero no sale en la lista de role-plays', () => {
    expect(SCENARIOS.find((s) => s.id === 'diag')?.hidden).toBe(true);
  });
});

describe('memoria de Theo', () => {
  it('el prompt se rellena y el texto de las notas lo junta todo', () => {
    expect(fill(getPrompt('tutor-notes').body, { event: 'e', current: 'c', activity: 'a' })).not.toMatch(/\{\{/);
    const t = notesText({ summary: 'They rush.', strengths: ['clear ideas'], weaknesses: ['prepositions'], patterns: ['depend of'], nextChallenge: 'Use two inversions.', levelGuess: 'B2+' });
    expect(t).toContain('They rush.');
    expect(t).toContain('Level estimate: B2+.');
    expect(t).toContain('Recurring errors: depend of.');
    expect(t).toContain('Pending mini-challenge: Use two inversions.');
  });
});

describe('simulacros', () => {
  const run: DiagRun = {
    id: 'm1',
    mode: 'full',
    paper: 'full',
    startedAt: 0,
    parts: [
      { block: 'uoe', kind: 'rue', ref: 'p4-a', part: 'p4', label: 'P4', done: true, marks: 10, max: 12 },
      { block: 'writing', kind: 'writing', ref: 'essay-1', part: 'w1', label: 'W1', done: true, scale: 180, marks: 14, max: 20 },
      { block: 'writing', kind: 'writing', ref: 'review-1', part: 'w2', label: 'W2', done: true, scale: 170, marks: 12, max: 20 },
      { block: 'speaking', kind: 'speaking', ref: 'ta', part: 's', label: 'S', done: false },
    ],
  };
  it('rutas en modo simulacro (mock=1) y el speaking va al simulacro con examinador', () => {
    expect(partRoute(run.parts[0], 'mock')).toBe('/practicar/rue/p4?mode=exam&id=p4-a&mock=1');
    expect(partRoute(run.parts[3], 'mock')).toBe('/practicar/speaking/simulacro?test=ta&mock=1');
    expect(nextPart(run)?.ref).toBe('ta');
  });
  it('writing con dos tareas: (14 + 12) / 2 × 2 = 26 de 40 → escala oficial', () => {
    expect(skillsOf(run).writing).toBe(rawToScale('writing', 26));
  });
});
