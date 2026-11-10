// Tema claro/oscuro: preferencia de este dispositivo (no se sincroniza)
import { signal } from '@preact/signals';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'mtg.theme';

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* almacenamiento bloqueado: usamos el del sistema */
  }
  return 'system';
}

export const themePref = signal<ThemePref>(read());

export function applyTheme(pref: ThemePref = themePref.value): void {
  const root = document.documentElement;
  if (pref === 'system') delete root.dataset.theme;
  else root.dataset.theme = pref;
}

export function setTheme(pref: ThemePref): void {
  themePref.value = pref;
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* sin almacenamiento: solo dura esta sesión */
  }
  applyTheme(pref);
}
