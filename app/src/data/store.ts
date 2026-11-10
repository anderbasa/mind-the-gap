// Almacén de documentos con dos implementaciones de la misma interfaz:
//  - Firestore (la de verdad), con caché local persistente.
//  - Local (modo demo): localStorage de este navegador.
// Todas las rutas son relativas a users/{uid}/.

export type Where = [field: string, op: '==' | '<=' | '>=' | '<' | '>', value: unknown];

export interface ListOpts {
  orderBy?: string;
  desc?: boolean;
  limit?: number;
  where?: Where[];
}

export interface Store {
  readonly uid: string;
  get<T = Record<string, unknown>>(path: string): Promise<T | null>;
  set(path: string, data: Record<string, unknown>, opts?: { merge?: boolean }): Promise<void>;
  add(col: string, data: Record<string, unknown>): Promise<string>;
  remove(path: string): Promise<void>;
  list<T = Record<string, unknown>>(col: string, opts?: ListOpts): Promise<(T & { id: string })[]>;
  watch<T = Record<string, unknown>>(path: string, cb: (v: T | null) => void, onError?: (e: unknown) => void): () => void;
  /** Valor centinela para sumar a un número existente (merge). */
  inc(n: number): unknown;
}

/* ── Implementación local (demo y tests) ─────────────────────────── */

const INC = '__inc__';

function applyMerge(target: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...target };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && INC in (v as object)) {
      out[k] = (typeof out[k] === 'number' ? (out[k] as number) : 0) + (v as Record<string, number>)[INC];
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = applyMerge((out[k] as Record<string, unknown>) ?? {}, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function stripInc(data: Record<string, unknown>): Record<string, unknown> {
  return applyMerge({}, data);
}

export function createLocalStore(uid = 'demo', storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): Store {
  const KEY = `mtg.demo.${uid}`;
  const listeners = new Map<string, Set<(v: unknown) => void>>();
  const load = (): Record<string, Record<string, unknown>> => {
    try {
      return JSON.parse(storage.getItem(KEY) ?? '{}');
    } catch {
      return {};
    }
  };
  const save = (db: Record<string, Record<string, unknown>>) => storage.setItem(KEY, JSON.stringify(db));
  const notify = (path: string, v: unknown) => listeners.get(path)?.forEach((fn) => fn(v));
  const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const isIn = (path: string, col: string) => path.startsWith(col + '/') && !path.slice(col.length + 1).includes('/');

  return {
    uid,
    async get<T>(path: string) {
      return (load()[path] as T) ?? null;
    },
    async set(path, data, opts) {
      const db = load();
      db[path] = opts?.merge ? applyMerge(db[path] ?? {}, data) : stripInc(data);
      save(db);
      notify(path, db[path]);
    },
    async add(col, data) {
      const newId = id();
      await this.set(`${col}/${newId}`, data);
      return newId;
    },
    async remove(path) {
      const db = load();
      delete db[path];
      save(db);
      notify(path, null);
    },
    async list<T>(col: string, opts: ListOpts = {}) {
      const db = load();
      let rows = Object.entries(db)
        .filter(([p]) => isIn(p, col))
        .map(([p, v]) => ({ ...(v as T), id: p.slice(col.length + 1) }));
      for (const [f, op, val] of opts.where ?? []) {
        rows = rows.filter((r) => {
          const x = (r as Record<string, unknown>)[f] as never;
          const y = val as never;
          return op === '==' ? x === y : op === '<=' ? x <= y : op === '>=' ? x >= y : op === '<' ? x < y : x > y;
        });
      }
      if (opts.orderBy) {
        const k = opts.orderBy;
        rows.sort((a, b) => {
          const x = (a as Record<string, never>)[k];
          const y = (b as Record<string, never>)[k];
          return (x < y ? -1 : x > y ? 1 : 0) * (opts.desc ? -1 : 1);
        });
      }
      return opts.limit ? rows.slice(0, opts.limit) : rows;
    },
    watch<T>(path: string, cb: (v: T | null) => void) {
      const fn = (v: unknown) => cb((v as T) ?? null);
      if (!listeners.has(path)) listeners.set(path, new Set());
      listeners.get(path)!.add(fn);
      queueMicrotask(() => fn(load()[path] ?? null));
      return () => listeners.get(path)?.delete(fn);
    },
    inc(n: number) {
      return { [INC]: n };
    },
  };
}
