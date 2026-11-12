// Aviso al terminar una parte del diagnóstico: «guardado» y botón a la siguiente parte.
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { getRun, nextPart, partRoute, type DiagPart } from '../diagnostic/run';
import { navigate } from '../router';

export function DiagContinue() {
  const [next, setNext] = useState<DiagPart | null | undefined>(undefined);
  useEffect(() => {
    // Pequeña espera: la parte se guarda justo al corregir.
    const t = setTimeout(() => {
      getRun()
        .then((r) => setNext(r && !r.finishedAt ? nextPart(r) : null))
        .catch(() => setNext(null));
    }, 1200);
    return () => clearTimeout(t);
  }, []);
  return (
    <section class="card card-line stack" style={{ '--gap': '8px', '--card-line': 'var(--signal)' } as JSX.CSSProperties}>
      <span class="kicker">Diagnóstico</span>
      <span class="small">Esta parte ya está guardada en tu diagnóstico.</span>
      {next === undefined ? null : next ? (
        <button class="btn signal" onClick={() => navigate(partRoute(next), { replace: true })}>
          Siguiente: {next.label}
        </button>
      ) : null}
      <button class="btn quiet" onClick={() => navigate('/diagnostico', { replace: true })}>
        Ver el diagnóstico
      </button>
    </section>
  );
}
