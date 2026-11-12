// Audio en iPhone: Safari solo deja sonar audio que arranca tras un toque.
// Creamos un único AudioContext y lo «despertamos» en cada toque si hace falta.
import { signal } from '@preact/signals';

let ctx: AudioContext | null = null;

export function audioCtx(): AudioContext {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
  }
  return ctx;
}

export async function unlockAudio(): Promise<boolean> {
  try {
    const c = audioCtx();
    if (c.state !== 'running') await c.resume();
    const b = c.createBuffer(1, 1, 22050);
    const s = c.createBufferSource();
    s.buffer = b;
    s.connect(c.destination);
    s.start(0);
    return c.state === 'running';
  } catch {
    return false;
  }
}

/** Escucha global: cada toque reactiva el audio si iOS lo ha suspendido (llamadas, bloqueo…). */
export function installAudioUnlock(): void {
  const handler = () => {
    if (!ctx || ctx.state !== 'running') void unlockAudio();
  };
  document.addEventListener('pointerdown', handler, { capture: true, passive: true });
  document.addEventListener('keydown', handler, { capture: true, passive: true });
}

/** Pitido corto para comprobar que se oye. */
export async function beep(freq = 660, ms = 220): Promise<void> {
  await unlockAudio();
  const c = audioCtx();
  const o = c.createOscillator();
  const g = c.createGain();
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.25, c.currentTime + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + ms / 1000);
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + ms / 1000 + 0.05);
  await new Promise((r) => setTimeout(r, ms + 80));
}

/* ── Reproducción de archivos con «más despacio» ───────────────── */

export const slowMode = signal(false);
let current: HTMLAudioElement | null = null;

export function stopPlayback(): void {
  if (current) {
    current.pause();
    current.removeAttribute('src'); // (src = '' apuntaría a la propia página)
    current.load();
    current = null;
  }
}

/* ── Un único <audio> para toda la app ─────────────────────────── */
// En iPhone cada elemento de audio necesita «su» toque para sonar. Si usamos siempre el mismo y lo
// desbloqueamos en el primer toque, después puede sonar sin más toques (al acabar de grabar, en el
// simulacro, en el modo examen del Listening…).

let shared: HTMLAudioElement | null = null;
let sharedUnlocked = false;
let silentUrl: string | null = null;

export function sharedAudio(): HTMLAudioElement {
  if (!shared) {
    shared = new Audio();
    shared.preload = 'auto';
    const x = shared as HTMLAudioElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean };
    x.preservesPitch = true; // «más despacio» sin voz grave
    x.webkitPreservesPitch = true;
  }
  return shared;
}

/**
 * Llamar al principio de un toque, ANTES de cualquier await: deja listo el audio (elemento compartido
 * y AudioContext) para que pueda sonar después sin otro toque.
 */
export function unlockSharedAudio(): Promise<void> {
  void unlockAudio();
  if (sharedUnlocked) return Promise.resolve();
  const el = sharedAudio();
  // Si ya tiene un audio cargado (p. ej. el del listening), se toca en silencio y se para.
  const real = !!el.getAttribute('src') && el.src !== silentUrl;
  if (!real) {
    silentUrl ??= URL.createObjectURL(pcm16ToWav(new Uint8Array(2400), 24000));
    el.src = silentUrl;
  }
  el.muted = true;
  return el
    .play() // se llama dentro del toque (antes de cualquier await del llamador)
    .then(() => {
      el.pause();
      if (real) el.currentTime = 0;
      sharedUnlocked = true;
    })
    .catch(() => undefined)
    .finally(() => {
      el.muted = false;
    });
}

/** La voz del sistema en iPhone también necesita un primer toque: una frase vacía la despierta. */
export function primeSpeech(): void {
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  } catch {
    /* nada */
  }
}

export class PlaybackBlockedError extends Error {
  constructor() {
    super('El iPhone no ha dejado reproducir el audio sin tocar la pantalla. Pulsa «Repetir».');
    this.name = 'PlaybackBlockedError';
  }
}

/** Reproduce un audio en el elemento compartido. `maxMs`: corta a ese tiempo (para pruebas). */
export async function playBlob(blob: Blob, opts: { rate?: number; maxMs?: number } = {}): Promise<void> {
  stopPlayback();
  const url = URL.createObjectURL(blob);
  const a = sharedAudio();
  a.src = url;
  a.playbackRate = opts.rate ?? 1;
  current = a;
  const timers: ReturnType<typeof setTimeout>[] = [];
  try {
    await new Promise<void>((resolve, reject) => {
      let started = false;
      a.onended = () => resolve();
      a.onerror = () => reject(new Error('No se ha podido reproducir el audio.'));
      a.onplaying = () => (started = true);
      a.play()
        .then(() => (started = true))
        .catch((e: Error) => reject(e?.name === 'NotAllowedError' ? new PlaybackBlockedError() : e));
      // Si en 8 s no ha empezado a sonar, algo lo bloquea: mejor avisar que quedarse colgado.
      timers.push(setTimeout(() => !started && reject(new PlaybackBlockedError()), 8000));
      if (opts.maxMs) timers.push(setTimeout(() => (a.pause(), resolve()), opts.maxMs));
      // Nunca más de lo que dura (más un margen), por si el navegador no avisa del final.
      a.onloadedmetadata = () => {
        if (Number.isFinite(a.duration)) timers.push(setTimeout(resolve, (a.duration / (opts.rate ?? 1)) * 1000 + 3000));
      };
    });
  } finally {
    timers.forEach(clearTimeout);
    a.onplaying = null;
    a.onloadedmetadata = null;
    a.onended = null;
    a.onerror = null;
    URL.revokeObjectURL(url);
    if (current === a) current = null;
  }
}

/* ── PCM ⇄ WAV ─────────────────────────────────────────────────── */

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < buf.length; i += step) bin += String.fromCharCode(...buf.subarray(i, i + step));
  return btoa(bin);
}

/** Envuelve PCM de 16 bits little-endian (mono) en un WAV reproducible. */
export function pcm16ToWav(pcm: Uint8Array, sampleRate: number): Blob {
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const write = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  write(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  write(36, 'data');
  v.setUint32(40, pcm.length, true);
  return new Blob([header, pcm as BlobPart], { type: 'audio/wav' });
}

/**
 * Convierte cualquier grabación (p. ej. audio/mp4 de Safari) a WAV mono de 16 kHz,
 * un formato que Gemini acepta siempre y que pesa poco (~32 KB por segundo).
 */
export async function blobToWav16k(blob: Blob): Promise<Blob> {
  if (blob.type === 'audio/wav') return blob;
  const decoded = await audioCtx().decodeAudioData((await blob.arrayBuffer()).slice(0));
  const frames = Math.max(1, Math.ceil(decoded.duration * 16000));
  const off = new OfflineAudioContext(1, frames, 16000);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  return pcm16ToWav(floatToPcm16([rendered.getChannelData(0)], 16000, 16000), 16000);
}

/** Float32 [-1,1] → PCM16, con remuestreo simple al ritmo pedido. */
export function floatToPcm16(chunks: Float32Array[], fromRate: number, toRate: number): Uint8Array {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const merged = new Float32Array(total);
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.length;
  }
  const ratio = fromRate / toRate;
  const outLen = Math.floor(total / ratio);
  const out = new DataView(new ArrayBuffer(outLen * 2));
  for (let i = 0; i < outLen; i++) {
    const s = Math.max(-1, Math.min(1, merged[Math.floor(i * ratio)] ?? 0));
    out.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(out.buffer);
}
