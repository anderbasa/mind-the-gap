// Carga los prompts de /prompts (empaquetados en el build) y rellena sus huecos {{así}}.
import { profileForPrompt, type Profile } from '../domain/profile';

const RAW = import.meta.glob('../../../prompts/**/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export interface PromptFile {
  id: string;
  version: string;
  description: string;
  body: string;
}

export function parsePrompt(raw: string): PromptFile {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  const meta: Record<string, string> = {};
  let body = raw;
  if (m) {
    for (const line of m[1].split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    body = m[2];
  }
  return { id: meta.id ?? '', version: meta.version ?? '0', description: meta.description ?? '', body: body.trim() };
}

const PROMPTS = new Map<string, PromptFile>();
for (const raw of Object.values(RAW)) {
  const p = parsePrompt(raw);
  if (p.id) PROMPTS.set(p.id, p);
}

export function getPrompt(id: string): PromptFile {
  const p = PROMPTS.get(id);
  if (!p) throw new Error(`Prompt desconocido: ${id}`);
  return p;
}

export function listPrompts(): PromptFile[] {
  return [...PROMPTS.values()];
}

/** Sustituye {{clave}}. Un hueco sin valor lanza error: así no se cuela un prompt a medias. */
export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k: string) => {
    if (!(k in vars)) throw new Error(`Falta el valor de {{${k}}} en el prompt`);
    return vars[k];
  });
}

export interface TutorContext {
  profile: Profile;
  tutorNotes?: string;
  learningWords?: string[];
  now?: Date;
}

/** System prompt completo: base de Theo + (opcional) instrucciones de la tarea. */
export function buildSystem(ctx: TutorContext, taskId?: string, taskVars: Record<string, string> = {}): string {
  const now = ctx.now ?? new Date();
  const today = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' }).format(now);
  const base = fill(getPrompt('tutor-system').body, {
    student_name: ctx.profile.name.trim() || 'the student',
    student_profile: profileForPrompt(ctx.profile) || '(profile not filled in yet)',
    tutor_notes: ctx.tutorNotes?.trim() || '(no notes yet — this is the beginning; measure their real level before assuming anything)',
    learning_words: ctx.learningWords?.length ? ctx.learningWords.join(', ') : '(none yet)',
    today,
  });
  if (!taskId) return base;
  return `${base}\n\n=== CURRENT TASK ===\n${fill(getPrompt(taskId).body, taskVars)}`;
}
