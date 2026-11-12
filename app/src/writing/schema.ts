// Formato de la corrección de un writing (lo que devuelve la IA) y la nota estimada.
import { z } from 'zod';
import { rawToScale } from '../scoring/estimate';

const Score = z.number().int().min(0).max(5);

const Correction = z.object({
  quote: z.string().describe('Exactly what the student wrote'),
  correction: z.string().describe('The corrected version'),
  why: z.string().describe('Why, in one sentence'),
  example: z.string().describe('One more example sentence using the correct form'),
  category: z.enum(['grammar', 'vocabulary', 'collocation', 'preposition', 'article', 'tense', 'word order', 'register', 'spelling', 'punctuation', 'cohesion']),
});

export const FeedbackSchema = z.object({
  scores: z.object({
    content: Score,
    communicative: Score,
    organisation: Score,
    language: Score,
  }),
  summary: z.string().describe("Theo's overall comment in 2–3 sentences: honest, specific, warm"),
  topErrors: z.array(Correction).max(3).describe('The three errors that cost the most marks'),
  otherErrors: z.array(Correction).max(15).describe('Other errors worth fixing'),
  patterns: z.array(z.string()).describe('Patterns behind the errors, not individual mistakes'),
  strengths: z.array(z.string()).min(1).describe('What the student did well (always at least one)'),
  upgrades: z
    .array(z.object({ original: z.string(), c1: z.string(), note: z.string() }))
    .max(6)
    .describe('B2-sounding sentences from the text with a C1 alternative'),
  cohesion: z.object({
    comment: z.string().describe('Organisation and paragraph balance, in 1–3 sentences'),
    jumps: z.array(z.string()).describe('Places where the text jumps between ideas without a link'),
    connectors: z
      .array(z.object({ connector: z.string(), problem: z.string(), alternatives: z.array(z.string()) }))
      .describe('Overused or misused linking words, with C1 alternatives'),
  }),
  repetition: z
    .array(z.object({ word: z.string(), alternatives: z.array(z.string()), collocations: z.array(z.string()) }))
    .describe('For each repeated word: C1 synonyms and collocations that fit this text'),
  modelVersion: z.string().describe("A C1 version of the student's text keeping their ideas, 220–260 words"),
  rewrite: z.array(z.object({ original: z.string(), hint: z.string() })).max(3).describe('Three of their sentences to rewrite, with a hint'),
});

export type Feedback = z.infer<typeof FeedbackSchema>;
export type FeedbackCorrection = z.infer<typeof Correction>;

export const CRITERIA: { key: keyof Feedback['scores']; label: string; es: string }[] = [
  { key: 'content', label: 'Content', es: '¿Respondes a todo lo que pide el enunciado?' },
  { key: 'communicative', label: 'Communicative Achievement', es: 'Registro, formato y efecto en el lector' },
  { key: 'organisation', label: 'Organisation', es: 'Estructura, párrafos y conectores' },
  { key: 'language', label: 'Language', es: 'Variedad y precisión de gramática y vocabulario' },
];

export const total = (s: Feedback['scores']) => s.content + s.communicative + s.organisation + s.language;

/**
 * Nota orientativa en la escala Cambridge para UNA tarea (sobre 20), con la tabla oficial del Writing
 * (34/24/16/10 de 40 → 200/180/160/142): una tarea vale la mitad del paper.
 */
export function estimateScale(raw: number): number {
  return rawToScale('writing', Math.max(0, Math.min(20, raw)) * 2);
}

export function scaleLabel(scale: number): string {
  if (scale < 142) return 'por debajo de 142';
  return `≈ ${scale}`;
}

/** Lo que devuelve la IA al leer una foto de un writing a mano. */
export const OcrSchema = z.object({
  text: z.string().describe('The transcription, exactly as written, with paragraph breaks'),
  illegible: z.number().int().min(0).describe('How many words could not be read and were marked [?]'),
  confidence: z.enum(['high', 'medium', 'low']),
  note: z.string().describe('Short note about legibility, in Spanish'),
});
export type Ocr = z.infer<typeof OcrSchema>;
