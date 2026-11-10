import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { toGeminiSchema } from '../ai/gemini';
import { pickNext, type Progress } from './bank';
import { checkSet } from './checks';
import { itemsWithProblems, normalizeGaps } from './generate';
import { countWords, hasKeyword, markKeyWord, markOpen, markSet, normalize } from './marking';
import { renderSet } from './render';
import { sentenceAround } from './review';
import { GEN_SCHEMAS, PART_IDS, RueSet, type RueSet as RueSetT } from './schema';

const bankDir = join(dirname(fileURLToPath(import.meta.url)), '../../public/bank/rue');
const files = JSON.parse(readFileSync(join(bankDir, 'index.json'), 'utf8')) as string[];
const seeds = files.flatMap((f) => (JSON.parse(readFileSync(join(bankDir, f), 'utf8')) as unknown[]).map((x) => RueSet.parse(x)));

describe('banco escrito a mano', () => {
  it('hay ejercicios de todas las partes, todos cumplen el esquema y los ids no se repiten', () => {
    expect(new Set(seeds.map((s) => s.part))).toEqual(new Set(PART_IDS));
    expect(new Set(seeds.map((s) => s.id)).size).toBe(seeds.length);
  });

  it('las partes prioritarias tienen al menos 4 ejercicios', () => {
    for (const p of ['p1', 'p3', 'p4'] as const) expect(seeds.filter((s) => s.part === p).length).toBeGreaterThanOrEqual(4);
  });

  it('en la Parte 4, la primera respuesta saca 2 puntos con el propio corrector', () => {
    for (const s of seeds.filter((x) => x.part === 'p4')) {
      for (const it of s.items as { n: number; keyword: string; answers: string[]; chunks: string[][] }[]) {
        for (const a of it.answers) expect(markKeyWord(it, a).marks, `${s.id} #${it.n}: ${a}`).toBe(2);
      }
    }
  });

  it.each(seeds.map((s) => [s.id, s] as const))('%s pasa las comprobaciones de formato', (_, set) => {
    expect(checkSet(set)).toEqual([]);
  });

  it('en las partes de elegir, las respuestas no siguen un patrón obvio', () => {
    const p1 = seeds.find((s) => s.part === 'p1')!;
    const letters = p1.items.map((i) => (i as { answer: string }).answer);
    expect(new Set(letters).size).toBeGreaterThanOrEqual(3);
  });

  it('se puede representar en texto (para el validador) sin huecos sin numerar', () => {
    for (const s of seeds) expect(renderSet(s)).not.toMatch(/\{\d+\}/);
  });
});

describe('esquemas para la IA', () => {
  it.each(PART_IDS)('%s se convierte a JSON Schema', (p) => {
    const js = toGeminiSchema(GEN_SCHEMAS[p]);
    expect(js.type).toBe('object');
    expect(js).not.toHaveProperty('$schema');
  });
});

describe('corrección', () => {
  it('normaliza sin perdonar la ortografía', () => {
    expect(normalize('  Which. ')).toBe('which');
    expect(markOpen(['which'], 'Which').marks).toBe(1);
    expect(markOpen(['which'], 'wich').marks).toBe(0);
    expect(markOpen(['which'], 'wich').needsReview).toBe(true);
    expect(markOpen(['which'], 'that which').marks).toBe(0);
  });

  it('cuenta las contracciones como dos palabras', () => {
    expect(countWords("wish I'd started")).toBe(4);
    expect(countWords("didn't use to")).toBe(4);
    expect(countWords('the team’s attitude')).toBe(3); // posesivo: no suma
  });

  const kwt = { keyword: 'SAID', answers: ['is said to have'], chunks: [['is said'], ['to have']] };

  it('Parte 4: 2 puntos, 1 punto y 0 puntos', () => {
    expect(markKeyWord(kwt, 'is said to have').marks).toBe(2);
    expect(markKeyWord(kwt, 'Is said to have.').marks).toBe(2);
    const half = markKeyWord(kwt, 'is said that he');
    expect(half.marks).toBe(1);
    expect(half.needsReview).toBe(true);
    expect(markKeyWord(kwt, 'was told to have').marks).toBe(0); // sin la palabra clave
    expect(markKeyWord(kwt, 'is said to have really very completely').marks).toBe(0); // 7 palabras
    expect(markKeyWord(kwt, 'says to have').marks).toBe(0); // palabra clave cambiada
  });

  it('Parte 4: acepta la contracción negativa de la palabra clave', () => {
    const had = { keyword: 'HAD', answers: ['had not helped us'], chunks: [['had not', "hadn't"], ['helped']] };
    expect(markKeyWord(had, "hadn't helped us").marks).toBe(2);
    expect(hasKeyword("can't have been", 'CAN')).toBe(true);
    expect(hasKeyword('has helped', 'HAD')).toBe(false);
  });

  it('suma bien un ejercicio completo y aplica las notas revisadas por la IA', () => {
    const p2 = seeds.find((s) => s.part === 'p2')!;
    const all = Object.fromEntries(p2.items.map((it) => [it.n, (it as { answers: string[] }).answers[0]]));
    expect(markSet(p2, all)).toMatchObject({ marks: 8, max: 8 });
    const oneWrong = { ...all, 3: 'that' };
    expect(markSet(p2, oneWrong).marks).toBe(7);
    expect(markSet(p2, oneWrong, { 3: 1 }).marks).toBe(8);
    const p5 = seeds.find((s) => s.part === 'p5')!;
    expect(markSet(p5, { 1: 'C', 2: 'B' })).toMatchObject({ marks: 4, max: 12 });
  });
});

describe('banco: siguiente ejercicio', () => {
  const p1 = seeds.find((s) => s.part === 'p1')!;
  const ai = { ...p1, id: 'ai-1', source: 'ai', createdAt: 1 } as RueSetT;
  const empty: Progress = { seen: {}, best: {}, reported: {} };

  it('primero los no hechos, empezando por los escritos a mano', () => {
    expect(pickNext([ai, p1], empty, 'p1')).toMatchObject({ set: { id: p1.id }, fresh: true });
    expect(pickNext([ai, p1], { ...empty, seen: { [p1.id]: 5 } }, 'p1')).toMatchObject({ set: { id: 'ai-1' }, fresh: true });
  });

  it('si están todos hechos, el más antiguo; los reportados no salen', () => {
    expect(pickNext([ai, p1], { ...empty, seen: { [p1.id]: 5, 'ai-1': 9 } }, 'p1')).toMatchObject({ set: { id: p1.id }, fresh: false });
    expect(pickNext([ai, p1], { ...empty, reported: { [p1.id]: true }, seen: { 'ai-1': 9 } }, 'p1')).toMatchObject({ set: { id: 'ai-1' } });
    expect(pickNext([p1], { ...empty, reported: { [p1.id]: true } }, 'p1').set).toBeNull();
  });
});

describe('huecos que marca la IA', () => {
  it('unifica {{1}}, [1], (1)____ y [GAP 1] a {1}', () => {
    expect(normalizeGaps('a {{1}} b [2] c (3)____ d ____(4) e [GAP 5] f { 6 }')).toBe('a {1} b {2} c {3} d {4} e {5} f {6}');
  });
});

describe('ronda de corrección', () => {
  it('cuenta las preguntas distintas que marca el revisor', () => {
    expect(itemsWithProblems(['Ítem 2: dos respuestas', 'Ítem 8: el revisor elige A', 'Ítem 8: ambiguo'])).toBe(2);
    expect(itemsWithProblems(['El revisor dice que el nivel no es C1.'])).toBe(0);
  });
});

describe('contexto de un hueco', () => {
  it('saca la frase que contiene el hueco', () => {
    const t = 'First sentence here. It has far more to do {2} managing emotions than time. Next one {3} here.';
    expect(sentenceAround(t, 2)).toBe('It has far more to do [GAP] managing emotions than time.');
  });
});
