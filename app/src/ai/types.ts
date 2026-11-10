import type { z } from 'zod';

export type Provider = 'gemini' | 'claude';

export interface ModelRef {
  provider: Provider;
  model: string;
}

/** Tareas de IA. Cada una tiene su cadena de modelos (providers.ts) y, casi siempre, su prompt en prompts/tasks/. */
export type TaskId =
  | 'chat'
  | 'explain-es'
  | 'generate'
  | 'validate'
  | 'open-answer'
  | 'transcribe'
  | 'ocr-writing'
  | 'correct-writing'
  | 'assess-speaking'
  | 'rephrase'
  | 'roleplay'
  | 'tutor-notes'
  | 'weekly-report'
  | 'voice-test';

export type AiPart = { text: string } | { inline: { mimeType: string; data: string } };

export interface AiMessage {
  role: 'user' | 'assistant';
  parts: AiPart[];
}

export interface AiRequest<T = unknown> {
  task: TaskId;
  system?: string;
  messages: AiMessage[];
  /** Si hay esquema, la salida se pide en JSON y se valida con Zod. */
  schema?: z.ZodType<T>;
  maxTokens?: number;
  /** Solo Claude: profundidad del razonamiento. */
  effort?: 'low' | 'medium' | 'high';
  /** Guardar/leer la respuesta en la caché de Firestore (aiCache). */
  cache?: boolean;
  signal?: AbortSignal;
  /** Solo Gemini: cuánto «piensa» antes de responder (menos = más rápido). */
  thinking?: 'minimal' | 'low' | 'medium' | 'high';
  /** Tiempo máximo por intento; si se pasa, se prueba el siguiente modelo de la cadena. */
  timeoutMs?: number;
  /** Reintentos en el mismo modelo ante saturación o límite por minuto (por defecto 2). */
  retries?: number;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  audioInputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface AiResult<T = unknown> {
  text: string;
  data: T | undefined;
  model: ModelRef;
  usage: Usage;
  cached: boolean;
  /** true si respondió un modelo de respaldo y no el primero de la cadena. */
  fellBack: boolean;
}

export interface ProviderOutput {
  text: string;
  data?: unknown;
  usage: Usage;
}

export type AiErrorKind =
  | 'rate' // límite por minuto: reintentar tras una espera
  | 'quota-day' // cuota diaria gratuita agotada en ese modelo
  | 'overloaded' // el proveedor está saturado (503/529)
  | 'network'
  | 'auth' // sesión o Worker rechazan la petición
  | 'bad-request'
  | 'refusal'
  | 'invalid-output' // la respuesta no cumple el esquema
  | 'budget' // superado el tope mensual de Claude
  | 'config' // falta configuración (URL del Worker…)
  | 'timeout' // el modelo tardó más de lo permitido
  | 'unavailable';

export class AiError extends Error {
  constructor(
    public kind: AiErrorKind,
    message: string,
    public opts: { status?: number; retryAfterMs?: number; model?: string } = {},
  ) {
    super(message);
    this.name = 'AiError';
  }
}

export const EMPTY_USAGE: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  audioInputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};
