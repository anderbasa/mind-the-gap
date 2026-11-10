// Firebase (Auth con Google + Firestore). Se carga solo fuera del modo demo.
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  limit,
  increment,
  type Firestore,
  type QueryConstraint,
} from 'firebase/firestore';
import { FIREBASE_CONFIG } from '../config';
import type { Store } from './store';

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;

function init() {
  if (app) return;
  app = initializeApp(FIREBASE_CONFIG);
  auth = getAuth(app);
  try {
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    db = getFirestore(app);
  }
}

export function firebaseAuth(): Auth {
  init();
  return auth!;
}

export function watchUser(cb: (u: User | null, err?: unknown) => void): () => void {
  const a = firebaseAuth();
  getRedirectResult(a).catch((e) => cb(null, e));
  return onAuthStateChanged(a, (u) => cb(u));
}

/** Ventana emergente y, si el navegador no la deja (algunas apps instaladas en iPhone), redirección. */
export async function signInWithGoogle(): Promise<void> {
  const a = firebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(a, provider);
  } catch (e) {
    const code = (e as { code?: string }).code ?? '';
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(code)) {
      await signInWithRedirect(a, provider);
      return;
    }
    throw e;
  }
}

export function signOutUser(): Promise<void> {
  return signOut(firebaseAuth());
}

export async function getIdToken(): Promise<string | null> {
  const u = firebaseAuth().currentUser;
  return u ? u.getIdToken() : null;
}

export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  if (code.includes('popup-closed') || code.includes('cancelled-popup')) return 'Has cerrado la ventana de Google antes de terminar.';
  if (code.includes('network-request-failed')) return 'No hay conexión. Para entrar la primera vez necesitas internet.';
  if (code.includes('unauthorized-domain')) return 'Este dominio no está autorizado en Firebase (Authentication → Configuración → Dominios autorizados).';
  if (code.includes('operation-not-allowed')) return 'El inicio de sesión con Google aún no está activado en Firebase (mira el README, paso 1).';
  if (code.includes('too-many-requests')) return 'Demasiados intentos seguidos. Espera unos minutos.';
  if (code.includes('web-storage-unsupported')) return 'Este navegador no deja guardar la sesión (¿modo privado?).';
  if (code.includes('missing-initial-state')) return 'Safari ha perdido el inicio de sesión a medio camino. Vuelve a pulsar «Entrar con Google».';
  return 'No se ha podido iniciar sesión. Inténtalo de nuevo.';
}

/* ── Store sobre Firestore ──────────────────────────────────────── */

export function createFirestoreStore(uid: string): Store {
  init();
  const d = db!;
  const ref = (path: string) => doc(d, 'users', uid, ...path.split('/'));
  const col = (path: string) => collection(d, 'users', uid, ...path.split('/'));

  return {
    uid,
    async get<T>(path: string) {
      const s = await getDoc(ref(path));
      return s.exists() ? (s.data() as T) : null;
    },
    async set(path, data, opts) {
      await setDoc(ref(path), data, { merge: !!opts?.merge });
    },
    async add(path, data) {
      const r = await addDoc(col(path), data);
      return r.id;
    },
    async remove(path) {
      await deleteDoc(ref(path));
    },
    async list<T>(path: string, opts: { orderBy?: string; desc?: boolean; limit?: number; where?: [string, '==' | '<=' | '>=' | '<' | '>', unknown][] } = {}) {
      const cons: QueryConstraint[] = [];
      for (const [f, op, v] of opts.where ?? []) cons.push(where(f, op, v));
      if (opts.orderBy) cons.push(orderBy(opts.orderBy, opts.desc ? 'desc' : 'asc'));
      if (opts.limit) cons.push(limit(opts.limit));
      const snap = await getDocs(query(col(path), ...cons));
      return snap.docs.map((x) => ({ ...(x.data() as T), id: x.id }));
    },
    watch<T>(path: string, cb: (v: T | null) => void, onError?: (e: unknown) => void) {
      return onSnapshot(
        ref(path),
        (s) => cb(s.exists() ? (s.data() as T) : null),
        (e) => onError?.(e),
      );
    },
    inc(n: number) {
      return increment(n);
    },
  };
}
