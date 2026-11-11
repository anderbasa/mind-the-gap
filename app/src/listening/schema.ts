// Formato de los listenings del banco (las 4 partes del C1 Advanced), los dictados
// y el «inglés hablado real». Los guiones son originales.
import { z } from 'zod';

const Accent = z.enum(['British', 'American', 'Australian', 'Irish', 'Scottish', 'Canadian', 'New Zealand', 'South African']);

export const Speaker = z.object({ id: z.string(), name: z.string(), gender: z.enum(['female', 'male']), accent: Accent });
export const Turn = z.object({ s: z.string(), text: z.string().min(1), style: z.string().optional() });
export const Unit = z.object({
  id: z.string(),
  speakers: z.array(Speaker).min(1),
  turns: z.array(Turn).min(1),
  style: z.string().optional(),
  gapMs: z.number().int().optional(),
});
export type UnitT = z.infer<typeof Unit>;

const Mcq = z.object({
  n: z.number().int(),
  stem: z.string(),
  options: z.record(z.string(), z.string()),
  answer: z.string(),
  explanation: z.string(),
  /** Frase literal del guion que da la respuesta. */
  evidence: z.string(),
});
export type McqT = z.infer<typeof Mcq>;

const Base = { id: z.string(), title: z.string(), createdAt: z.number().optional() };

export const L1 = z.object({
  ...Base,
  part: z.literal('l1'),
  extracts: z
    .array(z.object({ context: z.string(), unit: Unit, questions: z.array(Mcq).length(2) }))
    .length(3),
});

export const L2 = z.object({
  ...Base,
  part: z.literal('l2'),
  context: z.string(),
  unit: Unit,
  items: z
    .array(
      z.object({
        n: z.number().int(),
        /** La frase con ___ donde va la respuesta. */
        sentence: z.string(),
        answers: z.array(z.string()).min(1),
        explanation: z.string(),
        evidence: z.string(),
      }),
    )
    .length(8),
});

export const L3 = z.object({ ...Base, part: z.literal('l3'), context: z.string(), unit: Unit, questions: z.array(Mcq).length(6) });

const Task = z.object({ prompt: z.string(), options: z.record(z.string(), z.string()) });

export const L4 = z.object({
  ...Base,
  part: z.literal('l4'),
  context: z.string(),
  unit: Unit,
  task1: Task,
  task2: Task,
  answers1: z.array(z.string()).length(5),
  answers2: z.array(z.string()).length(5),
  notes: z.array(z.object({ evidence1: z.string(), evidence2: z.string(), explanation: z.string() })).length(5),
});

export const ListeningSet = z.discriminatedUnion('part', [L1, L2, L3, L4]);
export type ListeningSetT = z.infer<typeof ListeningSet>;
export type L1T = z.infer<typeof L1>;
export type L2T = z.infer<typeof L2>;
export type L3T = z.infer<typeof L3>;
export type L4T = z.infer<typeof L4>;

export type LPart = ListeningSetT['part'];
export const LPARTS: LPart[] = ['l1', 'l2', 'l3', 'l4'];

export const LPART_INFO: Record<LPart, { name: string; short: string; items: number; first: number; readSec: number; rubric: string }> = {
  l1: {
    name: 'Part 1 · Short extracts',
    short: 'Tres conversaciones, 2 preguntas A–C cada una',
    items: 6,
    first: 1,
    readSec: 15,
    rubric: 'You will hear three different extracts. For questions 1–6, choose the answer (A, B or C) which fits best according to what you hear. There are two questions for each extract.',
  },
  l2: {
    name: 'Part 2 · Sentence completion',
    short: 'Una charla: completa 8 frases con las palabras que oyes',
    items: 8,
    first: 7,
    readSec: 45,
    rubric: 'For questions 7–14, complete the sentences with a word or short phrase. Write the words you hear; spelling counts.',
  },
  l3: {
    name: 'Part 3 · Interview',
    short: 'Una entrevista o charla larga, 6 preguntas A–D',
    items: 6,
    first: 15,
    readSec: 60,
    rubric: 'For questions 15–20, choose the answer (A, B, C or D) which fits best according to what you hear.',
  },
  l4: {
    name: 'Part 4 · Multiple matching',
    short: 'Cinco personas: dos tareas a la vez, opciones A–H',
    items: 10,
    first: 21,
    readSec: 45,
    rubric: 'You will hear five short extracts. While you listen, you must complete both tasks. For each speaker, choose from the list (A–H).',
  },
};

/** Las piezas de audio de un set (P1 tiene tres; el resto, una). */
export function unitsOf(set: ListeningSetT): UnitT[] {
  return set.part === 'l1' ? set.extracts.map((x) => x.unit) : [set.unit];
}

/** Texto plano del guion de una pieza, con el nombre de cada hablante. */
export function transcriptOf(unit: UnitT): { who: string; text: string }[] {
  const names = Object.fromEntries(unit.speakers.map((s) => [s.id, s.name]));
  return unit.turns.map((t) => ({ who: names[t.s] ?? t.s, text: t.text }));
}

/* ── Dictados e inglés hablado real ─────────────────────────────── */

export const Dictation = z.object({
  id: z.string(),
  level: z.number().int().min(1).max(3),
  text: z.string(),
  speaker: Speaker,
});
export type DictationT = z.infer<typeof Dictation>;

export const Connected = z.object({
  id: z.string(),
  kind: z.enum(['weak', 'contraction', 'linking', 'elision', 'assimilation', 'informal']),
  title: z.string(),
  /** Explicación en castellano. */
  es: z.string(),
  /** Lo que se dice (a veces con la forma reducida escrita: gonna, d'you…). */
  spoken: z.string(),
  /** La frase completa, bien escrita. */
  full: z.string(),
  speaker: Speaker,
});
export type ConnectedT = z.infer<typeof Connected>;

export { connectedUnitOf as connectedUnit, dictationUnitOf as dictationUnit } from './ttsCore';
