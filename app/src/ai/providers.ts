// Qué modelo hace cada tarea, con sus respaldos en orden. Se puede cambiar
// por tarea desde Ajustes → IA (settings.providerOverrides) sin tocar el resto.
import type { ModelRef, TaskId } from './types';

const g = (model: string): ModelRef => ({ provider: 'gemini', model });
const c = (model: string): ModelRef => ({ provider: 'claude', model });

export const MODELS = {
  geminiFlash: 'gemini-3.8-flash',
  geminiFlashAlt: 'gemini-3.6-flash',
  geminiLite: 'gemini-3.5-flash-lite',
  geminiLiteAlt: 'gemini-3.1-flash-lite',
  geminiTts: 'gemini-3.8-flash-tts',
  geminiTtsLite: 'gemini-3.8-flash-lite-tts',
  geminiLive: 'gemini-3.8-live',
  claudeSonnet: 'claude-sonnet-5-5',
} as const;

export const DEFAULT_CHAINS: Record<TaskId, ModelRef[]> = {
  chat: [g(MODELS.geminiLite), g(MODELS.geminiLiteAlt)],
  'explain-es': [g(MODELS.geminiLite), g(MODELS.geminiLiteAlt)],
  generate: [g(MODELS.geminiLite), g(MODELS.geminiLiteAlt)],
  validate: [g(MODELS.geminiFlash), g(MODELS.geminiFlashAlt)],
  'open-answer': [g(MODELS.geminiLite), g(MODELS.geminiLiteAlt)],
  transcribe: [g(MODELS.geminiFlash), g(MODELS.geminiLite)],
  'ocr-writing': [g(MODELS.geminiFlash), g(MODELS.geminiLite)],
  'correct-writing': [c(MODELS.claudeSonnet), g(MODELS.geminiFlash)],
  'assess-speaking': [c(MODELS.claudeSonnet), g(MODELS.geminiFlash)],
  rephrase: [g(MODELS.geminiLite), g(MODELS.geminiLiteAlt)],
  roleplay: [g(MODELS.geminiLite), g(MODELS.geminiLiteAlt)],
  'tutor-notes': [g(MODELS.geminiFlash), g(MODELS.geminiLite)],
  'weekly-report': [g(MODELS.geminiFlash), g(MODELS.geminiLite)],
  'voice-test': [g(MODELS.geminiLite)],
};

export const TASK_LABELS: Record<TaskId, string> = {
  chat: 'Chat con Theo',
  'explain-es': 'Explícamelo en castellano',
  generate: 'Generar ejercicios',
  validate: 'Validar ejercicios',
  'open-answer': 'Corregir respuestas abiertas',
  transcribe: 'Transcribir audio',
  'ocr-writing': 'Leer writings en foto',
  'correct-writing': 'Corregir writings',
  'assess-speaking': 'Evaluar speakings',
  rephrase: 'Reformular / Dímelo mejor',
  roleplay: 'Role-plays (texto)',
  'tutor-notes': 'Notas de Theo',
  'weekly-report': 'Informe semanal',
  'voice-test': 'Prueba de voz',
};

/** Modelos que se pueden elegir en Ajustes. */
export const SELECTABLE: ModelRef[] = [
  g(MODELS.geminiFlash),
  g(MODELS.geminiFlashAlt),
  g(MODELS.geminiLite),
  g(MODELS.geminiLiteAlt),
  c(MODELS.claudeSonnet),
  c('claude-haiku-5-5'),
];

export function chainFor(task: TaskId, overrides: Record<string, ModelRef[]> = {}): ModelRef[] {
  const o = overrides[task];
  return o && o.length ? o : DEFAULT_CHAINS[task];
}

export const modelKey = (r: ModelRef) => `${r.provider}:${r.model}`;
