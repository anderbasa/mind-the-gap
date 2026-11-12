// Informe semanal: números de los últimos 7 días y el resumen de Theo.
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { aiErrorMessage } from '../ai/client';
import { getReport, makeReport, weekStats, type Report, type WeekStats } from '../planner/weekly';
import { Band, Page, Spinner, toast } from '../ui/components';
import { ExplainEs } from '../ui/ExplainEs';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;

export function Informe() {
  const [st, setSt] = useState<WeekStats | null>(null);
  const [rep, setRep] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    weekStats().then(setSt);
    getReport()
      .then(setRep)
      .catch(() => undefined);
  }, []);

  const make = async () => {
    if (!st) return;
    setBusy(true);
    try {
      setRep(await makeReport(st));
    } catch (e) {
      toast(aiErrorMessage(e), 4000);
    } finally {
      setBusy(false);
    }
  };

  const trend = st && st.scores.length >= 2 ? st.scores[st.scores.length - 1].overall - st.scores[st.scores.length - 2].overall : null;
  const cells: [string, string][] = st
    ? [
        ['Sesiones', String(st.sessions)],
        ['Minutos (tareas hechas)', String(st.minutesPlanned)],
        ['Reading y Use of English', st.rue.n ? `${st.rue.n} · ${st.rue.pct} %` : '—'],
        ['Listening', st.listening.n ? `${st.listening.n} · ${st.listening.pct} %` : '—'],
        ['Writings', st.writings.n ? `${st.writings.n} · ${st.writings.avg20}/20` : '—'],
        ['Speakings', st.speakings.n ? `${st.speakings.n} · ≈${st.speakings.avgScale}` : '—'],
        ['Tarjetas repasadas', String(st.cardsReviewed)],
        ['Palabras dominadas', String(st.mastered)],
        ['Errores nuevos', String(st.errors)],
        ['Gramática dominada', `${st.grammarDone} de 12`],
      ]
    : [];

  return (
    <>
      <Band back="/" kicker="Mind the Gap · Informe" title="Tu semana" sub="Los últimos 7 días" line="var(--signal)" />
      <Page>
        {!st && <Spinner />}
        {st && (
          <section class="card stack" style={g(10)}>
            <div class="wgrid">
              {cells.map(([k, v]) => (
                <div key={k} class="stack" style={g(0)}>
                  <strong class="tabular" style={{ fontSize: '20px' }}>
                    {v}
                  </strong>
                  <span class="small muted">{k}</span>
                </div>
              ))}
            </div>
            {st.scores.length > 0 && (
              <p class="small">
                Nota estimada: {st.scores.map((x) => `≈${x.overall}`).join(' → ')}
                {trend != null ? ` (${trend >= 0 ? '+' : ''}${trend})` : ''}
              </p>
            )}
          </section>
        )}
        {rep ? (
          <section class="card card-line stack" style={{ ...g(8), '--card-line': 'var(--signal)' } as JSX.CSSProperties}>
            <span class="kicker">Theo</span>
            <p class="read">{rep.summary}</p>
            {rep.wins.length > 0 && (
              <>
                <strong class="small">Lo mejor de la semana</strong>
                <ul class="tight small">{rep.wins.map((w) => <li key={w}>{w}</li>)}</ul>
              </>
            )}
            <strong class="small">La semana que viene</strong>
            <ul class="tight small">{rep.focus.map((w) => <li key={w}>{w}</li>)}</ul>
            <p class="small">
              <strong>Reto:</strong> {rep.challenge}
            </p>
            <ExplainEs message={`${rep.summary}\nNext week: ${rep.focus.join('; ')}\nChallenge: ${rep.challenge}`} />
          </section>
        ) : busy ? (
          <Spinner label="Theo está escribiendo tu informe…" />
        ) : (
          st && (
            <button class="btn signal" onClick={make}>
              Pedir el resumen de Theo (gratis)
            </button>
          )
        )}
        {rep && !busy && (
          <button class="linkbtn" onClick={make}>
            Rehacer el resumen con los datos de ahora
          </button>
        )}
      </Page>
    </>
  );
}
