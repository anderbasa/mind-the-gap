// Cliente de Gemini Live: conversación por voz en tiempo real.
// Micro → PCM 16 kHz (base64) por WebSocket; la voz del modelo llega en PCM 24 kHz y se encola.
// El token es efímero (lo crea el Worker): la clave real nunca llega al navegador.
import { MODELS } from '../ai/providers';
import { audioCtx, floatToPcm16, unlockAudio } from './audio';
import { getLiveToken } from './live';

const LIVE_WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';

const WORKLET = `
class MtgLive extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('mtg-live', MtgLive);
`;
let workletReady = false;

export type LiveState = 'connecting' | 'listening' | 'speaking' | 'closed' | 'error';

export interface LiveCallbacks {
  onState?: (s: LiveState, detail?: string) => void;
  /** Texto de lo que se dice: tú (input) o Theo (output). `final` cuando termina el turno. */
  onText?: (who: 'you' | 'theo', text: string) => void;
  onTurnEnd?: () => void;
  onLevel?: (v: number) => void;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function base64ToInt16(b64: string): Int16Array {
  const bin = atob(b64);
  const out = new Int16Array(Math.floor(bin.length / 2));
  for (let i = 0; i < out.length; i++) {
    const lo = bin.charCodeAt(i * 2);
    const hi = bin.charCodeAt(i * 2 + 1);
    let v = (hi << 8) | lo;
    if (v >= 0x8000) v -= 0x10000;
    out[i] = v;
  }
  return out;
}

export class LiveSession {
  private ws: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private pending: Float32Array[] = [];
  private pendingLen = 0;
  private playing: AudioBufferSourceNode[] = [];
  private nextTime = 0;
  private closedByUs = false;
  /** Milisegundos en los que has hablado (micro por encima del umbral). */
  speakingMs = 0;

  constructor(private cb: LiveCallbacks = {}) {}

  async start(system: string): Promise<void> {
    await unlockAudio();
    this.cb.onState?.('connecting');
    const token = await getLiveToken();
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${LIVE_WS}?access_token=${encodeURIComponent(token)}`);
      this.ws = ws;
      let ready = false;
      const timer = setTimeout(() => {
        if (!ready) {
          ws.close();
          reject(new Error('Gemini Live no ha respondido a tiempo.'));
        }
      }, 15_000);
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            setup: {
              model: `models/${MODELS.geminiLive}`,
              generationConfig: { responseModalities: ['AUDIO'] },
              systemInstruction: { parts: [{ text: system }] },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
            },
          }),
        );
      };
      ws.onmessage = async (ev) => {
        const text = typeof ev.data === 'string' ? ev.data : await (ev.data as Blob).text();
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(text);
        } catch {
          return;
        }
        if (msg.setupComplete !== undefined && !ready) {
          ready = true;
          clearTimeout(timer);
          resolve();
          return;
        }
        this.handle(msg);
      };
      ws.onerror = () => {
        if (!ready) {
          clearTimeout(timer);
          reject(new Error('No se ha podido conectar con Gemini Live.'));
        }
      };
      ws.onclose = (ev) => {
        clearTimeout(timer);
        if (!ready) reject(new Error(`Gemini Live cerró la conexión (${ev.code}${ev.reason ? `: ${ev.reason}` : ''}).`));
        else if (!this.closedByUs) this.cb.onState?.('error', `La conversación se ha cortado (${ev.code}${ev.reason ? `: ${ev.reason}` : ''}).`);
        this.cleanup();
      };
    });
    await this.startMic();
    this.cb.onState?.('listening');
  }

  /** Mensaje de texto al modelo (p. ej. para que empiece a hablar). */
  sendText(text: string): void {
    this.ws?.send(JSON.stringify({ realtimeInput: { text } }));
  }

  stop(): void {
    this.closedByUs = true;
    try {
      this.ws?.close(1000);
    } catch {
      /* ya cerrado */
    }
    this.cleanup();
    this.cb.onState?.('closed');
  }

  private handle(msg: Record<string, unknown>) {
    const sc = msg.serverContent as
      | {
          modelTurn?: { parts?: { inlineData?: { data: string; mimeType?: string } }[] };
          interrupted?: boolean;
          turnComplete?: boolean;
          inputTranscription?: { text?: string };
          outputTranscription?: { text?: string };
        }
      | undefined;
    if (msg.goAway) this.cb.onState?.('error', 'Gemini Live va a cerrar la sesión pronto (límite de tiempo).');
    if (!sc) return;
    if (sc.interrupted) this.stopPlayback();
    for (const p of sc.modelTurn?.parts ?? []) {
      if (p.inlineData?.data) this.play(p.inlineData.data, Number(/rate=(\d+)/.exec(p.inlineData.mimeType ?? '')?.[1] ?? 24000));
    }
    if (sc.inputTranscription?.text) this.cb.onText?.('you', sc.inputTranscription.text);
    if (sc.outputTranscription?.text) this.cb.onText?.('theo', sc.outputTranscription.text);
    if (sc.turnComplete) this.cb.onTurnEnd?.();
  }

  private play(b64: string, rate: number) {
    const ctx = audioCtx();
    const pcm = base64ToInt16(b64);
    if (!pcm.length) return;
    const buf = ctx.createBuffer(1, pcm.length, rate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const at = Math.max(ctx.currentTime + 0.03, this.nextTime);
    src.start(at);
    this.nextTime = at + buf.duration;
    this.playing.push(src);
    this.cb.onState?.('speaking');
    src.onended = () => {
      this.playing = this.playing.filter((s) => s !== src);
      if (!this.playing.length) this.cb.onState?.('listening');
    };
  }

  private stopPlayback() {
    for (const s of this.playing) {
      try {
        s.stop();
      } catch {
        /* ya parado */
      }
    }
    this.playing = [];
    this.nextTime = 0;
  }

  private async startMic() {
    const ctx = audioCtx();
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    if (!workletReady) {
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      workletReady = true;
    }
    this.source = ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(ctx, 'mtg-live');
    const chunk = Math.round(ctx.sampleRate / 10); // 100 ms
    this.node.port.onmessage = (e) => {
      const f = e.data as Float32Array;
      this.pending.push(f);
      this.pendingLen += f.length;
      if (this.pendingLen < chunk) return;
      let sum = 0;
      for (const x of this.pending) for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
      const rms = Math.sqrt(sum / this.pendingLen);
      this.cb.onLevel?.(Math.min(1, rms * 4));
      if (rms > 0.02) this.speakingMs += (this.pendingLen / ctx.sampleRate) * 1000;
      const bytes = floatToPcm16(this.pending, ctx.sampleRate, 16000);
      this.pending = [];
      this.pendingLen = 0;
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ realtimeInput: { audio: { data: bytesToBase64(bytes), mimeType: 'audio/pcm;rate=16000' } } }));
      }
    };
    this.source.connect(this.node);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    this.node.connect(mute).connect(ctx.destination);
  }

  private cleanup() {
    this.stopPlayback();
    this.node?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.node = null;
    this.source = null;
    this.stream = null;
    this.ws = null;
  }
}
