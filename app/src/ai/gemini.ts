// Adaptador de Gemini (API REST generateContent, a través del Worker).
import { z } from 'zod';
import { classifyGeminiError } from './retry';
import { AiError, type AiRequest, type ProviderOutput, type Usage } from './types';
import { workerJson } from './worker';

interface GeminiPart {
  text?: string;
  thought?: boolean;
  inlineData?: { mimeType: string; data: string };
}

interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    cachedContentTokenCount?: number;
    promptTokensDetails?: { modality?: string; tokenCount?: number }[];
  };
  error?: unknown;
}

/** JSON Schema para responseJsonSchema (sin la clave $schema, que Gemini no necesita). */
export function toGeminiSchema(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { target: 'draft-2020-12' }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

export function buildGeminiBody(req: AiRequest): Record<string, unknown> {
  return {
    ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
    contents: req.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: m.parts.map((p) => ('text' in p ? { text: p.text } : { inlineData: { mimeType: p.inline.mimeType, data: p.inline.data } })),
    })),
    generationConfig: {
      maxOutputTokens: req.maxTokens ?? 8192,
      ...(req.schema ? { responseMimeType: 'application/json', responseJsonSchema: toGeminiSchema(req.schema) } : {}),
    },
  };
}

export function parseGeminiResponse(json: GeminiResponse): ProviderOutput {
  const cand = json.candidates?.[0];
  if (!cand) {
    const reason = json.promptFeedback?.blockReason;
    throw new AiError(reason ? 'refusal' : 'invalid-output', reason ? `Gemini ha bloqueado la petición (${reason}).` : 'Gemini no ha devuelto respuesta.');
  }
  if (cand.finishReason === 'SAFETY' || cand.finishReason === 'PROHIBITED_CONTENT') {
    throw new AiError('refusal', 'Gemini ha cortado la respuesta por seguridad.');
  }
  const text = (cand.content?.parts ?? [])
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text)
    .join('');
  if (cand.finishReason === 'MAX_TOKENS' && !text) throw new AiError('invalid-output', 'Respuesta cortada por longitud.');
  const um = json.usageMetadata ?? {};
  const audio = (um.promptTokensDetails ?? []).filter((d) => d.modality === 'AUDIO').reduce((s, d) => s + (d.tokenCount ?? 0), 0);
  const usage: Usage = {
    inputTokens: um.promptTokenCount ?? 0,
    outputTokens: (um.candidatesTokenCount ?? 0) + (um.thoughtsTokenCount ?? 0),
    audioInputTokens: audio,
    cacheReadTokens: um.cachedContentTokenCount ?? 0,
    cacheWriteTokens: 0,
  };
  return { text, usage };
}

export async function callGemini(model: string, req: AiRequest): Promise<ProviderOutput> {
  const { res, json } = await workerJson<GeminiResponse>(`/gemini/models/${model}:generateContent`, buildGeminiBody(req), req.signal);
  if (!res.ok) throw classifyGeminiError(res.status, json, res.headers.get('retry-after'));
  return parseGeminiResponse(json);
}
