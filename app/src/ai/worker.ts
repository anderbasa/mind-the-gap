// Llamadas al Cloudflare Worker, que es quien guarda las claves de API.
// Cada petición lleva el ID token de Firebase; el Worker solo acepta tu UID.
import { getWorkerUrl } from '../config';
import { idToken } from '../state';
import { AiError } from './types';

export async function workerFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = getWorkerUrl();
  if (!base) throw new AiError('config', 'Falta la dirección del Worker (Ajustes → Conexión).');
  const token = await idToken();
  if (!token) throw new AiError('auth', 'No hay sesión iniciada.');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  try {
    return await fetch(base + path, { ...init, headers });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new AiError('network', 'Sin conexión con el Worker.');
  }
}

export async function workerJson<T>(path: string, body: unknown, signal?: AbortSignal, timeoutMs?: number): Promise<{ res: Response; json: T }> {
  // Une la cancelación del usuario con un tiempo máximo por intento.
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = timeoutMs
    ? setTimeout(() => {
        timedOut = true;
        ctrl.abort();
      }, timeoutMs)
    : undefined;
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  let res: Response;
  try {
    res = await workerFetch(path, { method: 'POST', body: JSON.stringify(body), signal: ctrl.signal });
  } catch (e) {
    if (timedOut) throw new AiError('timeout', `El modelo ha tardado más de ${Math.round(timeoutMs! / 1000)} s.`);
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
  let json: T;
  try {
    json = (await res.json()) as T;
  } catch {
    json = {} as T;
  }
  return { res, json };
}
