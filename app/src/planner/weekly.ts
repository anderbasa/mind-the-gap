// Informe semanal: tus números de los últimos 7 días y el resumen de Theo (Gemini, gratis).
import { z } from 'zod';
import { runAI } from '../ai/client';
import { fill, getPrompt } from '../ai/prompts';
import { listCards } from '../srs/srs';
import { store } from '../state';

const WEEK = 7 * 86_400_000;

export interface WeekStats {
  from: number;
  to: number;
  sessions: number;
  minutesPlanned: number;
  tasksDone: number;
  rue: { n: number; pct: number | null };
  listening: { n: number; pct: number | null };
  writings: { n: number; avg20: number | null };
  speakings: { n: number; avgScale: number | null };
  cardsReviewed: number;
  mastered: number;
  errors: number;
  grammarDone: number;
  scores: { at: number; overall: number }[];
}

type Row = Record<string, unknown>;
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export async function weekStats(now = Date.now()): Promise<WeekStats> {
  const s = store();
  const from = now - WEEK;
  const [sessions, attempts, writings, speakings, errors, grammar, scores, cards] = await Promise.all([
    s.list<Row>('sessions', { limit: 14 }).catch(() => []),
    s.list<Row>('attempts', { orderBy: 'at', desc: true, limit: 300 }).catch(() => []),
    s.list<Row>('writings', { orderBy: 'createdAt', desc: true, limit: 20 }).catch(() => []),
    s.list<Row>('speakings', { orderBy: 'at', desc: true, limit: 20 }).catch(() => []),
    s.list<Row>('errors', { orderBy: 'at', desc: true, limit: 300 }).catch(() => []),
    s.list<Row>('grammar', { limit: 50 }).catch(() => []),
    s.list<Row>('scores', { orderBy: 'at', desc: true, limit: 6 }).catch(() => []),
    listCards().catch(() => []),
  ]);
  const inWeek = (t: unknown) => Number(t) >= from;
  const ses = sessions.filter((x) => inWeek(x.startedAt));
  const att = attempts.filter((a) => inWeek(a.at));
  const rue = att.filter((a) => a.kind === 'rue');
  const lis = att.filter((a) => a.kind === 'listening');
  const wr = writings.filter((w) => inWeek(w.createdAt));
  const sp = speakings.filter((x) => inWeek(x.at));
  return {
    from,
    to: now,
    sessions: ses.length,
    minutesPlanned: ses.reduce((a, x) => a + ((x.tasks as { minutes: number; done?: boolean }[]) ?? []).filter((t) => t.done).reduce((b, t) => b + t.minutes, 0), 0),
    tasksDone: ses.reduce((a, x) => a + ((x.tasks as { done?: boolean }[]) ?? []).filter((t) => t.done).length, 0),
    rue: { n: rue.length, pct: avg(rue.map((a) => Number(a.pct))) },
    listening: { n: lis.length, pct: avg(lis.map((a) => Number(a.pct))) },
    writings: { n: wr.length, avg20: avg(wr.map((w) => Number((w.versions as { raw?: number }[])?.at(-1)?.raw)).filter((x) => !Number.isNaN(x))) },
    speakings: { n: sp.length, avgScale: avg(sp.map((x) => Number(x.scale))) },
    cardsReviewed: cards.filter((c) => (c.fsrs.last_review ?? 0) >= from).length,
    mastered: cards.filter((c) => c.status === 'mastered').length,
    errors: errors.filter((e) => inWeek(e.at)).length,
    grammarDone: grammar.filter((g) => g.done).length,
    scores: scores.map((x) => ({ at: Number(x.at), overall: Number(x.overall) })).reverse(),
  };
}

export const ReportSchema = z.object({
  summary: z.string(),
  wins: z.array(z.string()).max(3),
  focus: z.array(z.string()).max(3),
  challenge: z.string(),
});
export type Report = z.infer<typeof ReportSchema> & { at: number };

/** Lunes de la semana (hora de Madrid), para guardar un informe por semana. */
export function weekKey(now = Date.now()): string {
  const d = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(now) + 'T12:00:00Z');
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

export async function getReport(): Promise<Report | null> {
  return store().get<Report>(`reports/week-${weekKey()}`);
}

export async function makeReport(st: WeekStats): Promise<Report> {
  const r = await runAI({
    task: 'weekly-report',
    system: fill(getPrompt('weekly-report').body, { data: JSON.stringify(st) }),
    messages: [{ role: 'user', parts: [{ text: 'Write my weekly report. Return only the JSON.' }] }],
    schema: ReportSchema,
    maxTokens: 1500,
    thinking: 'low',
    timeoutMs: 60_000,
    retries: 1,
  });
  const rep: Report = { ...r.data!, at: Date.now() };
  await store().set(`reports/week-${weekKey()}`, rep as unknown as Record<string, unknown>);
  return rep;
}
