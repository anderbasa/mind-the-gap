import { render } from 'preact';
import { App } from './app';
import { applyTheme } from './ui/theme';
import { installAudioUnlock } from './voice/audio';
import './ui/tokens.css';
import './ui/base.css';

applyTheme();
installAudioUnlock();
render(<App />, document.getElementById('app')!);

if (import.meta.env.PROD) {
  // Actualización automática: al publicar una versión nueva, la app se recarga sola.
  // En el iPhone la app instalada se queda «dormida» en segundo plano, así que además
  // buscamos versión nueva cada vez que vuelves a ella y cada hora.
  import('virtual:pwa-register')
    .then(({ registerSW }) =>
      registerSW({
        immediate: true,
        onRegisteredSW(_url, reg) {
          if (!reg) return;
          const check = () => void reg.update().catch(() => undefined);
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') check();
          });
          setInterval(check, 60 * 60 * 1000);
        },
      }),
    )
    .catch(() => undefined);
}
