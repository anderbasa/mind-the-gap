import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mockJson } from '../ai/mockData';
import { fill, getPrompt } from '../ai/prompts';
import { bankUnits, BATCH_MAX_CHARS, speakingLines, speakingUnitOf } from '../listening/ttsCore';
import { AssessSchema, HelpSchema, ListenSchema } from './ai';
import { buildSteps, pickP1 } from './mock';
import { LONG_TURN_TOPICS, SCENARIOS } from './scenarios';
import { linesById, speakingScale, SpeakingBank, speechMetrics } from './schema';

const read = (rel: string) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));
const bank = SpeakingBank.parse(read('../../public/bank/speaking/bank.json'));

describe('banco del Speaking', () => {
  it('es válido y tiene al menos dos simulacros completos', () => {
    expect(bank.tests.length).toBeGreaterThanOrEqual(2);
    expect(bank.p1.flatMap((t) => t.questions).length).toBeGreaterThanOrEqual(30);
    expect(new Set(bank.tests.map((t) => t.id)).size).toBe(bank.tests.length);
  });

  it('cada frase con voz tiene un id único, también junto a los audios del Listening', () => {
    const lines = speakingLines(bank);
    expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
    const dir = '../../public/bank/listening/';
    const sets = (read(dir + 'index.json') as string[]).map((f) => read(dir + f));
    const all = [...bankUnits(sets, read(dir + 'dictation.json'), read(dir + 'connected.json')), ...lines.map(speakingUnitOf)];
    expect(new Set(all.map((u) => u.id)).size).toBe(all.length);
  });

  it('el compañero habla con su voz y el examinador con la suya', () => {
    const lines = speakingLines(bank);
    expect(lines.filter((l) => l.who === 'examiner').every((l) => l.speaker.name === 'Theo')).toBe(true);
    expect(lines.find((l) => l.id === 'ta-p2-pl')?.who).toBe('partner');
    // El monólogo largo del compañero no va en lotes (se pide solo)
    expect(lines.find((l) => l.id === 'ta-p2-pl')!.text.length).toBeGreaterThan(BATCH_MAX_CHARS);
  });
});

describe('guion del simulacro', () => {
  it('las 4 partes: 20 turnos tuyos, con 1 minuto exacto en el long turn', () => {
    const t = bank.tests[0];
    const steps = buildSteps(bank, t, [1, 2, 3, 4], pickP1(bank));
    const rec = steps.filter((s) => s.k === 'record');
    expect(rec).toHaveLength(4 + 2 + t.p3.partnerLines.length + t.p3.decisionLines.length + t.p4.length + t.p4.filter((x) => x.partner).length);
    expect(rec.find((s) => s.k === 'record' && s.part === 2)).toMatchObject({ maxSec: 60, exact: true });
    const ids = linesById(bank);
    for (const s of steps) if (s.k === 'say') expect(ids.has(s.id), s.id).toBe(true);
  });

  it('una parte suelta solo incluye esa parte', () => {
    const steps = buildSteps(bank, bank.tests[1], [3], []);
    expect(steps.filter((s) => s.k === 'record').every((s) => s.k === 'record' && s.part === 3)).toBe(true);
    expect(steps.some((s) => s.k === 'think' && s.sec === 15)).toBe(true);
  });
});

describe('métricas del habla', () => {
  it('cuenta palabras, ritmo, muletillas, pausas y castellano', () => {
    const m = speechMetrics('Um, I think, er, you know, it was actually great. [pause] Like, really [es: guay].', 30_000);
    expect(m.words).toBe(12);
    expect(m.wpm).toBe(24);
    expect(m.pauses).toBe(1);
    expect(m.spanish).toBe(1);
    const f = Object.fromEntries(m.fillers.map((x) => [x.word, x.count]));
    expect(f).toMatchObject({ um: 1, er: 1, 'you know': 1, actually: 1, like: 1 });
    expect(speechMetrics('I like it a lot.', 10_000).fillers).toEqual([]);
  });

  it('nota orientativa con las anclas oficiales', () => {
    const all = (n: number) => ({ grammar: n, vocabulary: n, discourse: n, pronunciation: n, interaction: n, global: n });
    expect(speakingScale(all(2))).toEqual({ raw75: 30, scale: 160 });
    expect(speakingScale(all(3))).toEqual({ raw75: 45, scale: 180 });
    expect(speakingScale(all(5)).scale).toBe(210);
    // la Global cuenta ×5: subirla 1 punto sube 5 de 75
    expect(speakingScale({ ...all(3), global: 4 }).raw75).toBe(50);
    // sin compañero, la interacción = discurso
    expect(speakingScale({ grammar: 5, vocabulary: 4, discourse: 5, pronunciation: 4, global: 5 }).raw75).toBe(71);
  });
});

describe('prompts, escenarios y respuestas de demo', () => {
  it('los prompts del Speaking se rellenan enteros', () => {
    expect(fill(getPrompt('speaking-listen').body, { prompt: 'x' })).not.toMatch(/\{\{/);
    expect(fill(getPrompt('speaking-assess').body, { mode: 'm', items: 'i' })).not.toMatch(/\{\{/);
    expect(fill(getPrompt('speaking-help').body, { context: 'c', said: 's', hint: 'h' })).not.toMatch(/\{\{/);
    const s = SCENARIOS[0];
    expect(fill(getPrompt('speaking-live').body, { scenario: s.title, role: s.role, goal: s.goal, twist: s.twist, minutes: '6' })).not.toMatch(/\{\{/);
    expect(fill(getPrompt('speaking-reply').body, { scenario: 'a', role: 'b', goal: 'c', twist: 'd', turns: '6', history: '' })).not.toMatch(/\{\{/);
  });

  it('escenarios y temas', () => {
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
    expect(LONG_TURN_TOPICS.length).toBeGreaterThanOrEqual(6);
  });

  it('las respuestas de demo cumplen los esquemas', () => {
    expect(ListenSchema.safeParse(mockJson({ task: 'transcribe', system: 'pronunciation', messages: [] })).success).toBe(true);
    expect(AssessSchema.safeParse(mockJson({ task: 'assess-speaking', messages: [] })).success).toBe(true);
    expect(HelpSchema.safeParse(mockJson({ task: 'chat', system: 'They got stuck', messages: [] })).success).toBe(true);
  });
});
