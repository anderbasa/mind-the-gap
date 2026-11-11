// Grabaciones del Speaking (en el dispositivo) y resultados (en Firestore, nunca el audio).
import { IS_DEMO } from '../config';
import { store } from '../state';
import { audioCtx, blobToWav16k, floatToPcm16, pcm16ToWav } from '../voice/audio';
import { saveRecording } from '../voice/idb';
import { Recorder, type Recording } from '../voice/recorder';
import type { Assessment, AssessItem } from './ai';

/* ── Grabar ───────────────────────────────────────────────────── */

let current: Recorder | null = null;
let fakeStart = 0;

/** Empieza a grabar. En el modo demo, si no hay micro, simula una grabación. */
export async function startRecording(onLevel?: (v: number) => void): Promise<'mic' | 'fake'> {
  current = new Recorder();
  try {
    await current.start({ onLevel });
    return 'mic';
  } catch (e) {
    current = null;
    if (!IS_DEMO) throw e;
    fakeStart = performance.now();
    return 'fake';
  }
}

export async function stopRecording(): Promise<Recording> {
  if (current) {
    const r = await current.stop();
    current = null;
    return r;
  }
  // demo sin micro: silencio con la duración real
  const ms = Math.max(500, Math.round(performance.now() - fakeStart));
  const blob = pcm16ToWav(new Uint8Array(Math.round((ms / 1000) * 16000) * 2), 16000);
  return { blob, mimeType: 'audio/wav', durationMs: ms, method: 'wav' };
}

export function cancelRecording(): void {
  current?.cancel();
  current = null;
}

/** Une varias grabaciones (las intervenciones de una parte) en un solo WAV de 16 kHz, con 1 s entre ellas. */
export async function joinRecordings(recs: Recording[]): Promise<Blob> {
  if (recs.length === 1) return blobToWav16k(recs[0].blob);
  const ctx = audioCtx();
  const rate = ctx.sampleRate; // decodeAudioData lo devuelve todo a este ritmo
  const chunks: Float32Array[] = [];
  for (const r of recs) {
    const buf = await ctx.decodeAudioData((await r.blob.arrayBuffer()).slice(0));
    chunks.push(buf.getChannelData(0).slice(), new Float32Array(rate));
  }
  return pcm16ToWav(floatToPcm16(chunks, rate, 16000), 16000);
}

/** Guarda una grabación en este dispositivo (las 20 últimas) y devuelve su id. */
export async function keepRecording(blob: Blob, label: string, durationMs: number): Promise<string | undefined> {
  try {
    const r = await saveRecording({ blob, mimeType: blob.type || 'audio/wav', durationMs, label });
    return r.id;
  } catch {
    return undefined;
  }
}

/* ── Resultados ───────────────────────────────────────────────── */

export interface SpeakingItem extends AssessItem {
  recId?: string;
  durationMs: number;
}

export interface SpeakingDoc {
  mode: 'mock' | 'part' | 'long-turn' | 'conversation';
  title: string;
  testId?: string;
  scenario?: string;
  items: SpeakingItem[];
  assessment: Assessment;
  raw75: number;
  scale: number;
  model: string;
  at: number;
}

const clean = <T>(o: T): T => JSON.parse(JSON.stringify(o));

export async function saveSpeaking(doc: SpeakingDoc): Promise<string> {
  const id = await store().add('speakings', clean(doc) as unknown as Record<string, unknown>);
  for (const e of doc.assessment.errors) {
    void store()
      .add('errors', { kind: 'speaking', speakingId: id, category: e.category, yourAnswer: e.quote, correct: e.correction, explanation: e.why, example: e.example, at: Date.now() })
      .catch(() => undefined);
  }
  return id;
}

export async function listSpeakings(limit = 30): Promise<(SpeakingDoc & { id: string })[]> {
  return store().list<SpeakingDoc>('speakings', { orderBy: 'at', desc: true, limit });
}

/** Recursos C1 que de verdad usas, contados en tus últimos speakings. */
export function resourceTally(docs: SpeakingDoc[]): { resource: string; count: number; last: string }[] {
  const map = new Map<string, { resource: string; count: number; last: string }>();
  for (const d of docs) {
    for (const r of d.assessment.c1Resources) {
      const k = r.resource.toLowerCase().trim();
      const cur = map.get(k) ?? { resource: r.resource, count: 0, last: r.quote };
      cur.count++;
      map.set(k, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}
