// Banco de ejercicios: semilla escrita a mano (en el repo, sirve sin conexión)
// + ejercicios generados y validados por la IA (Firestore, con caché en el dispositivo).
import { hasStore, store } from '../state';
import { parseSet, PART_IDS, type PartId, type RueSet } from './schema';

export interface Progress {
  seen: Record<string, number>; // id → última vez
  best: Record<string, number>; // id → mejor % (0–100)
  reported: Record<string, boolean>;
}

const EMPTY: Progress = { seen: {}, best: {}, reported: {} };
const PROGRESS_DOC = 'meta/rue';

let seedCache: Promise<RueSet[]> | null = null;

export function loadSeeds(): Promise<RueSet[]> {
  if (!seedCache) {
    seedCache = fetch(`${import.meta.env.BASE_URL}bank/rue/seed.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then((raw: unknown[]) => raw.map(parseSet).filter((x): x is RueSet => x !== null))
      .catch(() => {
        seedCache = null;
        return [];
      });
  }
  return seedCache;
}

export async function loadAiSets(part?: PartId): Promise<RueSet[]> {
  if (!hasStore()) return [];
  const rows = await store().list<Record<string, unknown>>('exercises', part ? { where: [['part', '==', part]] } : {});
  return rows.map((r) => parseSet(r)).filter((x): x is RueSet => x !== null);
}

export async function allSets(part?: PartId): Promise<RueSet[]> {
  const [seeds, ai] = await Promise.all([loadSeeds(), loadAiSets(part)]);
  return [...seeds.filter((s) => !part || s.part === part), ...ai];
}

export async function getSet(id: string): Promise<RueSet | null> {
  const seeds = await loadSeeds();
  const seed = seeds.find((s) => s.id === id);
  if (seed) return seed;
  if (!hasStore()) return null;
  return parseSet(await store().get(`exercises/${id}`));
}

export async function getProgress(): Promise<Progress> {
  if (!hasStore()) return EMPTY;
  const p = await store().get<Partial<Progress>>(PROGRESS_DOC);
  return { seen: p?.seen ?? {}, best: p?.best ?? {}, reported: p?.reported ?? {} };
}

/** Siguiente ejercicio: primero los no hechos; si no quedan, el que hace más que no ves. */
export function pickNext(sets: RueSet[], progress: Progress, part: PartId): { set: RueSet | null; fresh: boolean } {
  const pool = sets.filter((s) => s.part === part && !progress.reported[s.id]);
  const unseen = pool.filter((s) => !progress.seen[s.id]);
  if (unseen.length) {
    // los escritos a mano primero, luego por antigüedad
    unseen.sort((a, b) => (a.source === b.source ? a.createdAt - b.createdAt : a.source === 'seed' ? -1 : 1));
    return { set: unseen[0], fresh: true };
  }
  const old = [...pool].sort((a, b) => (progress.seen[a.id] ?? 0) - (progress.seen[b.id] ?? 0));
  return { set: old[0] ?? null, fresh: false };
}

export function countUnseen(sets: RueSet[], progress: Progress): Record<PartId, { total: number; unseen: number }> {
  const out = Object.fromEntries(PART_IDS.map((p) => [p, { total: 0, unseen: 0 }])) as Record<PartId, { total: number; unseen: number }>;
  for (const s of sets) {
    if (progress.reported[s.id]) continue;
    out[s.part].total++;
    if (!progress.seen[s.id]) out[s.part].unseen++;
  }
  return out;
}

export async function markDone(id: string, pct: number): Promise<void> {
  if (!hasStore()) return;
  const prev = (await getProgress()).best[id] ?? 0;
  await store().set(PROGRESS_DOC, { seen: { [id]: Date.now() }, best: { [id]: Math.max(prev, Math.round(pct)) } }, { merge: true });
}

export async function reportSet(set: RueSet, reason: string, n?: number): Promise<void> {
  await store().add('reports', { exerciseId: set.id, part: set.part, source: set.source, n: n ?? null, reason, at: Date.now() });
  await store().set(PROGRESS_DOC, { reported: { [set.id]: true } }, { merge: true });
}

export async function saveAiSet(set: RueSet): Promise<void> {
  await store().set(`exercises/${set.id}`, set as unknown as Record<string, unknown>);
}
