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
  // Generar: primero un Flash (mejor calidad); si se agota su cuota gratuita, Flash-Lite.
  generate: [g(MODELS.geminiFlashAlt), g(MODELS.geminiLite), g(MODELS.geminiLiteAlt)],
  // Validar: un modelo distinto del que suele generar.
  validate: [g(MODELS.geminiFlash), g(MODELS.geminiFlashAlt), g(MODELS.geminiLite)],
  'open-answer': [g(MODELS.geminiLite), g(MODELS.geminiLiteAlt)],
  // Transcribir: Flash-Lite primero (rápido y ~500 al día gratis); 3.8 Flash suele dar 503.
  transcribe: [g(MODELS.geminiLite), g(MODELS.geminiLiteAlt), g(MODELS.geminiFlash)],
  'ocr-writing': [g(MODELS.geminiFlash), g(MODELS.geminiFlashAlt), g(MODELS.geminiLite)],
  // Claude solo se usa si lo eliges en esa corrección; si no, la cadena empieza en Gemini (gratis).
  'correct-writing': [c(MODELS.claudeSonnet), g(MODELS.geminiFlash), g(MODELS.geminiFlashAlt), g(MODELS.geminiLite)],
  'assess-speaking': [c(MODELS.claudeSonnet), g(MODELS.geminiFlash), g(MODELS.geminiFlashAlt), g(MODELS.geminiLite)],
  rephrase: [g(MODELS.geminiLite), g(MODELS.geminiLiteAlt)],
  roleplay: [g(MODELS.geminiLite), g(MODELS.geminiLiteAlt)],
  'tutor-notes': [g(MODELS.geminiFlash), g(MODELS.geminiLite)],
  'weekly-report': [g(MODELS.geminiFlash), g(MODELS.geminiLite)],
  'voice-test': [g(MODELS.geminiLite)],
  'error-patterns': [g(MODELS.geminiLite), g(MODELS.geminiLiteAlt), g(MODELS.geminiFlash)],
  grammar: [g(MODELS.geminiLite), g(MODELS.geminiLiteAlt)],
  // Escenas de series: lección con un Flash (mejor calidad) y Flash-Lite de respaldo.
  series: [g(MODELS.geminiFlashAlt), g(MODELS.geminiLite), g(MODELS.geminiLiteAlt)],
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
  'error-patterns': 'Cuaderno de errores',
  grammar: 'Gramática C1',
  series: 'Escenas de series',
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
