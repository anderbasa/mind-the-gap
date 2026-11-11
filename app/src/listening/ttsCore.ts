// Núcleo de audio de los listenings, sin dependencias: lo usan la app (respaldo en el
// dispositivo) y scripts/render-listening.mjs (GitHub Actions). Gemini TTS por la API de Interactions.
// Ojo: Node lo importa quitando los tipos, así que aquí solo vale TypeScript «borrable» (sin enums).

export const TTS_MODEL = 'gemini-3.8-flash-tts';
export const RATE = 24000;
/** Cambiar este número obliga a regenerar todos los audios. */
export const RENDER_VERSION = 1;

export type Gender = 'female' | 'male';
export interface SpeakerSpec {
  id: string;
  name: string;
  gender: Gender;
  accent: string; // British, American, Australian, Irish, Scottish…
}
export interface TurnSpec {
  s: string;
  text: string;
  style?: string;
}
export interface UnitSpec {
  id: string;
  speakers: SpeakerSpec[];
  turns: TurnSpec[];
  /** Estilo por defecto de todas las intervenciones. */
  style?: string;
  /** Silencio entre intervenciones (ms). */
  gapMs?: number;
}

export interface VoiceInfo {
  id: string;
  accent?: string;
  gender?: string;
  language_code?: string | string[];
}

/* ── Petición y respuesta de Gemini TTS ─────────────────────────── */

export function interactionBody(text: string, voice: string, style?: string, model = TTS_MODEL): Record<string, unknown> {
  return {
    model,
    input: [
      {
        type: 'user_input',
        content: [{ type: 'text', text, ...(style ? { annotations: [{ type: 'speech_metadata', style }] } : {}) }],
      },
    ],
    response_format: { type: 'audio', mime_type: 'audio/wav', sample_rate: RATE },
    generation_config: { speech_config: [{ voice }] },
  };
}

interface InteractionResponse {
  steps?: { type?: string; content?: { type?: string; data?: string; mime_type?: string; mimeType?: string }[] }[];
  usage?: Record<string, number>;
}

/** El audio (base64) de la respuesta: steps[] → model_output → content[] → audio. */
export function audioFromInteraction(json: unknown): { data: string; mime: string } | null {
  const steps = (json as InteractionResponse)?.steps ?? [];
  for (const st of [...steps].reverse()) {
    for (const c of st.content ?? []) {
      if (c.data && (c.type === 'audio' || /audio/.test(c.mime_type ?? c.mimeType ?? ''))) return { data: c.data, mime: c.mime_type ?? c.mimeType ?? 'audio/wav' };
    }
  }
  return null;
}

/* ── PCM y WAV ──────────────────────────────────────────────────── */

/** Lee un WAV PCM de 16 bits (o PCM sin cabecera) y devuelve las muestras. */
export function decodeAudio(bytes: Uint8Array, mime = 'audio/wav'): { rate: number; pcm: Int16Array } {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const isRiff = bytes.length > 12 && String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === 'RIFF';
  if (!isRiff) {
    const rate = Number(/rate=(\d+)/.exec(mime)?.[1] ?? RATE);
    const n = Math.floor(bytes.length / 2);
    const pcm = new Int16Array(n);
    // audio/l16 es big-endian por definición; Gemini lo devuelve little-endian en la práctica
    const bigEndian = /l16/i.test(mime) && /endian=big/i.test(mime);
    for (let i = 0; i < n; i++) pcm[i] = dv.getInt16(i * 2, !bigEndian);
    return { rate, pcm };
  }
  let off = 12;
  let rate = RATE;
  let channels = 1;
  while (off + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
    let size = dv.getUint32(off + 4, true);
    if (id === 'fmt ') {
      channels = dv.getUint16(off + 10, true);
      rate = dv.getUint32(off + 12, true);
    } else if (id === 'data') {
      if (size === 0 || size === 0xffffffff || off + 8 + size > bytes.length) size = bytes.length - off - 8; // cabecera de streaming
      const frames = Math.floor(size / 2 / channels);
      const pcm = new Int16Array(frames);
      for (let i = 0; i < frames; i++) pcm[i] = dv.getInt16(off + 8 + i * 2 * channels, true); // si es estéreo, canal izquierdo
      return { rate, pcm };
    }
    off += 8 + size + (size % 2);
  }
  throw new Error('WAV sin datos de audio');
}

/** Recorta el silencio del principio y del final (para que las pausas las pongamos nosotros). */
export function trimSilence(pcm: Int16Array, threshold = 300, keepMs = 60, rate = RATE): Int16Array {
  let a = 0;
  let b = pcm.length - 1;
  while (a < b && Math.abs(pcm[a]) < threshold) a++;
  while (b > a && Math.abs(pcm[b]) < threshold) b--;
  const keep = Math.round((keepMs / 1000) * rate);
  return pcm.subarray(Math.max(0, a - keep), Math.min(pcm.length, b + keep + 1));
}

/** Une los trozos con silencios entre ellos y devuelve dónde empieza y acaba cada uno (segundos). */
export function joinSegments(segs: Int16Array[], gapMs: number, rate = RATE, leadMs = 300): { pcm: Int16Array; turns: [number, number][] } {
  const gap = Math.round((gapMs / 1000) * rate);
  const lead = Math.round((leadMs / 1000) * rate);
  const total = lead * 2 + segs.reduce((s, x) => s + x.length, 0) + gap * Math.max(0, segs.length - 1);
  const pcm = new Int16Array(total);
  const turns: [number, number][] = [];
  let at = lead;
  segs.forEach((s, i) => {
    pcm.set(s, at);
    turns.push([round2(at / rate), round2((at + s.length) / rate)]);
    at += s.length + (i < segs.length - 1 ? gap : 0);
  });
  return { pcm, turns };
}

const round2 = (x: number) => Math.round(x * 100) / 100;

export function encodeWav(pcm: Int16Array, rate = RATE): Uint8Array {
  const out = new Uint8Array(44 + pcm.length * 2);
  const dv = new DataView(out.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => (out[o + i] = c.charCodeAt(0)));
  w(0, 'RIFF');
  dv.setUint32(4, 36 + pcm.length * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true);
  dv.setUint32(28, rate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  w(36, 'data');
  dv.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) dv.setInt16(44 + i * 2, pcm[i], true);
  return out;
}

/* ── Voces y acentos ────────────────────────────────────────────── */

/** Voces de serie por si el catálogo de acentos no está disponible. */
export const PREBUILT: Record<Gender, string[]> = {
  female: ['Kore', 'Leda', 'Aoede', 'Despina', 'Erinome', 'Laomedeia', 'Achernar', 'Gacrux', 'Sulafat'],
  male: ['Charon', 'Puck', 'Fenrir', 'Orus', 'Iapetus', 'Algieba', 'Schedar', 'Achird', 'Sadaltager'],
};

const LOCALE: Record<string, string> = {
  british: 'en-GB',
  scottish: 'en-GB',
  american: 'en-US',
  canadian: 'en-CA',
  australian: 'en-AU',
  irish: 'en-IE',
  'new zealand': 'en-NZ',
  'south african': 'en-ZA',
};

export const localeFor = (accent: string) => LOCALE[accent.toLowerCase()] ?? 'en-GB';

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const langs = (v: VoiceInfo) => (Array.isArray(v.language_code) ? v.language_code : v.language_code ? [v.language_code] : []).map((x) => x.toLowerCase());

/**
 * Asigna una voz distinta a cada hablante: primero del catálogo con su acento y género,
 * después del mismo idioma regional y, si no hay catálogo, una voz de serie.
 * Es determinista: el mismo guion siempre suena con las mismas voces.
 */
export function pickVoices(speakers: SpeakerSpec[], catalog: VoiceInfo[]): Record<string, { voice: string; library: boolean }> {
  const used = new Set<string>();
  const out: Record<string, { voice: string; library: boolean }> = {};
  for (const sp of speakers) {
    const g = sp.gender;
    const acc = sp.accent.toLowerCase();
    const loc = localeFor(sp.accent).toLowerCase();
    const sameGender = catalog.filter((v) => (v.gender ?? '').toLowerCase() === g && !used.has(v.id));
    const byAccent = sameGender.filter((v) => (v.accent ?? '').toLowerCase().includes(acc));
    const byLocale = sameGender.filter((v) => langs(v).includes(loc));
    const pool = (byAccent.length ? byAccent : byLocale).slice().sort((a, b) => a.id.localeCompare(b.id));
    if (pool.length) {
      const v = pool[hashStr(sp.name + sp.accent) % pool.length];
      used.add(v.id);
      out[sp.id] = { voice: v.id, library: true };
      continue;
    }
    const pre = PREBUILT[g].filter((v) => !used.has(v));
    const v = pre[hashStr(sp.name) % pre.length] ?? PREBUILT[g][0];
    used.add(v);
    out[sp.id] = { voice: v, library: false };
  }
  return out;
}

/** Estilo de una intervención. Con voz de serie (sin acento propio) se pide el acento en el estilo. */
export function styleFor(unit: UnitSpec, turn: TurnSpec, sp: SpeakerSpec | undefined, library: boolean): string {
  const parts = [turn.style ?? unit.style ?? 'natural, conversational, at a normal native-speaker pace'];
  if (!library && sp) parts.push(`with a natural ${sp.accent} English accent`);
  return parts.join(', ');
}

/* ── Huella del guion (para saber si hay que regenerar) ─────────── */

export async function unitHash(unit: UnitSpec): Promise<string> {
  const payload = JSON.stringify([RENDER_VERSION, TTS_MODEL, unit.speakers, unit.turns, unit.style ?? '', unit.gapMs ?? 0]);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return [...new Uint8Array(buf)]
    .slice(0, 6)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface ManifestEntry {
  hash: string;
  file: string;
  duration: number;
  turns: [number, number][];
  voices: Record<string, string>;
}

export interface Manifest {
  version: number;
  units: Record<string, ManifestEntry>;
  status?: { at: string; total: number; done: number; requests: number; stoppedBy?: string };
}

/* ── Piezas de audio del banco (las comparten la app y el script) ── */

interface BankSet {
  part: string;
  unit?: UnitSpec;
  extracts?: { unit: UnitSpec }[];
}
interface BankLine {
  id: string;
  speaker: SpeakerSpec;
}

export const DICTATION_STYLE = 'clear, natural native-speaker pace, as in a listening exam';
export const CONNECTED_STYLE = 'casual, relaxed and fast, with natural connected speech, weak forms and contractions, like chatting with a friend';

export function setUnits(set: BankSet): UnitSpec[] {
  return set.part === 'l1' ? (set.extracts ?? []).map((x) => x.unit) : set.unit ? [set.unit] : [];
}

export function dictationUnitOf(d: BankLine & { text: string }): UnitSpec {
  return { id: `dict-${d.id}`, speakers: [d.speaker], turns: [{ s: d.speaker.id, text: d.text }], style: DICTATION_STYLE };
}

export function connectedUnitOf(c: BankLine & { spoken: string }): UnitSpec {
  return { id: `cs-${c.id}`, speakers: [c.speaker], turns: [{ s: c.speaker.id, text: c.spoken }], style: CONNECTED_STYLE };
}

/** Todas las piezas, en el orden en que conviene generarlas (los sets primero). */
export function bankUnits(sets: BankSet[], dictation: (BankLine & { text: string })[], connected: (BankLine & { spoken: string })[]): UnitSpec[] {
  return [...sets.flatMap(setUnits), ...dictation.map(dictationUnitOf), ...connected.map(connectedUnitOf)];
}
