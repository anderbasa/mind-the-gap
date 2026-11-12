// «Lo que Theo sabe de ti»: su memoria, que lee antes de cada conversación, corrección o lección.
import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { tutorNotes, updateTutorNotes } from '../tutor/notes';
import { Band, Page, Spinner, toast } from '../ui/components';
import { ExplainEs } from '../ui/ExplainEs';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;

export function TheoNotes() {
  const n = tutorNotes.value;
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    setBusy(true);
    const r = await updateTutorNotes('The student asked Theo to review his notes now', { force: true });
    setBusy(false);
    if (!r) toast('No se han podido actualizar ahora. Prueba en un rato.', 4000);
  };
  return (
    <>
      <Band back="/ajustes" kicker="Ajustes · Theo" title="Lo que Theo sabe de ti" sub="Su memoria: la lee antes de cada clase" line="var(--signal)" />
      <Page>
        {!n && (
          <section class="card stack" style={g(8)}>
            <p class="small">
              Theo aún no ha escrito notas sobre ti. Las escribe tras el diagnóstico, cada writing corregido y cada speaking, a partir de lo que haces (nunca inventa).
            </p>
          </section>
        )}
        {n && (
          <>
            <section class="card card-line stack" style={{ ...g(8), '--card-line': 'var(--signal)' } as JSX.CSSProperties}>
              <div class="spread">
                <span class="kicker">Resumen</span>
                <span class="small muted">{new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(n.updatedAt)}</span>
              </div>
              <p class="read">{n.summary}</p>
              <p class="small">
                <strong>Nivel según Theo:</strong> {n.levelGuess}
              </p>
              <ExplainEs message={`${n.summary}\nLevel: ${n.levelGuess}`} />
            </section>
            <section class="card stack" style={g(8)}>
              <span class="kicker">Puntos fuertes</span>
              <ul class="tight small">{n.strengths.map((x) => <li key={x}>{x}</li>)}</ul>
              <span class="kicker">Lo que más te resta</span>
              <ul class="tight small">{n.weaknesses.map((x) => <li key={x}>{x}</li>)}</ul>
              {n.patterns.length > 0 && (
                <>
                  <span class="kicker">Errores que se repiten</span>
                  <ul class="tight small">{n.patterns.map((x) => <li key={x}>{x}</li>)}</ul>
                </>
              )}
            </section>
            <section class="card stack" style={g(6)}>
              <span class="kicker">Mini reto pendiente</span>
              <p class="read">{n.nextChallenge}</p>
            </section>
          </>
        )}
        {busy ? (
          <Spinner label="Theo está repasando tu actividad…" />
        ) : (
          <button class="btn quiet" onClick={refresh}>
            Actualizar ahora
          </button>
        )}
      </Page>
    </>
  );
}
