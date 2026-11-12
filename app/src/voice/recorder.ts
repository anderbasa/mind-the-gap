// Grabación del micrófono pensada para iPhone:
//  - MediaRecorder (audio/mp4 en Safari) como vía principal.
//  - AudioWorklet → WAV como respaldo si MediaRecorder falla.
// Se pide el micro de nuevo en cada grabación y se suelta al acabar
// (en la app instalada, reutilizar el stream falla tras reabrirla).
import { audioCtx, floatToPcm16, pcm16ToWav, unlockAudio } from './audio';

export interface Recording {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  method: 'mediarecorder' | 'wav';
}

const MIME_CANDIDATES = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/aac', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];

export function pickMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return MIME_CANDIDATES.find((m) => {
    try {
      return MediaRecorder.isTypeSupported(m);
    } catch {
      return false;
    }
  });
}

export function micErrorMessage(e: unknown): string {
  const name = (e as Error)?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'No hay permiso para el micrófono. En iPhone: Ajustes → Safari → Micrófono (o en la propia web: «aA» → Ajustes del sitio web).';
  if (name === 'NotFoundError') return 'No se encuentra ningún micrófono.';
  if (name === 'NotReadableError') return 'El micrófono está ocupado por otra app (¿llamada en curso?).';
  return `No se ha podido usar el micrófono (${name || 'error desconocido'}).`;
}

const WORKLET = `
class MtgCapture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('mtg-capture', MtgCapture);
`;
let workletLoaded = false;

/** Grabaciones abiertas ahora mismo (para contar el tiempo de estudio aunque no toques la pantalla). */
let liveRecordings = 0;
export const isRecording = () => liveRecordings > 0;

export class Recorder {
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private pcm: Float32Array[] = [];
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private levelTimer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private method: Recording['method'] = 'mediarecorder';
  private mime = '';

  get recording(): boolean {
    return this.stream !== null;
  }

  async start(opts: { forceWav?: boolean; onLevel?: (v: number) => void } = {}): Promise<void> {
    await unlockAudio();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    liveRecordings++;
    const ctx = audioCtx();
    this.source = ctx.createMediaStreamSource(this.stream);

    if (opts.onLevel) {
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.source.connect(this.analyser);
      const buf = new Float32Array(this.analyser.fftSize);
      this.levelTimer = setInterval(() => {
        this.analyser?.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const x of buf) sum += x * x;
        opts.onLevel!(Math.min(1, Math.sqrt(sum / buf.length) * 4));
      }, 80);
    }

    const mime = pickMime();
    if (!opts.forceWav && mime) {
      try {
        this.rec = new MediaRecorder(this.stream, { mimeType: mime });
        this.mime = this.rec.mimeType || mime;
        this.chunks = [];
        this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
        this.rec.start(250);
        this.method = 'mediarecorder';
        this.startedAt = performance.now();
        return;
      } catch {
        this.rec = null; // seguimos con WAV
      }
    }
    if (!workletLoaded) {
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      workletLoaded = true;
    }
    this.pcm = [];
    this.node = new AudioWorkletNode(ctx, 'mtg-capture');
    this.node.port.onmessage = (e) => this.pcm.push(e.data as Float32Array);
    this.source.connect(this.node);
    // conectar a un destino silencioso para que el grafo procese
    const mute = ctx.createGain();
    mute.gain.value = 0;
    this.node.connect(mute).connect(ctx.destination);
    this.method = 'wav';
    this.mime = 'audio/wav';
    this.startedAt = performance.now();
  }

  async stop(): Promise<Recording> {
    const durationMs = Math.round(performance.now() - this.startedAt);
    let blob: Blob;
    if (this.rec) {
      const rec = this.rec;
      blob = await new Promise<Blob>((resolve) => {
        rec.onstop = () => resolve(new Blob(this.chunks, { type: this.mime }));
        rec.stop();
      });
    } else {
      const ctx = audioCtx();
      blob = pcm16ToWav(floatToPcm16(this.pcm, ctx.sampleRate, 16000), 16000);
    }
    this.release();
    return { blob, mimeType: this.mime.split(';')[0], durationMs, method: this.method };
  }

  cancel(): void {
    try {
      this.rec?.stop();
    } catch {
      /* ya parado */
    }
    this.release();
  }

  private release(): void {
    if (this.levelTimer) clearInterval(this.levelTimer);
    this.levelTimer = null;
    this.node?.disconnect();
    this.source?.disconnect();
    this.analyser?.disconnect();
    if (this.stream) liveRecordings = Math.max(0, liveRecordings - 1);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.rec = null;
    this.node = null;
    this.source = null;
    this.analyser = null;
  }
}
