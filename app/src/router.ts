// Router por hash (#/ruta?param=x): funciona en GitHub Pages sin trucos de 404
// y permite enlaces directos desde Telegram.
import { signal } from '@preact/signals';

export interface Route {
  path: string;
  query: URLSearchParams;
}

function parse(): Route {
  const raw = (typeof location !== 'undefined' ? location.hash : '').replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path || '/', query: new URLSearchParams(qs) };
}

export const route = signal<Route>(parse());

if (typeof window !== 'undefined') addEventListener('hashchange', () => {
  route.value = parse();
  window.scrollTo(0, 0);
});

let depth = 0; // pantallas apiladas dentro de la app (para saber si «atrás» sale de ella)

export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  const url = `${location.pathname}${location.search}#${path}`;
  if (opts.replace) history.replaceState(null, '', url);
  else {
    history.pushState(null, '', url);
    depth++;
  }
  route.value = parse();
  window.scrollTo(0, 0);
}

export function goBack(fallback = '/'): void {
  if (depth > 0) {
    depth--;
    history.back();
  } else navigate(fallback, { replace: true });
}

export function isActive(tabPath: string, current: string): boolean {
  if (tabPath === '/') return current === '/';
  return current === tabPath || current.startsWith(tabPath + '/');
}
