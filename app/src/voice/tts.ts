// Voz de Theo y de los listenings con Gemini TTS (a través del Worker).
// El audio generado se guarda en IndexedDB para no pedirlo dos veces.
import { settings } from '../state';
import { MODELS } from '../ai/providers';
import { classifyGeminiError } from '../ai/retry';
import { recordUsage } from '../ai/usage';
import { workerJson } from '../ai/worker';
import { base64ToBytes, pcm16ToWav } from './audio';
import { getAudio, putAudio } from './idb';

/** Voces de Gemini TTS que usamos (el acento se pide en el texto de estilo). */
export const GEMINI_VOICES = {
  theo: 'Charon',
  partner: 'Puck',
  female: 'Kore',
  male2: 'Fenrir',
} as const;

interface TtsResponse {
  candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

async function hashKey(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return 'tts-' + [...new Uint8Array(buf)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function geminiSpeak(text: string, opts: { voice?: string; style?: string; model?: string } = {}): Promise<Blob> {
  const voice = opts.voice ?? GEMINI_VOICES.theo;
  const model = opts.model ?? MODELS.geminiTts;
  const prompt = opts.style ? `${opts.style}:\n${text}` : text;
  const key = await hashKey(`${model}|${voice}|${prompt}`);
  const cached = await getAudio(key).catch(() => undefined);
  if (cached) return cached;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  };
  const { res, json } = await workerJson<TtsResponse>(`/gemini/models/${model}:generateContent`, body);
  if (!res.ok) throw classifyGeminiError(res.status, json, res.headers.get('retry-after'));
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  if (!part) throw new Error('Gemini TTS no ha devuelto audio.');
  const rate = Number(/rate=(\d+)/.exec(part.mimeType)?.[1] ?? 24000);
  const wav = pcm16ToWav(base64ToBytes(part.data), rate);
  const um = json.usageMetadata ?? {};
  void recordUsage(
    { provider: 'gemini', model },
    { inputTokens: um.promptTokenCount ?? 0, outputTokens: um.candidatesTokenCount ?? 0, audioInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    settings.value.geminiTier,
  ).catch(() => undefined);
  await putAudio(key, wav).catch(() => undefined);
  return wav;
}
