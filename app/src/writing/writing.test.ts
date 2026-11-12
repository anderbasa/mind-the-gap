import { describe, expect, it } from 'vitest';
import { mockJson } from '../ai/mockData';
import { fill, getPrompt } from '../ai/prompts';
import { analyse, countWords, habitualWords, splitParagraphs } from './analysis';
import { LANGUAGE } from './language';
import { CheckSchema, REPHRASE_BANK, TOPICS } from './rephrase';
import { SayBetterSchema } from './sayBetter';
import { estimateScale, FeedbackSchema, OcrSchema, total } from './schema';
import { getTask, taskAsText, WRITING_TASKS } from './tasks';

describe('análisis local', () => {
  it('cuenta palabras y párrafos', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('  One two\nthree  ')).toBe(3);
    expect(splitParagraphs('A b.\n\nC d.\n\n\nE f.')).toHaveLength(3);
    // en el móvil a veces se separa con un solo salto de línea
    expect(splitParagraphs('A b.\nC d.')).toHaveLength(2);
  });

  it('detecta conectores, palabras repetidas y párrafos desequilibrados', () => {
    const text = [
      'However, the problem is important. However, people ignore it. However, it is important.',
      'Important ideas need important answers.',
      'In conclusion, it matters.',
    ].join('\n\n');
    const a = analyse(text);
    expect(a.connectors.find((c) => c.connector === 'however')?.count).toBe(3);
    expect(a.connectors.find((c) => c.connector === 'in conclusion')?.count).toBe(1);
    expect(a.repeated[0]).toEqual({ word: 'important', count: 4 });
    expect(a.paragraphs).toEqual([13, 5, 4]);
    expect(a.balance).toEqual([]);
    const lopsided = analyse(['word '.repeat(60), 'Too short.', 'word '.repeat(50)].join('\n\n'));
    expect(lopsided.balance).toEqual(['El párrafo 2 es muy corto (2 palabras) comparado con los demás.']);
    expect(analyse('Just one paragraph.').balance[0]).toContain('Solo hay 1 párrafo');
  });

  it('no cuenta «so» dentro de otras palabras', () => {
    expect(analyse('Some reasons, also personal.').connectors.find((c) => c.connector === 'so')).toBeUndefined();
  });

  it('encuentra las palabras que repites en varios writings', () => {
    const prev = ['Society is changing. Society needs change.', 'Our society and our society again.', 'Nothing here.'];
    const h = habitualWords(prev, 'In society today, society is busy.');
    expect(h.map((x) => x.word)).toContain('society');
    expect(habitualWords([], 'society society')).toEqual([]);
  });
});

describe('nota del writing', () => {
  it('suma los 4 criterios y estima la escala con las anclas', () => {
    expect(total({ content: 5, communicative: 4, organisation: 4, language: 4 })).toBe(17);
    expect(estimateScale(8)).toBe(160);
    expect(estimateScale(12)).toBe(180);
    expect(estimateScale(17)).toBe(200);
    expect(estimateScale(20)).toBe(210);
    expect(estimateScale(-3)).toBe(110);
    expect(estimateScale(10)).toBe(170);
  });
});

describe('enunciados y banco de lenguaje', () => {
  it('tiene 12 enunciados con ids únicos y todos los tipos', () => {
    expect(WRITING_TASKS).toHaveLength(12);
    expect(new Set(WRITING_TASKS.map((t) => t.id)).size).toBe(12);
    for (const t of WRITING_TASKS) {
      expect(LANGUAGE[t.type]).toBeTruthy();
      if (t.part === 1) {
        expect(t.type).toBe('essay');
        expect(t.notes?.points).toHaveLength(3);
        expect(t.notes?.opinions).toHaveLength(3);
      } else expect(t.notes).toBeUndefined();
    }
    expect(getTask('w-essay-saving')).toBeTruthy();
    expect(taskAsText(WRITING_TASKS[0])).toContain('NOTES');
  });

  it('el prompt de corrección se rellena entero', () => {
    const t = WRITING_TASKS[0];
    const out = fill(getPrompt('writing-correct').body, { task: taskAsText(t), plan: '(no plan)', analysis: 'x', previous: '', version: '1', text: 'Hello.' });
    expect(out).toContain('Hello.');
    expect(out).not.toMatch(/\{\{/);
  });
});

describe('Reformular', () => {
  it('el banco es válido', () => {
    expect(REPHRASE_BANK.length).toBeGreaterThanOrEqual(30);
    expect(new Set(REPHRASE_BANK.map((x) => x.id)).size).toBe(REPHRASE_BANK.length);
    for (const x of REPHRASE_BANK) {
      expect(x.topic in TOPICS).toBe(true);
      expect(x.models.length).toBeGreaterThan(0);
      expect(x.instruction.length).toBeGreaterThan(5);
    }
  });

  it('los prompts de Reformular y Dímelo mejor existen y se rellenan', () => {
    expect(fill(getPrompt('rephrase-check').body, { sentence: 'a', instruction: 'b', models: 'c', answer: 'd', others: '(none)' })).not.toMatch(/\{\{/);
    expect(fill(getPrompt('rephrase-generate').body, { topics: 'inversion', examples: '', avoid: '' })).not.toMatch(/\{\{/);
    expect(fill(getPrompt('say-it-better').body, { text: 'hi', context: '(not given)' })).not.toMatch(/\{\{/);
    expect(getPrompt('writing-ocr').body.length).toBeGreaterThan(50);
  });
});

describe('las respuestas de demo cumplen los esquemas', () => {
  const req = (task: 'correct-writing' | 'ocr-writing' | 'rephrase', system = '') => ({ task, system, messages: [] });
  it('corrección, foto, Reformular y Dímelo mejor', () => {
    expect(FeedbackSchema.safeParse(mockJson(req('correct-writing'))).success).toBe(true);
    expect(OcrSchema.safeParse(mockJson(req('ocr-writing'))).success).toBe(true);
    expect(CheckSchema.safeParse(mockJson(req('rephrase'))).success).toBe(true);
    expect(SayBetterSchema.safeParse(mockJson(req('rephrase', 'MODE: Say it better'))).success).toBe(true);
  });
});
