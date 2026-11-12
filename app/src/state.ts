// Estado global de la app: sesión, perfil y ajustes (signals de Preact).
import { signal } from '@preact/signals';
import { IS_DEMO } from './config';
import { createLocalStore, type Store } from './data/store';
import { parseProfile, type Profile } from './domain/profile';
import { DEFAULT_SETTINGS, parseSettings, type Settings } from './domain/settings';

export interface UserInfo {
  uid: string;
  name: string;
  email?: string;
}

export type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut'; error?: string }
  | { status: 'unauthorized'; user: UserInfo }
  | { status: 'ready'; user: UserInfo };

/** Perfil ficticio para el modo demo (los datos reales nunca van en el repo). */
const DEMO_PROFILE: Record<string, unknown> = {
  name: 'Alex',
  age: '20',
  city: 'Una ciudad cualquiera',
  studies: 'Grado universitario (perfil de prueba)',
  currentLevel: 'B2 First (perfil de prueba)',
  goal: 'C1 Advanced con 180 o más',
  strugglesSpeaking: 'Frases demasiado simples; me cuesta hablar 1 minuto seguido',
  strugglesWriting: 'Estructura, conectores y vocabulario repetido',
  confirmedAt: null,
};

export const session = signal<SessionState>({ status: 'loading' });
export const profile = signal<Profile | null>(null);
export const settings = signal<Settings>(DEFAULT_SETTINGS);

let current: Store | null = null;
let unsubs: (() => void)[] = [];

export function store(): Store {
  if (!current) throw new Error('No hay sesión iniciada');
  return current;
}

export function hasStore(): boolean {
  return current !== null;
}

function isPermissionDenied(e: unknown): boolean {
  const code = (e as { code?: string })?.code ?? '';
  return code === 'permission-denied' || code.endsWith('/permission-denied');
}

function detach() {
  unsubs.forEach((f) => f());
  unsubs = [];
  current = null;
  profile.value = null;
}

function attach(s: Store, user: UserInfo) {
  detach();
  current = s;
  const onErr = (e: unknown) => {
    if (isPermissionDenied(e)) session.value = { status: 'unauthorized', user };
    else console.error('[firestore]', e);
  };
  unsubs.push(
    s.watch(
      'meta/profile',
      (v) => {
        profile.value = parseProfile(v);
        if (session.value.status !== 'ready') session.value = { status: 'ready', user };
      },
      onErr,
    ),
  );
  unsubs.push(s.watch('meta/settings', (v) => (settings.value = parseSettings(v)), onErr));
  // Memoria de Theo: se carga aparte para no crear dependencias circulares.
  void import('./tutor/notes').then((m) => unsubs.push(s.watch('tutorNotes/current', (v) => m.onNotesDoc(v as never), onErr)));
}

export async function boot(): Promise<void> {
  if (IS_DEMO) {
    const s = createLocalStore('demo');
    if (!(await s.get('meta/profile'))) await s.set('meta/profile', DEMO_PROFILE);
    attach(s, { uid: 'demo', name: 'Demo' });
    return;
  }
  const fb = await import('./data/firebase');
  fb.watchUser((u, err) => {
    if (err) {
      session.value = { status: 'signedOut', error: fb.authErrorMessage(err) };
      return;
    }
    if (!u) {
      detach();
      session.value = { status: 'signedOut' };
      return;
    }
    attach(fb.createFirestoreStore(u.uid), { uid: u.uid, name: u.displayName ?? '', email: u.email ?? undefined });
  });
}

export async function signIn(): Promise<void> {
  const fb = await import('./data/firebase');
  try {
    await fb.signInWithGoogle();
  } catch (e) {
    session.value = { status: 'signedOut', error: fb.authErrorMessage(e) };
  }
}

export async function signOut(): Promise<void> {
  if (IS_DEMO) return;
  const fb = await import('./data/firebase');
  await fb.signOutUser();
}

export async function idToken(): Promise<string | null> {
  if (IS_DEMO) return null;
  const fb = await import('./data/firebase');
  return fb.getIdToken();
}

export async function saveProfile(p: Profile): Promise<void> {
  await store().set('meta/profile', { ...p });
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await store().set('meta/settings', patch as Record<string, unknown>, { merge: true });
}
