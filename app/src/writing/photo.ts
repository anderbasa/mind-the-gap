// Writing a mano: la foto se reduce en el móvil (≈1600 px, JPEG) y Gemini la transcribe tal cual.
import { runAI } from '../ai/client';
import { getPrompt } from '../ai/prompts';
import { OcrSchema, type Ocr } from './schema';

const MAX_SIDE = 1600;

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No he podido abrir la foto. Prueba con otra (JPG o PNG).'));
    };
    img.src = url;
  });
}

/** Reduce la foto y la devuelve en base64 (sin el prefijo data:). */
export async function compressPhoto(file: Blob): Promise<{ data: string; mimeType: 'image/jpeg'; width: number; height: number; kb: number }> {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no deja procesar la foto.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  const data = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return { data, mimeType: 'image/jpeg', width: w, height: h, kb: Math.round((data.length * 3) / 4 / 1024) };
}

/** Transcribe la foto con Gemini (gratis). */
export async function transcribePhoto(file: Blob, signal?: AbortSignal): Promise<Ocr> {
  const img = await compressPhoto(file);
  const r = await runAI({
    task: 'ocr-writing',
    system: getPrompt('writing-ocr').body,
    messages: [{ role: 'user', parts: [{ inline: { mimeType: img.mimeType, data: img.data } }, { text: 'Transcribe this handwritten text. Return only the JSON.' }] }],
    schema: OcrSchema,
    maxTokens: 4000,
    thinking: 'low',
    timeoutMs: 90_000,
    retries: 1,
    signal,
  });
  return r.data!;
}
