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
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true })).catch(() => undefined);
}
