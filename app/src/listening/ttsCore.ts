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
  /** Modelo de voz que lo generó. */
  model?: string;
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

/* ── Ahorro de cuota: pocas peticiones por audio ────────────────── */
// La capa gratuita de voz da ~10 peticiones al día por modelo. Por eso:
//  · una conversación de dos personas va entera en UNA petición (dos voces a la vez);
//  · con más de dos hablantes (Parte 4), una petición por hablante;
//  · las frases sueltas de la misma voz (dictados…) van varias por petición y se cortan por las pausas;
//  · si se agota la cuota de un modelo, se sigue con el siguiente.

export const TTS_LITE = 'gemini-3.8-flash-lite-tts';
export const TTS_MODELS = [TTS_MODEL, TTS_LITE];

export type Voices = Record<string, { voice: string; library: boolean }>;

export interface Chunk {
  turns: number[];
  speakers: string[];
}

/** Qué intervenciones van juntas en cada petición. */
export function planChunks(unit: UnitSpec): Chunk[] {
  const distinct = [...new Set(unit.turns.map((t) => t.s))];
  if (distinct.length <= 2) return [{ turns: unit.turns.map((_, i) => i), speakers: distinct }];
  return unit.turns.map((t, i) => ({ turns: [i], speakers: [t.s] }));
}

function speakerName(unit: UnitSpec, id: string): string {
  return unit.speakers.find((s) => s.id === id)?.name ?? id;
}

/** Cuerpo de la petición de un trozo: una voz, o dos voces con «speaker» en cada intervención. */
export function chunkBody(unit: UnitSpec, chunk: Chunk, voices: Voices, model = TTS_MODEL): Record<string, unknown> {
  const multi = chunk.speakers.length === 2;
  const content = chunk.turns.map((i) => {
    const t = unit.turns[i];
    const sp = unit.speakers.find((s) => s.id === t.s);
    const style = styleFor(unit, t, sp, voices[t.s].library);
    return { type: 'text', text: t.text, annotations: [{ type: 'speech_metadata', ...(multi ? { speaker: speakerName(unit, t.s) } : {}), style }] };
  });
  const speech_config = multi ? { speakers: chunk.speakers.map((id) => ({ speaker: speakerName(unit, id), voice: voices[id].voice })) } : [{ voice: voices[chunk.speakers[0]].voice }];
  return {
    model,
    input: [{ type: 'user_input', content }],
    response_format: { type: 'audio', mime_type: 'audio/wav', sample_rate: RATE },
    generation_config: { speech_config },
  };
}

/** Varias frases de la misma voz en una petición, con una pausa larga entre ellas. */
export function batchBody(texts: string[], voice: string, style: string, model = TTS_MODEL): Record<string, unknown> {
  const content = texts.map((text, i) => ({
    type: 'text',
    text: i < texts.length - 1 ? `${text} <long pause>` : text,
    annotations: [{ type: 'speech_metadata', style: `${style}. Leave a clear pause of about two seconds between sentences` }],
  }));
  return {
    model,
    input: [{ type: 'user_input', content }],
    response_format: { type: 'audio', mime_type: 'audio/wav', sample_rate: RATE },
    generation_config: { speech_config: [{ voice }] },
  };
}

/* ── Pausas ──────────────────────────────────────────────────────── */

/** Tramos de silencio (en muestras), con un mínimo de duración. */
export function findSilences(pcm: Int16Array, rate = RATE, minMs = 250, threshold = 400): { start: number; end: number }[] {
  const frame = Math.max(1, Math.round(rate / 100)); // 10 ms
  const out: { start: number; end: number }[] = [];
  let runStart = -1;
  for (let f = 0; f * frame < pcm.length; f++) {
    let peak = 0;
    const end = Math.min(pcm.length, (f + 1) * frame);
    for (let i = f * frame; i < end; i++) {
      const a = Math.abs(pcm[i]);
      if (a > peak) peak = a;
    }
    if (peak < threshold) {
      if (runStart < 0) runStart = f * frame;
    } else if (runStart >= 0) {
      out.push({ start: runStart, end: f * frame });
      runStart = -1;
    }
  }
  if (runStart >= 0) out.push({ start: runStart, end: pcm.length });
  const min = (minMs / 1000) * rate;
  return out.filter((s) => s.end - s.start >= min);
}

/**
 * Dónde cortar un audio en N trozos de longitudes parecidas a `weights` (p. ej. nº de letras):
 * para cada corte esperado, el silencio más cercano. `strict` = si falta un silencio claro, null.
 */
export function splitPoints(pcm: Int16Array, weights: number[], opts: { rate?: number; minMs?: number; strict?: boolean } = {}): number[] | null {
  const rate = opts.rate ?? RATE;
  if (weights.length <= 1) return [];
  const all = findSilences(pcm, rate, opts.minMs ?? 250);
  // Parte con voz: del primer al último sonido.
  const lead = all.length && all[0].start === 0 ? all[0].end : 0;
  const tail = all.length && all[all.length - 1].end === pcm.length ? all[all.length - 1].start : pcm.length;
  const inner = all.filter((s) => s.start > lead && s.end < tail);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const span = tail - lead;
  const avg = span / weights.length;
  const cuts: number[] = [];
  let acc = 0;
  let after = lead;
  const used = new Set<number>();
  for (let k = 0; k < weights.length - 1; k++) {
    acc += weights[k];
    const expected = lead + (acc / total) * span;
    let best = -1;
    let bestScore = Infinity;
    inner.forEach((s, i) => {
      if (used.has(i) || s.start <= after) return;
      const c = (s.start + s.end) / 2;
      const dist = Math.abs(c - expected);
      if (dist > avg * 0.6) return;
      const score = dist - (s.end - s.start) * 0.5; // a igual distancia, mejor la pausa más larga
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best < 0) {
      if (opts.strict) return null;
      cuts.push(Math.round(expected));
      after = Math.round(expected);
      continue;
    }
    used.add(best);
    const c = Math.round((inner[best].start + inner[best].end) / 2);
    cuts.push(c);
    after = c;
  }
  return cuts;
}

/** Corta en trozos por las posiciones dadas y quita el silencio de los bordes de cada uno. */
export function cutAt(pcm: Int16Array, cuts: number[], rate = RATE): Int16Array[] {
  const bounds = [0, ...cuts, pcm.length];
  const out: Int16Array[] = [];
  for (let i = 0; i < bounds.length - 1; i++) out.push(trimSilence(pcm.subarray(bounds[i], bounds[i + 1]), 300, 60, rate));
  return out;
}

/* ── Generar una pieza (lo usan el script y la app) ─────────────── */

export type TtsCall = (build: (model: string) => Record<string, unknown>) => Promise<{ rate: number; pcm: Int16Array }>;

/**
 * Genera una pieza entera con las mínimas peticiones. Las conversaciones salen de una sola
 * petición; los tiempos de cada intervención se calculan por las pausas (aproximados).
 * Si las voces del catálogo no valen (petición rechazada), repite con voces de serie.
 */
export async function renderUnit(
  unit: UnitSpec,
  voices: Voices,
  tts: TtsCall,
  isBadRequest: (e: unknown) => boolean,
): Promise<{ pcm: Int16Array; rate: number; turns: [number, number][]; voices: Voices }> {
  let vs = voices;
  const chunks = planChunks(unit);
  const pieces: { pcm: Int16Array; spans: [number, number][] }[] = [];
  let rate = RATE;
  for (const chunk of chunks) {
    let out: { rate: number; pcm: Int16Array };
    try {
      out = await tts((model) => chunkBody(unit, chunk, vs, model));
    } catch (e) {
      const usesLibrary = chunk.speakers.some((id) => vs[id].library);
      if (!usesLibrary || !isBadRequest(e)) throw e;
      vs = pickVoices(unit.speakers, []);
      out = await tts((model) => chunkBody(unit, chunk, vs, model));
    }
    rate = out.rate;
    const pcm = trimSilence(out.pcm, 300, 60, rate);
    let spans: [number, number][] = [[0, pcm.length]];
    if (chunk.turns.length > 1) {
      const cuts = splitPoints(pcm, chunk.turns.map((i) => unit.turns[i].text.length), { rate }) ?? [];
      const b = [0, ...cuts, pcm.length];
      spans = chunk.turns.map((_, i) => [b[i], b[i + 1]] as [number, number]);
    }
    pieces.push({ pcm, spans });
  }
  const joined = joinSegments(
    pieces.map((p) => p.pcm),
    unit.gapMs ?? 450,
    rate,
  );
  const turns: [number, number][] = [];
  pieces.forEach((p, k) => {
    const offset = joined.turns[k][0] * rate;
    for (const [a, b] of p.spans) turns.push([round2((offset + a) / rate), round2((offset + b) / rate)]);
  });
  return { pcm: joined.pcm, rate, turns, voices: vs };
}

/** Piezas de una sola frase con la misma voz y estilo: se pueden pedir juntas. */
export function batchKey(unit: UnitSpec): string | null {
  if (unit.turns.length !== 1 || unit.speakers.length !== 1) return null;
  const s = unit.speakers[0];
  return JSON.stringify([s.name, s.gender, s.accent, unit.style ?? '', unit.turns[0].style ?? '']);
}

/**
 * Genera varias frases sueltas (misma voz) en una petición y las separa por las pausas.
 * Devuelve null si no se distinguen bien los cortes: entonces hay que pedirlas una a una.
 */
export async function renderBatch(units: UnitSpec[], voices: Voices, tts: TtsCall): Promise<{ rate: number; pcms: Int16Array[] } | null> {
  const u0 = units[0];
  const sp = u0.speakers[0];
  const v = voices[sp.id];
  const style = styleFor(u0, u0.turns[0], sp, v.library);
  const out = await tts((model) =>
    batchBody(
      units.map((u) => u.turns[0].text),
      v.voice,
      style,
      model,
    ),
  );
  const pcm = trimSilence(out.pcm, 300, 60, out.rate);
  const cuts = splitPoints(
    pcm,
    units.map((u) => u.turns[0].text.length),
    { rate: out.rate, minMs: 450, strict: true },
  );
  if (!cuts) return null;
  return { rate: out.rate, pcms: cutAt(pcm, cuts, out.rate) };
}

/* ── Speaking: frases del examinador y del compañero (pregrabadas) ── */

export const EXAMINER_STYLE = 'a friendly, experienced speaking examiner reading the exam script: clear, measured and natural';
export const PARTNER_STYLE = 'a candidate in an English speaking exam: natural and spontaneous, thinking aloud at times, at a normal pace';
/** Por encima de esta longitud, una frase se pide sola (cortar monólogos largos por pausas es poco fiable). */
export const BATCH_MAX_CHARS = 260;

interface SpeakingBankLite {
  examiner: SpeakerSpec;
  frame: Record<string, string>;
  p1: { questions: { id: string; text: string }[] }[];
  tests: {
    id: string;
    partner: SpeakerSpec;
    intro: string;
    p2: { studentIntro: string; partnerQuestion: string; partnerAnswer: string; partnerIntro: string; partnerLongTurn: string; studentQuestion: string };
    p3: { intro: string; partnerLines: string[]; decision: string; decisionLines: string[] };
    p4: { q: string; partner?: string }[];
  }[];
}

export interface SpeakingLine {
  id: string;
  who: 'examiner' | 'partner';
  text: string;
  speaker: SpeakerSpec;
}

export function speakingLines(bank: SpeakingBankLite): SpeakingLine[] {
  const E = bank.examiner;
  const out: SpeakingLine[] = [];
  const ex = (id: string, text: string) => out.push({ id, who: 'examiner', text, speaker: E });
  for (const [k, v] of Object.entries(bank.frame)) ex(`frame-${k}`, v);
  for (const t of bank.p1) for (const q of t.questions) ex(`p1-${q.id}`, q.text);
  for (const t of bank.tests) {
    const P = t.partner;
    const pa = (id: string, text: string) => out.push({ id, who: 'partner', text, speaker: P });
    ex(`${t.id}-intro`, t.intro);
    ex(`${t.id}-p2-sa`, t.p2.studentIntro);
    ex(`${t.id}-p2-pq`, t.p2.partnerQuestion);
    pa(`${t.id}-p2-pa`, t.p2.partnerAnswer);
    ex(`${t.id}-p2-pi`, t.p2.partnerIntro);
    pa(`${t.id}-p2-pl`, t.p2.partnerLongTurn);
    ex(`${t.id}-p2-sq`, t.p2.studentQuestion);
    ex(`${t.id}-p3-in`, t.p3.intro);
    t.p3.partnerLines.forEach((l, i) => pa(`${t.id}-p3-l${i}`, l));
    ex(`${t.id}-p3-de`, t.p3.decision);
    t.p3.decisionLines.forEach((l, i) => pa(`${t.id}-p3-d${i}`, l));
    t.p4.forEach((x, i) => {
      ex(`${t.id}-p4-q${i}`, x.q);
      if (x.partner) pa(`${t.id}-p4-a${i}`, x.partner);
    });
  }
  return out;
}

export function speakingUnitOf(line: SpeakingLine): UnitSpec {
  return {
    id: `sp-${line.id}`,
    speakers: [line.speaker],
    turns: [{ s: line.speaker.id, text: line.text }],
    style: line.who === 'examiner' ? EXAMINER_STYLE : PARTNER_STYLE,
  };
}
