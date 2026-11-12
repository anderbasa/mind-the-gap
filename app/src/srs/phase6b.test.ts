import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { fill, getPrompt } from '../ai/prompts';
import { topFive, type PatternsDoc } from '../errors/notebook';
import { IDIOMS, LESSONS, ROLE_ES } from '../grammar/lessons';
import { isMastered } from '../grammar/practice';
import { checkTyped, newFsrs, review, todaysQueue, type VocabCard } from './srs';

const starter = JSON.parse(readFileSync(fileURLToPath(new URL('../../public/bank/srs/starter.json', import.meta.url)), 'utf8')) as VocabCard[];

const mk = (over: Partial<VocabCard>): VocabCard => ({
  id: 'x',
  type: 'gap',
  term: 't',
  front: 'f',
  back: 'b',
  source: 'starter',
  status: 'new',
  uses: 0,
  fsrs: newFsrs(new Date('2026-11-12T10:00:00Z')),
  createdAt: 0,
  ...over,
});

describe('tarjetas (FSRS)', () => {
  it('el pack de inicio tiene 60 tarjetas válidas', () => {
    expect(starter).toHaveLength(60);
    for (const c of starter) {
      expect(['meaning', 'gap', 'wordform', 'collocation', 'production', 'fix']).toContain(c.type);
      expect(c.term && c.front && c.back).toBeTruthy();
      if (c.type !== 'meaning') expect(c.answer, c.front).toBeTruthy();
    }
    expect(new Set(starter.map((c) => `${c.type}|${c.front}`)).size).toBe(60);
  });

  it('al acertar una nueva, pasa a aprendiendo y vuelve pronto; al acertar más, se espacia', () => {
    const now = new Date('2026-11-12T10:00:00Z');
    let c = review(mk({}), Rating.Good, now);
    expect(c.status).toBe('learning');
    expect(c.introducedAt).toBe(now.getTime());
    const first = c.fsrs.due - now.getTime();
    c = review(c, Rating.Good, new Date(c.fsrs.due));
    c = review(c, Rating.Good, new Date(c.fsrs.due));
    expect(c.fsrs.due - now.getTime()).toBeGreaterThan(first * 10);
    expect(review(c, Rating.Again, new Date(c.fsrs.due)).fsrs.lapses).toBeGreaterThanOrEqual(1);
  });

  it('respuestas escritas: exactas en huecos; frases enteras con margen', () => {
    expect(checkTyped(mk({ answer: 'pay' }), ' Pay ').ok).toBe(true);
    expect(checkTyped(mk({ answer: 'draw', accepted: ['reach'] }), 'reach').ok).toBe(true);
    expect(checkTyped(mk({ answer: 'pay' }), 'pai').ok).toBe(false);
    const p = mk({ type: 'production', answer: 'You should have told me.' });
    expect(checkTyped(p, 'You should have told me').ok).toBe(true);
    expect(checkTyped(p, 'You should had told me').ok).toBe(false);
    expect(checkTyped(p, 'You should had told me').close).toBe(true);
  });

  it('cola de hoy: las que vencen y nuevas hasta el tope', () => {
    const now = Date.now();
    const cards = [
      mk({ id: 'a', status: 'review', fsrs: { ...newFsrs(), due: now - 1000 } }),
      mk({ id: 'b', status: 'review', fsrs: { ...newFsrs(), due: now + 86_400_000 } }),
      mk({ id: 'm', status: 'mastered', fsrs: { ...newFsrs(), due: now - 1000 } }),
      ...Array.from({ length: 30 }, (_, i) => mk({ id: `n${i}`, createdAt: i })),
    ];
    const q = todaysQueue(cards, now);
    expect(q.due.map((c) => c.id)).toEqual(['a']);
    expect(q.fresh.length).toBeLessThanOrEqual(10);
    expect(q.fresh[0].id).toBe('n0');
  });
});

describe('gramática C1', () => {
  it('12 puntos, cada uno con 5 ejercicios y bloques con funciones válidas', () => {
    expect(LESSONS).toHaveLength(12);
    for (const l of LESSONS) {
      expect(l.prompts).toHaveLength(5);
      expect(l.es.split(/(?<=[.!?])\s+/).length).toBeLessThanOrEqual(3);
      for (const [, r] of l.blocks) expect(ROLE_ES[r]).toBeTruthy();
    }
    expect(IDIOMS.length).toBeGreaterThanOrEqual(20);
  });

  it('dominado con 4 de las 5 últimas bien', () => {
    expect(isMastered([true, true, true, true])).toBe(false);
    expect(isMastered([true, true, false, false, true, true])).toBe(false);
    expect(isMastered([false, true, true, true, true, false])).toBe(true);
  });
});

describe('cuaderno de errores y prompts', () => {
  it('top 5: primero los patrones de 3 o más', () => {
    const doc: PatternsDoc = {
      at: 0,
      basedOn: 10,
      patterns: [
        { name: 'a', rule: '', category: '', errorIds: [], examples: [], count: 4 },
        { name: 'b', rule: '', category: '', errorIds: [], examples: [], count: 2 },
        { name: 'c', rule: '', category: '', errorIds: [], examples: [], count: 3 },
      ],
    };
    expect(topFive(doc).map((p) => p.name)).toEqual(['a', 'c']);
    expect(topFive({ ...doc, patterns: [doc.patterns[1]] }).map((p) => p.name)).toEqual(['b']);
    expect(topFive(null)).toEqual([]);
  });

  it('los prompts nuevos se rellenan enteros', () => {
    expect(fill(getPrompt('cards-enrich').body, { words: 'x' })).not.toMatch(/\{\{/);
    expect(fill(getPrompt('error-patterns').body, { errors: 'x' })).not.toMatch(/\{\{/);
    expect(fill(getPrompt('error-practice').body, { name: 'a', rule: 'b', examples: 'c' })).not.toMatch(/\{\{/);
    expect(fill(getPrompt('grammar-check').body, { point: 'a', rule: 'b', task: 'c', answer: 'd' })).not.toMatch(/\{\{/);
    expect(fill(getPrompt('grammar-explain').body, { point: 'a', es: 'b', examples: 'c' })).not.toMatch(/\{\{/);
  });
});
