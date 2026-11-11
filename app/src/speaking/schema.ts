// Banco del Speaking (examinador con guion fijo, compañero semiguionizado) y métricas del habla.
import { z } from 'zod';
import { speakingLines, speakingUnitOf, type SpeakingLine } from '../listening/ttsCore';

const Speaker = z.object({ id: z.string(), name: z.string(), gender: z.enum(['female', 'male']), accent: z.string() });
const Photo = z.object({ query: z.string(), alt: z.string() });

export const SpeakingBank = z.object({
  examiner: Speaker,
  frame: z.object({ p1Start: z.string(), p2Start: z.string(), p3Go: z.string(), p4Start: z.string(), thanks: z.string(), end: z.string() }),
  p1: z.array(z.object({ id: z.string(), topic: z.string(), questions: z.array(z.object({ id: z.string(), text: z.string() })).min(3) })).min(4),
  tests: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        partner: Speaker,
        intro: z.string(),
        p2: z.object({
          studentIntro: z.string(),
          studentQuestions: z.array(z.string()).length(2),
          studentPhotos: z.array(Photo).length(3),
          partnerQuestion: z.string(),
          partnerAnswer: z.string(),
          partnerIntro: z.string(),
          partnerQuestions: z.array(z.string()).length(2),
          partnerPhotos: z.array(Photo).length(3),
          partnerLongTurn: z.string(),
          studentQuestion: z.string(),
        }),
        p3: z.object({
          intro: z.string(),
          question: z.string(),
          prompts: z.array(z.string()).length(5),
          partnerLines: z.array(z.string()).min(3),
          decision: z.string(),
          decisionLines: z.array(z.string()).min(1),
        }),
        p4: z.array(z.object({ q: z.string(), partner: z.string().optional() })).min(4),
      }),
    )
    .min(1),
});
export type SpeakingBankT = z.infer<typeof SpeakingBank>;
export type SpeakingTest = SpeakingBankT['tests'][number];
export type PhotoT = z.infer<typeof Photo>;

let cache: SpeakingBankT | null = null;

export async function loadSpeakingBank(): Promise<SpeakingBankT | null> {
  if (cache) return cache;
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}bank/speaking/bank.json`);
    const p = SpeakingBank.safeParse(await r.json());
    if (!p.success) {
      console.warn('[speaking] banco no válido', p.error.issues[0]);
      return null;
    }
    cache = p.data;
    return cache;
  } catch {
    return null;
  }
}

/** Todas las frases con voz, por id (p. ej. «ta-p2-sa»). */
export function linesById(bank: SpeakingBankT): Map<string, SpeakingLine> {
  return new Map(speakingLines(bank).map((l) => [l.id, l]));
}

export { speakingUnitOf };
export type { SpeakingLine };

/* ── Métricas a partir de la transcripción literal ──────────────── */

const FILLERS = ['um', 'umm', 'uh', 'uhm', 'er', 'erm', 'eh', 'you know', 'i mean', 'sort of', 'kind of', 'basically', 'actually', 'like, ', 'well, '];

export interface SpeechMetrics {
  words: number;
  seconds: number;
  wpm: number;
  fillers: { word: string; count: number }[];
  fillerTotal: number;
  pauses: number;
  spanish: number;
}

export function speechMetrics(transcript: string, durationMs: number): SpeechMetrics {
  const t = ` ${transcript.toLowerCase().replace(/[’]/g, "'")} `;
  const pauses = (t.match(/\[pause\]/g) ?? []).length;
  const spanish = (t.match(/\[es:/g) ?? []).length;
  const clean = t.replace(/\[[^\]]*\]/g, ' ');
  const words = (clean.match(/[a-z][a-z'-]*/g) ?? []).length;
  const fillers = FILLERS.map((f) => {
    const pat = f.endsWith(', ') ? f.replace(', ', ',') : f;
    const re = new RegExp(`(^|[^a-z'])${pat.replace(/ /g, '\\s+').replace(',', '\\s*,')}(?=[^a-z']|$)`, 'g');
    return { word: f.replace(/, $/, ''), count: (clean.match(re) ?? []).length };
  }).filter((x) => x.count > 0);
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  return {
    words,
    seconds,
    wpm: Math.round(words / (seconds / 60)),
    fillers,
    fillerTotal: fillers.reduce((a, b) => a + b.count, 0),
    pauses,
    spanish,
  };
}

/** Lectura rápida del ritmo para mostrar al alumno. */
export function paceLabel(wpm: number): string {
  if (wpm < 90) return 'lento: te cuesta arrancar o haces muchas pausas';
  if (wpm < 120) return 'algo lento para C1';
  if (wpm <= 170) return 'ritmo natural';
  return 'muy rápido: cuidado con la claridad';
}

/* ── Nota orientativa ───────────────────────────────────────────── */

/**
 * Seis notas de 0 a 5 (gramática, vocabulario, discurso, pronunciación, interacción y global)
 * → sobre 75 → escala Cambridge con las anclas del documento oficial de conversión
 * (Speaking: 66 → 200, 45 → 180, 30 → 160). Orientativa hasta calibrarla en la Fase 7.
 */
const ANCHORS: [number, number][] = [
  [0, 100],
  [30, 160],
  [45, 180],
  [66, 200],
  [75, 210],
];

export function speakingScale(scores: number[]): { raw75: number; scale: number } {
  const sum = scores.reduce((a, b) => a + b, 0);
  const raw75 = Math.round((sum / (scores.length * 5)) * 75);
  let scale = 210;
  for (let i = 1; i < ANCHORS.length; i++) {
    const [x0, y0] = ANCHORS[i - 1];
    const [x1, y1] = ANCHORS[i];
    if (raw75 <= x1) {
      scale = Math.round(y0 + ((raw75 - x0) / (x1 - x0)) * (y1 - y0));
      break;
    }
  }
  return { raw75, scale };
}
