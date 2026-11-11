// Banco de Listening: sets, dictados, inglés hablado real y sus audios.
// Audio: primero el mp3 del banco (generado una vez en GitHub); si aún no existe,
// se puede generar en este dispositivo con la cuota gratuita (y se guarda aquí).
import { classifyGeminiError } from '../ai/retry';
import { AiError } from '../ai/types';
import { workerFetch, workerJson } from '../ai/worker';
import { hasStore, store } from '../state';
import { getCached, putCached } from '../voice/idb';
import { Connected, Dictation, ListeningSet, type ConnectedT, type DictationT, type ListeningSetT, type LPart } from './schema';
import {
  audioFromInteraction,
  decodeAudio,
  encodeWav,
  pickVoices,
  planChunks,
  renderUnit,
  TTS_MODELS,
  unitHash,
  type Manifest,
  type TtsCall,
  type UnitSpec,
  type VoiceInfo,
} from './ttsCore';

const BASE = () => `${import.meta.env.BASE_URL}bank/listening/`;

async function getJson<T>(file: string): Promise<T | null> {
  try {
    const r = await fetch(BASE() + file);
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

let setsCache: ListeningSetT[] | null = null;

export async function loadSets(): Promise<ListeningSetT[]> {
  if (setsCache) return setsCache;
  const index = (await getJson<string[]>('index.json')) ?? [];
  const raw = await Promise.all(index.map((f) => getJson<unknown>(f)));
  const out: ListeningSetT[] = [];
  raw.forEach((x, i) => {
    const p = ListeningSet.safeParse(x);
    if (p.success) out.push(p.data);
    else console.warn('[listening] set no válido', index[i], p.error.issues[0]);
  });
  setsCache = out;
  return out;
}

export async function loadDictation(): Promise<DictationT[]> {
  const raw = (await getJson<unknown[]>('dictation.json')) ?? [];
  return raw.map((x) => Dictation.safeParse(x)).flatMap((p) => (p.success ? [p.data] : []));
}

export async function loadConnected(): Promise<ConnectedT[]> {
  const raw = (await getJson<unknown[]>('connected.json')) ?? [];
  return raw.map((x) => Connected.safeParse(x)).flatMap((p) => (p.success ? [p.data] : []));
}

let manifestCache: Manifest | null = null;

export async function loadManifest(): Promise<Manifest> {
  if (manifestCache) return manifestCache;
  manifestCache = (await getJson<Manifest>('audio/manifest.json')) ?? { version: 1, units: {} };
  return manifestCache;
}

/* ── Audio de una pieza ─────────────────────────────────────────── */

export interface UnitAudio {
  url: string;
  turns: [number, number][];
  duration: number;
  source: 'bank' | 'device';
}

interface DeviceAudio {
  blob: Blob;
  turns: [number, number][];
  duration: number;
}

const urls = new Map<string, string>();

function objectUrl(key: string, blob: Blob): string {
  const cur = urls.get(key);
  if (cur) return cur;
  const u = URL.createObjectURL(blob);
  urls.set(key, u);
  return u;
}

/** El audio listo para sonar, o null si todavía no existe (ni en el banco ni en este dispositivo). */
export async function unitAudio(unit: UnitSpec): Promise<UnitAudio | null> {
  const hash = await unitHash(unit);
  const m = await loadManifest();
  const e = m.units[unit.id];
  if (e && e.hash === hash) {
    const key = `bank-${e.file}`;
    let blob = await getCached<Blob>(key).catch(() => undefined);
    if (!blob) {
      const r = await fetch(`${BASE()}audio/${e.file}`).catch(() => null);
      if (r?.ok) {
        blob = await r.blob();
        await putCached(key, blob).catch(() => undefined);
      }
    }
    if (blob) return { url: objectUrl(key, blob), turns: e.turns, duration: e.duration, source: 'bank' };
  }
  const dev = await getCached<DeviceAudio>(`dev-${unit.id}-${hash}`).catch(() => undefined);
  if (dev) return { url: objectUrl(`dev-${unit.id}-${hash}`, dev.blob), turns: dev.turns, duration: dev.duration, source: 'device' };
  return null;
}

export async function hasBankAudio(unit: UnitSpec): Promise<boolean> {
  const m = await loadManifest();
  return m.units[unit.id]?.hash === (await unitHash(unit));
}

let catalog: VoiceInfo[] | null = null;

async function voiceCatalog(): Promise<VoiceInfo[]> {
  if (catalog) return catalog;
  try {
    const q = ['en-GB', 'en-US', 'en-AU', 'en-IE', 'en-CA', 'en-NZ'].map((l) => `language_code=${l}`).join('&');
    const r = await workerFetch(`/gemini/voices?${q}&page_size=1000`);
    const j = (await r.json()) as { voices?: { id?: string; name?: string; accent?: string; gender?: string; language_code?: string | string[] }[] };
    catalog = r.ok ? (j.voices ?? []).map((v) => ({ id: v.id ?? v.name ?? '', accent: v.accent, gender: v.gender, language_code: v.language_code })) : [];
  } catch {
    catalog = [];
  }
  return catalog;
}

/** Modelo de voz que se está usando en este dispositivo (pasa al siguiente si se agota la cuota). */
let modelIdx = 0;

/** Una petición de voz a través del Worker: reintentos y cambio de modelo al agotar la cuota diaria. */
const deviceTts: TtsCall = async (build) => {
  let tries = 0;
  for (;;) {
    const model = TTS_MODELS[modelIdx];
    const { res, json } = await workerJson<unknown>('/gemini/interactions', build(model), undefined, 150_000);
    if (res.ok) {
      const a = audioFromInteraction(json);
      if (!a) throw new AiError('invalid-output', 'Gemini no ha devuelto audio.');
      const bin = atob(a.data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return decodeAudio(bytes, a.mime);
    }
    const err = classifyGeminiError(res.status, json, res.headers.get('retry-after'));
    if (err.kind === 'quota-day' && modelIdx < TTS_MODELS.length - 1) {
      modelIdx++;
      continue;
    }
    if ((err.kind === 'rate' || err.kind === 'overloaded') && ++tries < 3) {
      await new Promise((r) => setTimeout(r, err.opts.retryAfterMs ?? 8000 * tries));
      continue;
    }
    throw err;
  }
};

/** Genera el audio en este dispositivo (gratis, cuota de Gemini) y lo guarda aquí. */
export async function renderOnDevice(unit: UnitSpec, onProgress?: (done: number, total: number) => void): Promise<UnitAudio> {
  const hash = await unitHash(unit);
  const voices = pickVoices(unit.speakers, await voiceCatalog());
  const total = planChunks(unit).length;
  let done = 0;
  onProgress?.(0, total);
  const counted: TtsCall = async (build) => {
    const out = await deviceTts(build);
    onProgress?.(++done, total);
    return out;
  };
  const r = await renderUnit(unit, voices, counted, (e) => e instanceof AiError && e.kind === 'bad-request');
  const wav = encodeWav(r.pcm, r.rate);
  const blob = new Blob([wav as BlobPart], { type: 'audio/wav' });
  const dev: DeviceAudio = { blob, turns: r.turns, duration: Math.round((r.pcm.length / r.rate) * 100) / 100 };
  await putCached(`dev-${unit.id}-${hash}`, dev).catch(() => undefined);
  return { url: objectUrl(`dev-${unit.id}-${hash}`, blob), turns: r.turns, duration: dev.duration, source: 'device' };
}

/* ── Progreso ───────────────────────────────────────────────────── */

export interface LProgress {
  seen: Set<string>;
  best: Record<string, number>;
}

export async function listeningProgress(): Promise<LProgress> {
  const out: LProgress = { seen: new Set(), best: {} };
  if (!hasStore()) return out;
  const rows = await store()
    .list<{ setId: string; pct: number }>('attempts', { where: [['kind', '==', 'listening']] })
    .catch(() => []);
  for (const r of rows) {
    out.seen.add(r.setId);
    out.best[r.setId] = Math.max(out.best[r.setId] ?? 0, r.pct ?? 0);
  }
  return out;
}

/** El set pedido; si no, el primero sin hacer; si están todos hechos, otro distinto del último. */
export function pickSet(sets: ListeningSetT[], part: LPart, progress: LProgress, wanted?: string | null, exclude?: string): ListeningSetT | null {
  const ofPart = sets.filter((s) => s.part === part);
  if (wanted) return ofPart.find((s) => s.id === wanted) ?? null;
  const others = ofPart.filter((s) => s.id !== exclude);
  return others.find((s) => !progress.seen.has(s.id)) ?? others[0] ?? ofPart[0] ?? null;
}
