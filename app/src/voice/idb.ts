// IndexedDB del dispositivo: tus últimas grabaciones (nunca van a Firestore)
// y el audio generado, para reescucharlo sin volver a pedirlo.
const DB = 'mind-the-gap';
const VERSION = 1;
const KEEP_RECORDINGS = 20;

export interface StoredRecording {
  id: string;
  at: number;
  label: string;
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('recordings')) db.createObjectStore('recordings', { keyPath: 'id' }).createIndex('at', 'at');
        if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbp = null;
        reject(req.error);
      };
    });
  }
  return dbp;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const r = fn(t.objectStore(store));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }),
  );
}

export async function listRecordings(): Promise<StoredRecording[]> {
  const all = await tx<StoredRecording[]>('recordings', 'readonly', (s) => s.getAll() as IDBRequest<StoredRecording[]>);
  return all.sort((a, b) => b.at - a.at);
}

export async function saveRecording(r: Omit<StoredRecording, 'id' | 'at'>): Promise<StoredRecording> {
  const rec: StoredRecording = { ...r, id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, at: Date.now() };
  await tx('recordings', 'readwrite', (s) => s.put(rec));
  const all = await listRecordings();
  for (const old of all.slice(KEEP_RECORDINGS)) await tx('recordings', 'readwrite', (s) => s.delete(old.id));
  return rec;
}

export async function getAudio(key: string): Promise<Blob | undefined> {
  return tx<Blob | undefined>('audio', 'readonly', (s) => s.get(key) as IDBRequest<Blob | undefined>);
}

export async function putAudio(key: string, blob: Blob): Promise<void> {
  await tx('audio', 'readwrite', (s) => s.put(blob, key));
}

/** Cualquier valor clonable (p. ej. audio generado en el dispositivo + tiempos de cada frase). */
export async function getCached<T>(key: string): Promise<T | undefined> {
  return tx<T | undefined>('audio', 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
}

export async function putCached(key: string, value: unknown): Promise<void> {
  await tx('audio', 'readwrite', (s) => s.put(value, key));
}
