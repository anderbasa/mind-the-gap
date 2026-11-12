// Aviso al terminar una parte del diagnóstico: «guardado» y botón a la siguiente parte.
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { activeRun, nextPart, partRoute, type DiagPart, type RunDoc } from '../diagnostic/run';
import { navigate } from '../router';

export function DiagContinue() {
  const [next, setNext] = useState<DiagPart | null | undefined>(undefined);
  const [doc, setDoc] = useState<RunDoc>('diagnostic');
  useEffect(() => {
    // Pequeña espera: la parte se guarda justo al corregir.
    const t = setTimeout(() => {
      activeRun()
        .then((a) => {
          if (a) setDoc(a.doc);
          setNext(a ? nextPart(a.run) : null);
        })
        .catch(() => setNext(null));
    }, 1200);
    return () => clearTimeout(t);
  }, []);
  return (
    <section class="card card-line stack" style={{ '--gap': '8px', '--card-line': 'var(--signal)' } as JSX.CSSProperties}>
      <span class="kicker">{doc === 'mock' ? 'Simulacro' : 'Diagnóstico'}</span>
      <span class="small">Esta parte ya está guardada en tu {doc === 'mock' ? 'simulacro' : 'diagnóstico'}.</span>
      {next === undefined ? null : next ? (
        <button class="btn signal" onClick={() => navigate(partRoute(next, doc), { replace: true })}>
          Siguiente: {next.label}
        </button>
      ) : null}
      <button class="btn quiet" onClick={() => navigate(doc === 'mock' ? '/simulacro' : '/diagnostico', { replace: true })}>
        {doc === 'mock' ? 'Ver el simulacro' : 'Ver el diagnóstico'}
      </button>
    </section>
  );
}
