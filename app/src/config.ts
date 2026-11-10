// Configuración pública (la config web de Firebase no es secreta: la seguridad
// está en las reglas de Firestore y en el Worker, que solo aceptan tu UID).

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAKF4sIrVuXsLlG-m8ZCFPX-JT9En-BVFo',
  authDomain: 'mind-the-gap-ander.firebaseapp.com',
  projectId: 'mind-the-gap-ander',
  storageBucket: 'mind-the-gap-ander.firebasestorage.app',
  messagingSenderId: '341492150984',
  appId: '1:341492150984:web:e9bd857830e87a11a2abfd',
};

const LOCAL_HOSTS = ['localhost', '127.0.0.1'];

/** Modo demo: solo en local con ?demo. Datos en este navegador y sin IA real. */
export const IS_DEMO =
  typeof location !== 'undefined' && LOCAL_HOSTS.includes(location.hostname) && new URLSearchParams(location.search).has('demo');

const WORKER_KEY = 'mtg.workerUrl';

/** Dirección pública del Worker (no es secreta: solo atiende a tu UID). */
const DEFAULT_WORKER_URL = 'https://mind-the-gap.mind-the-gap-worker.workers.dev';

/** URL del Cloudflare Worker. Se puede cambiar en Ajustes → Conexión. */
export function getWorkerUrl(): string {
  try {
    const custom = localStorage.getItem(WORKER_KEY);
    if (custom) return custom.replace(/\/+$/, '');
  } catch {
    /* sin almacenamiento */
  }
  return (import.meta.env.VITE_WORKER_URL || DEFAULT_WORKER_URL).replace(/\/+$/, '');
}

export function setWorkerUrl(url: string): void {
  try {
    if (url.trim()) localStorage.setItem(WORKER_KEY, url.trim());
    else localStorage.removeItem(WORKER_KEY);
  } catch {
    /* sin almacenamiento */
  }
}

export const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? 'dev';
