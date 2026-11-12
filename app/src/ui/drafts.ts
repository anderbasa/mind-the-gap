// Borradores en el propio dispositivo: si la app se actualiza o el iPhone la cierra a mitad de un
// ejercicio, al volver sigues donde lo dejaste. Caducan solos (por defecto, a los 3 días).
const PREFIX = 'mtg.draft.';

export function loadDraft<T>(key: string, maxAgeMs = 3 * 86_400_000): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const d = JSON.parse(raw) as { v: T; at: number };
    if (!d || Date.now() - d.at > maxAgeMs) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return d.v;
  } catch {
    return null;
  }
}

export function saveDraft<T>(key: string, v: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ v, at: Date.now() }));
  } catch {
    /* sin almacenamiento (modo privado): no pasa nada */
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* nada */
  }
}
