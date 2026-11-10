// Generación en segundo plano: sigue aunque salgas de la pantalla del ejercicio.
// Cuando termina, avisa con un mensaje y el ejercicio queda en el banco.
import { signal } from '@preact/signals';
import { aiErrorMessage } from '../ai/client';
import { AiError } from '../ai/types';
import { toast } from '../ui/components';
import { GenerationError, generateSet } from './generate';
import { PARTS, type PartId, type RueSet } from './schema';

export interface GenJob {
  part: PartId;
  step: string;
  startedAt: number;
  done?: RueSet;
  error?: string;
}

export const jobs = signal<Partial<Record<PartId, GenJob>>>({});
const controllers = new Map<PartId, AbortController>();

function update(part: PartId, patch: Partial<GenJob>) {
  const cur = jobs.value[part];
  if (!cur) return;
  jobs.value = { ...jobs.value, [part]: { ...cur, ...patch } };
}

export function clearJob(part: PartId) {
  const next = { ...jobs.value };
  delete next[part];
  jobs.value = next;
}

export function cancelJob(part: PartId) {
  controllers.get(part)?.abort();
}

/** Empieza a generar (si no hay ya un trabajo en marcha para esa parte). */
export function startJob(part: PartId): void {
  const cur = jobs.value[part];
  if (cur && !cur.done && !cur.error) return;
  const ctrl = new AbortController();
  controllers.set(part, ctrl);
  jobs.value = { ...jobs.value, [part]: { part, step: 'Preparando…', startedAt: Date.now() } };
  generateSet(part, { signal: ctrl.signal, onStep: (step) => update(part, { step }) })
    .then((set) => {
      update(part, { done: set });
      if (!location.hash.includes(`/practicar/rue/${part}`)) toast(`Ejercicio nuevo listo: ${PARTS[part].name}`, 4000);
    })
    .catch((e) => {
      if ((e as Error).name === 'AbortError') return clearJob(part);
      const msg =
        e instanceof GenerationError
          ? `El ejercicio generado no ha pasado el control de calidad y se ha descartado (${e.issues[0]}).`
          : e instanceof AiError
            ? aiErrorMessage(e)
            : 'No se ha podido generar.';
      update(part, { error: msg });
    })
    .finally(() => controllers.delete(part));
}
