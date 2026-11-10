// Formato de las 8 partes del Reading and Use of English (C1 Advanced).
// Los esquemas sirven para pedir JSON a la IA, validar lo que devuelve y tipar la app.
import { z } from 'zod';

export type PartId = 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'p7' | 'p8';
export const PART_IDS: PartId[] = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];

const Letter4 = z.enum(['A', 'B', 'C', 'D']);
const Letter7 = z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
const Letter6 = z.enum(['A', 'B', 'C', 'D', 'E', 'F']);
const s = (d: string) => z.string().min(1).describe(d);

const itemCommon = {
  n: z.number().int().min(1).describe('Item number within the part, starting at 1'),
  hint: s('A short hint in English that helps without giving the answer away'),
  explanation: s('Why the answer is correct (and why tempting alternatives are wrong), 1–3 sentences in English'),
};

const Options4 = z.object({ A: s('Option A'), B: s('Option B'), C: s('Option C'), D: s('Option D') });

/* ── Contenido que genera la IA (sin metadatos) ─────────────────── */

export const P1Gen = z.object({
  title: s('Title of the text'),
  topic: s('Topic in a few words'),
  text: s('Text of 200–280 words with exactly 8 gaps marked {1} … {8}, in order'),
  items: z
    .array(
      z.object({
        ...itemCommon,
        options: Options4,
        answer: Letter4,
        focus: z.enum(['collocation', 'phrasal verb', 'fixed phrase', 'linking word', 'meaning', 'dependent preposition', 'idiom']),
      }),
    )
    .length(8),
});

export const P2Gen = z.object({
  title: s('Title of the text'),
  topic: s('Topic in a few words'),
  text: s('Text of 200–280 words with exactly 8 gaps marked {1} … {8}, in order'),
  items: z
    .array(
      z.object({
        ...itemCommon,
        answers: z.array(z.string().min(1)).min(1).describe('Every acceptable one-word answer, best first'),
        focus: z.enum(['preposition', 'article', 'auxiliary', 'pronoun', 'conjunction', 'quantifier', 'phrasal particle', 'fixed phrase', 'comparison', 'relative', 'other']),
      }),
    )
    .length(8),
});

export const P3Gen = z.object({
  title: s('Title of the text'),
  topic: s('Topic in a few words'),
  text: s('Text of 200–280 words with exactly 8 gaps marked {1} … {8}, in order'),
  items: z
    .array(
      z.object({
        ...itemCommon,
        base: s('The stem word in CAPITALS shown at the end of the line'),
        answers: z.array(z.string().min(1)).min(1).describe('Every acceptable spelling of the derived word, best first'),
        focus: z.enum(['negative prefix', 'noun suffix', 'adjective suffix', 'adverb', 'verb', 'compound', 'internal change']),
      }),
    )
    .length(8),
});

export const P4Gen = z.object({
  title: s('A short title for the set'),
  topic: s('Theme of the sentences'),
  items: z
    .array(
      z.object({
        ...itemCommon,
        first: s('The first, complete sentence'),
        keyword: s('The key word in CAPITALS, which must not be changed'),
        before: s('Second sentence: the part before the gap'),
        after: s('Second sentence: the part after the gap (may be just a full stop)'),
        answers: z.array(z.string().min(1)).min(1).describe('Every fully correct gap filler (3–6 words including the key word), best first'),
        chunks: z
          .array(z.array(z.string().min(1)).min(1))
          .length(2)
          .describe('The two marking halves: acceptable variants for each half, worth 1 mark each'),
        focus: z.enum(['passive', 'reported speech', 'conditional', 'inversion', 'phrasal verb', 'fixed phrase', 'comparison', 'modal', 'gerund/infinitive', 'causative', 'wish', 'other']),
      }),
    )
    .length(6),
});

export const P5Gen = z.object({
  title: s('Title of the article'),
  topic: s('Topic in a few words'),
  text: s('Article of 650–800 words; paragraphs separated by a blank line'),
  items: z
    .array(z.object({ ...itemCommon, question: s('Question stem'), options: Options4, answer: Letter4, evidence: s('The exact words in the text that justify the answer') }))
    .length(6),
});

export const P6Gen = z.object({
  title: s('Title shared by the four texts'),
  topic: s('Topic in a few words'),
  intro: s('One sentence introducing the four writers, e.g. "Four economists comment on…"'),
  texts: z
    .array(z.object({ letter: Letter4, author: s('Writer (e.g. "Economist A" or a fictional name)'), text: s('120–170 words') }))
    .length(4),
  items: z.array(z.object({ ...itemCommon, question: s('Which writer …? question'), answer: Letter4 })).length(4),
});

export const P7Gen = z.object({
  title: s('Title of the text'),
  topic: s('Topic in a few words'),
  text: s('Text of 500–650 words from which six paragraphs have been removed; the gaps are marked {1} … {6} on their own line between paragraphs'),
  paragraphs: z
    .array(z.object({ letter: Letter7, text: s('Removed paragraph, 60–110 words') }))
    .length(7)
    .describe('Seven paragraphs A–G: the six removed ones in random order plus one that fits nowhere'),
  items: z.array(z.object({ ...itemCommon, answer: Letter7 })).length(6),
});

export const P8Gen = z.object({
  title: s('Title of the text'),
  topic: s('Topic in a few words'),
  intro: s('One sentence introducing the sections'),
  sections: z
    .array(z.object({ letter: Letter6, heading: s('Section heading, e.g. a name'), text: s('140–200 words') }))
    .min(4)
    .max(6),
  items: z.array(z.object({ ...itemCommon, statement: s('A statement to match with a section'), answer: Letter6 })).length(10),
});

export const GEN_SCHEMAS = { p1: P1Gen, p2: P2Gen, p3: P3Gen, p4: P4Gen, p5: P5Gen, p6: P6Gen, p7: P7Gen, p8: P8Gen } as const;

/* ── Ejercicio completo (contenido + metadatos) ────────────────── */

const Meta = {
  id: z.string(),
  source: z.enum(['seed', 'ai']),
  createdAt: z.number(),
  model: z.string().optional(),
  promptVersion: z.string().optional(),
  validation: z.object({ by: z.string(), at: z.number(), notes: z.array(z.string()).default([]) }).optional(),
};

export const P1Set = P1Gen.extend({ ...Meta, part: z.literal('p1') });
export const P2Set = P2Gen.extend({ ...Meta, part: z.literal('p2') });
export const P3Set = P3Gen.extend({ ...Meta, part: z.literal('p3') });
export const P4Set = P4Gen.extend({ ...Meta, part: z.literal('p4') });
export const P5Set = P5Gen.extend({ ...Meta, part: z.literal('p5') });
export const P6Set = P6Gen.extend({ ...Meta, part: z.literal('p6') });
export const P7Set = P7Gen.extend({ ...Meta, part: z.literal('p7') });
export const P8Set = P8Gen.extend({ ...Meta, part: z.literal('p8') });

export const RueSet = z.discriminatedUnion('part', [P1Set, P2Set, P3Set, P4Set, P5Set, P6Set, P7Set, P8Set]);
export type RueSet = z.infer<typeof RueSet>;
export type SetOf<P extends PartId> = Extract<RueSet, { part: P }>;

/* ── Información de cada parte ─────────────────────────────────── */

export interface PartInfo {
  id: PartId;
  name: string;
  short: string;
  items: number;
  marksPerItem: number;
  firstNumber: number; // numeración del examen real (1–56)
  skill: 'reading' | 'uoe';
  minutes: number; // tiempo orientativo dentro de la hora y media
  priority: boolean;
  instructions: string; // instrucciones al estilo del examen
}

export const PARTS: Record<PartId, PartInfo> = {
  p1: { id: 'p1', name: 'Part 1 · Multiple-choice cloze', short: 'Huecos con 4 opciones: collocations, phrasal verbs, matices', items: 8, marksPerItem: 1, firstNumber: 1, skill: 'reading', minutes: 8, priority: true, instructions: 'For questions 1–8, read the text below and decide which answer (A, B, C or D) best fits each gap.' },
  p2: { id: 'p2', name: 'Part 2 · Open cloze', short: 'Una palabra por hueco: gramática', items: 8, marksPerItem: 1, firstNumber: 9, skill: 'uoe', minutes: 8, priority: false, instructions: 'For questions 9–16, read the text below and think of the word which best fits each gap. Use only one word in each gap.' },
  p3: { id: 'p3', name: 'Part 3 · Word formation', short: 'Forma la palabra: prefijos, sufijos, familias', items: 8, marksPerItem: 1, firstNumber: 17, skill: 'uoe', minutes: 8, priority: true, instructions: 'For questions 17–24, read the text below. Use the word given in capitals at the end of some of the lines to form a word that fits in the gap in the same line.' },
  p4: { id: 'p4', name: 'Part 4 · Key word transformations', short: 'Reescribe con la palabra clave (0–2 puntos)', items: 6, marksPerItem: 2, firstNumber: 25, skill: 'uoe', minutes: 10, priority: true, instructions: 'For questions 25–30, complete the second sentence so that it has a similar meaning to the first sentence, using the word given. Do not change the word given. You must use between three and six words, including the word given.' },
  p5: { id: 'p5', name: 'Part 5 · Multiple choice', short: 'Texto largo y 6 preguntas', items: 6, marksPerItem: 2, firstNumber: 31, skill: 'reading', minutes: 15, priority: false, instructions: 'You are going to read an article. For questions 31–36, choose the answer (A, B, C or D) which you think fits best according to the text.' },
  p6: { id: 'p6', name: 'Part 6 · Cross-text multiple matching', short: 'Cuatro textos, cuatro opiniones', items: 4, marksPerItem: 2, firstNumber: 37, skill: 'reading', minutes: 12, priority: false, instructions: 'You are going to read four extracts. For questions 37–40, choose from the writers A–D. The writers may be chosen more than once.' },
  p7: { id: 'p7', name: 'Part 7 · Gapped text', short: 'Coloca los párrafos que faltan', items: 6, marksPerItem: 2, firstNumber: 41, skill: 'reading', minutes: 14, priority: false, instructions: 'You are going to read a text from which six paragraphs have been removed. Choose from the paragraphs A–G the one which fits each gap (41–46). There is one extra paragraph which you do not need to use.' },
  p8: { id: 'p8', name: 'Part 8 · Multiple matching', short: 'Empareja 10 frases con las secciones', items: 10, marksPerItem: 1, firstNumber: 47, skill: 'reading', minutes: 15, priority: false, instructions: 'You are going to read an article in sections. For questions 47–56, choose from the sections. The sections may be chosen more than once.' },
};

export const PART_ORDER_BY_PRIORITY: PartId[] = ['p4', 'p3', 'p1', 'p2', 'p5', 'p6', 'p7', 'p8'];

export function parseSet(raw: unknown): RueSet | null {
  const r = RueSet.safeParse(raw);
  return r.success ? r.data : null;
}
