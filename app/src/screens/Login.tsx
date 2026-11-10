import { useState } from 'preact/hooks';
import { session, signIn } from '../state';
import { MetroLine } from '../ui/components';

export function Login() {
  const [busy, setBusy] = useState(false);
  const s = session.value;
  const error = s.status === 'signedOut' ? s.error : undefined;
  return (
    <div class="center-screen">
      <div class="stack" style={{ '--gap': '22px', maxWidth: '420px', width: '100%' }}>
        <div class="stack" style={{ '--gap': '6px' }}>
          <span class="kicker">Tu profe de inglés · C1 Advanced</span>
          <h1 style={{ fontSize: '46px', lineHeight: 1 }}>
            Mind the <em style={{ color: 'var(--signal)' }}>Gap</em>
          </h1>
        </div>
        <MetroLine estimate={null} />
        <p class="read">
          Theo mide tu nivel real, decide qué te toca practicar cada día y te dice cuándo estás listo para presentarte.
        </p>
        {error && <div class="notice bad">{error}</div>}
        <button
          class="btn signal block"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await signIn();
            setBusy(false);
          }}
        >
          {busy ? 'Abriendo Google…' : 'Entrar con Google'}
        </button>
        <p class="muted small">Solo funciona con tu cuenta. Tus datos se guardan en tu Firebase y no se comparten.</p>
      </div>
    </div>
  );
}

export function Splash() {
  return (
    <div class="center-screen">
      <div class="stack" style={{ '--gap': '14px', alignItems: 'center' }}>
        <div class="spinner" />
        <span class="kicker">Mind the Gap</span>
      </div>
    </div>
  );
}
