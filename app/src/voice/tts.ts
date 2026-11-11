// Voz de Gemini TTS al vuelo (a través del Worker, API de Interactions). Ojo: la capa gratuita
// solo da ~10 peticiones al día por modelo, así que se usa poco (prueba de voz); los audios
// fijos (listenings, examinador) se generan una vez en GitHub. Lo generado se guarda en IndexedDB.
import { settings } from '../state';
import { classifyGeminiError } from '../ai/retry';
import { AiError } from '../ai/types';
import { recordUsage } from '../ai/usage';
import { workerJson } from '../ai/worker';
import { audioFromInteraction, decodeAudio, encodeWav, interactionBody, TTS_MODELS } from '../listening/ttsCore';
import { base64ToBytes } from './audio';
import { getAudio, putAudio } from './idb';

/** Voces de serie de Gemini TTS. */
export const GEMINI_VOICES = {
  theo: 'Charon',
  partner: 'Puck',
  female: 'Kore',
  male2: 'Fenrir',
} as const;

async function hashKey(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return 'tts-' + [...new Uint8Array(buf)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function geminiSpeak(text: string, opts: { voice?: string; style?: string } = {}): Promise<Blob> {
  const voice = opts.voice ?? GEMINI_VOICES.theo;
  const key = await hashKey(`interactions|${voice}|${opts.style ?? ''}|${text}`);
  const cached = await getAudio(key).catch(() => undefined);
  if (cached) return cached;

  for (let i = 0; i < TTS_MODELS.length; i++) {
    const model = TTS_MODELS[i];
    const { res, json } = await workerJson<unknown>('/gemini/interactions', interactionBody(text, voice, opts.style, model), undefined, 90_000);
    if (!res.ok) {
      const err = classifyGeminiError(res.status, json, res.headers.get('retry-after'));
      if (err.kind === 'quota-day' && i < TTS_MODELS.length - 1) continue; // siguiente modelo
      throw err;
    }
    const a = audioFromInteraction(json);
    if (!a) throw new AiError('invalid-output', 'Gemini TTS no ha devuelto audio.');
    const out = decodeAudio(base64ToBytes(a.data), a.mime);
    const wav = new Blob([encodeWav(out.pcm, out.rate) as BlobPart], { type: 'audio/wav' });
    void recordUsage(
      { provider: 'gemini', model },
      { inputTokens: Math.ceil(text.length / 4), outputTokens: Math.round((out.pcm.length / out.rate) * 25), audioInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      settings.value.geminiTier,
    ).catch(() => undefined);
    await putAudio(key, wav).catch(() => undefined);
    return wav;
  }
  throw new AiError('quota-day', 'Se ha agotado la cuota gratuita de voz de hoy.');
}
