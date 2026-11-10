// Cola de tareas que necesitan IA sí o sí (corregir un writing, evaluar un speaking).
// Si la IA no está disponible, se guardan en users/{uid}/queue y se procesan al volver.
import { signal } from '@preact/signals';
import { hasStore, store } from '../state';
import { AiError } from './types';

export interface QueueItem {
  id: string;
  kind: string; // p. ej. 'correct-writing'
  label: string; // texto para mostrar
  payload: Record<string, unknown>;
  status: 'pending' | 'done' | 'failed';
  attempts: number;
  createdAt: number;
  lastError?: string;
}

type Handler = (item: QueueItem) => Promise<void>;
const handlers = new Map<string, Handler>();

export const pendingCount = signal(0);

export function registerQueueHandler(kind: string, fn: Handler): void {
  handlers.set(kind, fn);
}

export async function enqueue(kind: string, label: string, payload: Record<string, unknown>): Promise<string> {
  const id = await store().add('queue', { kind, label, payload, status: 'pending', attempts: 0, createdAt: Date.now() });
  pendingCount.value++;
  return id;
}

export async function listPending(): Promise<QueueItem[]> {
  if (!hasStore()) return [];
  const rows = await store().list<Omit<QueueItem, 'id'>>('queue', { where: [['status', '==', 'pending']] });
  pendingCount.value = rows.length;
  return rows;
}

let running = false;

/** Procesa lo pendiente. Se para en cuanto la IA vuelve a fallar por cuota o red. */
export async function processQueue(): Promise<{ done: number; left: number }> {
  if (running || !hasStore()) return { done: 0, left: pendingCount.value };
  running = true;
  let done = 0;
  try {
    const items = await listPending();
    for (const item of items.sort((a, b) => a.createdAt - b.createdAt)) {
      const fn = handlers.get(item.kind);
      if (!fn) continue;
      try {
        await fn(item);
        await store().set(`queue/${item.id}`, { status: 'done', doneAt: Date.now() }, { merge: true });
        done++;
      } catch (e) {
        const stop = e instanceof AiError && ['quota-day', 'network', 'rate', 'overloaded', 'budget', 'config', 'auth'].includes(e.kind);
        await store().set(
          `queue/${item.id}`,
          { attempts: item.attempts + 1, lastError: (e as Error).message, ...(item.attempts + 1 >= 5 && !stop ? { status: 'failed' } : {}) },
          { merge: true },
        );
        if (stop) break;
      }
    }
  } finally {
    running = false;
  }
  const left = (await listPending()).length;
  return { done, left };
}
