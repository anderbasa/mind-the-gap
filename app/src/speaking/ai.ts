// IA del Speaking: escuchar una grabación (gratis, Gemini), evaluar (Gemini gratis o Claude si lo
// eliges y confirmas), «Help» y la respuesta del personaje en la conversación por turnos.
import { z } from 'zod';
import { runAI } from '../ai/client';
import { buildSystem, fill, getPrompt } from '../ai/prompts';
import { claudeSpentThisMonth } from '../ai/usage';
import { profile, settings } from '../state';
import { blobToBase64, blobToWav16k } from '../voice/audio';
import { speakingScale, speechMetrics, type SpeechMetrics } from './schema';

/* ── Escuchar ─────────────────────────────────────────────────── */

export const ListenSchema = z.object({
  transcript: z.string(),
  pronunciation: z.object({
    comment: z.string(),
    issues: z.array(z.object({ word: z.string(), heard: z.string(), tip: z.string() })).max(6),
    strengths: z.array(z.string()).max(3),
  }),
});
export type Listened = z.infer<typeof ListenSchema>;

export interface HeardItem extends Listened {
  metrics: SpeechMetrics;
}

export async function listenRecording(blob: Blob, durationMs: number, prompt: string, signal?: AbortSignal): Promise<HeardItem> {
  const wav = await blobToWav16k(blob);
  const data = await blobToBase64(wav);
  const r = await runAI({
    task: 'transcribe',
    system: fill(getPrompt('speaking-listen').body, { prompt }),
    messages: [{ role: 'user', parts: [{ inline: { mimeType: 'audio/wav', data } }, { text: 'Listen and return the JSON.' }] }],
    schema: ListenSchema,
    maxTokens: 4000,
    thinking: 'low',
    timeoutMs: 120_000,
    retries: 1,
    signal,
  });
  return { ...r.data!, metrics: speechMetrics(r.data!.transcript, durationMs) };
}

/* ── Evaluar ───────────────────────────────────────────────────── */

const Score = z.number().int().min(0).max(5);
export const AssessSchema = z.object({
  scores: z.object({ grammar: Score, vocabulary: Score, discourse: Score, pronunciation: Score, interaction: Score, global: Score }),
  summary: z.string(),
  errors: z
    .array(
      z.object({
        quote: z.string(),
        correction: z.string(),
        why: z.string(),
        example: z.string(),
        category: z.enum(['grammar', 'vocabulary', 'collocation', 'preposition', 'article', 'tense', 'word order', 'register', 'pronunciation']),
      }),
    )
    .max(10),
  sayItBetter: z.array(z.object({ original: z.string(), better: z.string(), note: z.string() })).max(6),
  c1Resources: z.array(z.object({ resource: z.string(), quote: z.string() })).max(10),
  missedResources: z.array(z.string()).max(5),
  fluency: z.string(),
  interaction: z.string(),
  nextFocus: z.string(),
});
export type Assessment = z.infer<typeof AssessSchema>;

export const SPEAKING_CRITERIA: { key: keyof Assessment['scores']; label: string; es: string }[] = [
  { key: 'grammar', label: 'Grammatical Resource', es: 'Variedad y control de la gramática' },
  { key: 'vocabulary', label: 'Lexical Resource', es: 'Vocabulario preciso y variado' },
  { key: 'discourse', label: 'Discourse Management', es: 'Hablar seguido, organizado y conectado' },
  { key: 'pronunciation', label: 'Pronunciation', es: 'Sonidos, acento de palabra y entonación' },
  { key: 'interaction', label: 'Interactive Communication', es: 'Iniciar, responder y llevar la conversación' },
  { key: 'global', label: 'Global Achievement', es: 'Impresión general como hablante C1' },
];

export interface AssessItem {
  label: string;
  prompt: string;
  transcript: string;
  metrics: SpeechMetrics;
  pronunciation?: Listened['pronunciation'];
}

function itemsForPrompt(items: AssessItem[]): string {
  return items
    .map((it, i) =>
      [
        `--- ${i + 1}. ${it.label}`,
        `Task: ${it.prompt}`,
        `Metrics: ${it.metrics.words} words in ${it.metrics.seconds} s (${it.metrics.wpm} wpm), fillers ${it.metrics.fillerTotal}, long pauses ${it.metrics.pauses}${it.metrics.spanish ? `, Spanish used ${it.metrics.spanish} time(s)` : ''}.`,
        it.pronunciation ? `Pronunciation notes: ${it.pronunciation.comment} Issues: ${it.pronunciation.issues.map((x) => `${x.word} (${x.heard})`).join(', ') || 'none'}.` : '',
        `Student said: """${it.transcript || '(nothing)'}"""`,
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n');
}

export const EST_CLAUDE_SPEAKING_USD = 0.06;

export async function confirmPaidSpeaking(): Promise<boolean> {
  const cfg = settings.value;
  const spent = await claudeSpentThisMonth().catch(() => 0);
  if (spent + EST_CLAUDE_SPEAKING_USD > cfg.claudeMonthlyCapUsd) {
    alert(`Pasarías tu tope mensual de Claude (${cfg.claudeMonthlyCapUsd} $; llevas ${spent.toFixed(2)} $). Evalúa gratis con Gemini.`);
    return false;
  }
  return confirm(
    `Esta evaluación usará Claude y costará unos ${EST_CLAUDE_SPEAKING_USD.toFixed(2).replace('.', ',')} $.\n\nEste mes llevas ${spent.toFixed(2).replace('.', ',')} $ de ${cfg.claudeMonthlyCapUsd} $. ¿Seguir?`,
  );
}

export async function assessSpeaking(mode: string, items: AssessItem[], paid: boolean): Promise<{ assessment: Assessment; raw75: number; scale: number; model: string }> {
  const system = buildSystem({ profile: profile.value! }, 'speaking-assess', { mode, items: itemsForPrompt(items) });
  const r = await runAI({
    task: 'assess-speaking',
    system,
    messages: [{ role: 'user', parts: [{ text: 'Assess my speaking. Return only the JSON.' }] }],
    schema: AssessSchema,
    maxTokens: 12000,
    thinking: 'low',
    effort: 'medium',
    timeoutMs: 150_000,
    retries: 1,
    allowPaid: paid,
  });
  const a = r.data!;
  const { raw75, scale } = speakingScale(a.scores);
  return { assessment: a, raw75, scale, model: r.model.model };
}

/* ── Help ─────────────────────────────────────────────────────── */

export const HelpSchema = z.object({ phrase: z.string(), example: z.string(), es: z.string() });
export type Help = z.infer<typeof HelpSchema>;

export async function helpPhrase(context: string, said: string, hint: string): Promise<Help> {
  const r = await runAI({
    task: 'chat',
    system: fill(getPrompt('speaking-help').body, { context, said: said || '(nothing yet)', hint: hint || '(none)' }),
    messages: [{ role: 'user', parts: [{ text: 'Help me. Return only the JSON.' }] }],
    schema: HelpSchema,
    maxTokens: 400,
    timeoutMs: 30_000,
  });
  return r.data!;
}

/* ── Respuesta del personaje (conversación por turnos) ──────────── */

export async function characterReply(vars: { scenario: string; role: string; goal: string; twist: string; turns: string }, history: { who: 'you' | 'theo'; text: string }[]): Promise<string> {
  const r = await runAI({
    task: 'roleplay',
    system: fill(getPrompt('speaking-reply').body, {
      ...vars,
      history: history.map((h) => `${h.who === 'you' ? 'STUDENT' : 'YOU'}: ${h.text}`).join('\n') || '(you speak first)',
    }),
    messages: [{ role: 'user', parts: [{ text: 'Your turn.' }] }],
    maxTokens: 300,
    timeoutMs: 30_000,
  });
  return r.text.trim().replace(/^["“]|["”]$/g, '');
}
