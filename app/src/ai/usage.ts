// Contador de uso diario (users/{uid}/usage/{YYYY-MM-DD}) y gasto mensual.
import { hasStore, store } from '../state';
import { listCost, madridDay, realCost } from './pricing';
import { modelKey } from './providers';
import type { ModelRef, Usage } from './types';

export interface UsageRow {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  audioInputTokens: number;
  costUsd: number; // lo que se paga de verdad
  listUsd: number; // lo que costaría con tarifa de pago
}

export type UsageDay = { models?: Record<string, UsageRow>; total?: UsageRow; claudeUsd?: number };

const safeKey = (ref: ModelRef) => modelKey(ref).replace(/\./g, '_');

export async function recordUsage(ref: ModelRef, u: Usage, geminiTier: 'free' | 'paid'): Promise<number> {
  const day = madridDay();
  const cost = realCost(ref, u, day, geminiTier);
  const list = listCost(ref, u, day);
  if (!hasStore()) return cost;
  const s = store();
  const row = {
    requests: s.inc(1),
    inputTokens: s.inc(u.inputTokens),
    outputTokens: s.inc(u.outputTokens),
    audioInputTokens: s.inc(u.audioInputTokens),
    costUsd: s.inc(cost),
    listUsd: s.inc(list),
  };
  await s.set(
    `usage/${day}`,
    { models: { [safeKey(ref)]: row }, total: row, ...(ref.provider === 'claude' ? { claudeUsd: s.inc(cost) } : {}), day },
    { merge: true },
  );
  monthCache = null;
  return cost;
}

let monthCache: { month: string; claude: number; at: number } | null = null;

/** Gasto en Claude en el mes actual (hora de Madrid). */
export async function claudeSpentThisMonth(): Promise<number> {
  const month = madridDay().slice(0, 7);
  if (monthCache && monthCache.month === month && Date.now() - monthCache.at < 60_000) return monthCache.claude;
  if (!hasStore()) return 0;
  const days = await store().list<UsageDay>('usage', { where: [['day', '>=', `${month}-01`], ['day', '<=', `${month}-31`]] });
  const claude = days.reduce((s, d) => s + (d.claudeUsd ?? 0), 0);
  monthCache = { month, claude, at: Date.now() };
  return claude;
}

export async function usageForDays(n: number): Promise<(UsageDay & { id: string })[]> {
  if (!hasStore()) return [];
  return store().list<UsageDay>('usage', { orderBy: 'day', desc: true, limit: n });
}
