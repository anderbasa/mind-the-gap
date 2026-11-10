// Gemini Live (conversación por voz en tiempo real). En la Fase 1 solo
// comprobamos que se puede abrir la sesión desde este dispositivo; el cliente
// completo (micro en streaming, reproducción a 24 kHz) llega en la Fase 5.
import { MODELS } from '../ai/providers';
import { classifyGeminiError } from '../ai/retry';
import { workerJson } from '../ai/worker';

const LIVE_WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';

export async function getLiveToken(): Promise<string> {
  const { res, json } = await workerJson<{ token?: string; error?: unknown }>('/gemini/live-token', { model: MODELS.geminiLive });
  if (!res.ok || !json.token) throw classifyGeminiError(res.status, json, null);
  return json.token;
}

/** Abre una sesión de Live, espera «setupComplete» y la cierra. Devuelve los ms que ha tardado. */
export async function testLiveConnection(timeoutMs = 12_000): Promise<number> {
  const t0 = performance.now();
  const token = await getLiveToken();
  return new Promise<number>((resolve, reject) => {
    const ws = new WebSocket(`${LIVE_WS}?access_token=${encodeURIComponent(token)}`);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('Gemini Live no ha respondido a tiempo.'));
    }, timeoutMs);
    ws.onopen = () => {
      ws.send(JSON.stringify({ setup: { model: `models/${MODELS.geminiLive}`, generationConfig: { responseModalities: ['AUDIO'] } } }));
    };
    ws.onmessage = async (ev) => {
      const text = typeof ev.data === 'string' ? ev.data : await (ev.data as Blob).text();
      try {
        const msg = JSON.parse(text);
        if (msg.setupComplete !== undefined) {
          clearTimeout(timer);
          ws.close(1000);
          resolve(Math.round(performance.now() - t0));
        }
      } catch {
        /* mensajes binarios o parciales: se ignoran en la prueba */
      }
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error('No se ha podido conectar con Gemini Live.'));
    };
    ws.onclose = (ev) => {
      if (ev.code !== 1000) {
        clearTimeout(timer);
        reject(new Error(`Gemini Live cerró la conexión (${ev.code}${ev.reason ? `: ${ev.reason}` : ''}).`));
      }
    };
  });
}
