// Diagnóstico de nivel: 5 bloques reanudables y, al final, tu nota estimada por destreza.
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { BLOCKS, finishRun, getRun, nextPart, partRoute, skillsOf, startRun, type DiagRun } from '../diagnostic/run';
import { SKILL_ORDER, SKILLS } from '../domain/skills';
import { overallOf } from '../scoring/estimate';
import { navigate, route } from '../router';
import { updateTutorNotes } from '../tutor/notes';
import { Band, MetroLine, Page, SkillLine, Spinner, toast } from '../ui/components';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;

export function Diagnostico() {
  const [run, setRun] = useState<DiagRun | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const mini = route.value.query.get('mini') === '1';

  const load = () =>
    getRun()
      .then(setRun)
      .catch(() => setRun(null));
  useEffect(() => {
    void load();
  }, []);

  const begin = async (mode: 'full' | 'mini') => {
    setBusy('Preparando el diagnóstico…');
    try {
      const r = await startRun(mode);
      setRun(r);
    } catch (e) {
      toast((e as Error).message || 'No se ha podido preparar.', 4000);
    } finally {
      setBusy(null);
    }
  };

  const finish = async () => {
    if (!run) return;
    setBusy('Calculando tu nivel…');
    try {
      const r = await finishRun(run);
      setRun({ ...r });
      setBusy('Theo está anotando lo que ha visto…');
      await updateTutorNotes(`${run.mode === 'full' ? 'Full' : 'Monthly mini'} diagnostic finished: ${JSON.stringify(r.result)}`, { force: true });
    } finally {
      setBusy(null);
    }
  };

  if (run === undefined) return <Spinner />;

  const active = run && !run.finishedAt ? run : null;
  const allDone = !!active && active.parts.every((p) => p.done);
  const next = active ? nextPart(active) : null;
  const partial = active ? skillsOf(active) : {};

  return (
    <>
      <Band back="/" kicker="Mind the Gap · Diagnóstico" title="¿Dónde estás de verdad?" sub="Theo no se fía de tu nota del First: lo mide él." line="var(--signal)" />
      <Page>
        {busy && <Spinner label={busy} />}

        {!active && !busy && (
          <section class="card stack" style={g(10)}>
            {run?.result && (
              <>
                <span class="kicker">Tu último diagnóstico · {new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long' }).format(run.finishedAt!)}</span>
                <MetroLine estimate={run.result.overall} />
                {SKILL_ORDER.map((k) => (
                  <SkillLine key={k} label={SKILLS[k].label} color={SKILLS[k].color} score={run.result!.skills[k] ?? null} />
                ))}
                <p class="muted small">
                  Notas orientativas en la escala Cambridge (global = media de las cinco). Se calibrarán con las tablas oficiales en la Fase 7. Lo que Theo ha anotado
                  está en <a href="#/ajustes/theo">Ajustes → Lo que Theo sabe de ti</a>.
                </p>
              </>
            )}
            <p class="small">
              {run?.result
                ? 'Puedes repetirlo cuando quieras, o hacer el mini-diagnóstico mensual (~20 min).'
                : 'Unos 60–80 minutos en 5 bloques: puedes hacerlos en días distintos, se guarda dónde lo dejas. Todo en modo examen, sin pistas. Necesitas auriculares para el Listening y un sitio tranquilo para hablar.'}
            </p>
            {!mini && (
              <button class="btn signal" onClick={() => begin('full')}>
                {run?.result ? 'Repetir el diagnóstico completo' : 'Empezar el diagnóstico'}
              </button>
            )}
            {(run?.result || mini) && (
              <button class="btn quiet" onClick={() => begin('mini')}>
                Mini-diagnóstico (~20 min)
              </button>
            )}
          </section>
        )}

        {active && (
          <>
            <div class="list">
              {BLOCKS.filter((b) => active.parts.some((p) => p.block === b.id)).map((b) => {
                const ps = active.parts.filter((p) => p.block === b.id);
                const done = ps.every((p) => p.done);
                const first = ps.find((p) => !p.done);
                const score = partial[b.id === 'uoe' ? 'uoe' : b.id];
                return (
                  <button key={b.id} class="list-item" onClick={() => first && navigate(partRoute(first))} disabled={done} style={done ? { cursor: 'default' } : undefined}>
                    <span class="line-dot" style={{ '--dot': done ? 'var(--ok)' : 'var(--signal)' } as JSX.CSSProperties} />
                    <span class="grow">
                      <span class="list-title" style={{ display: 'block' }}>
                        {b.title} <span class="small muted">· ~{b.minutes} min</span>
                      </span>
                      <span class="list-sub" style={{ display: 'block' }}>
                        {ps.map((p) => `${p.done ? '✓' : '○'} ${p.label}`).join(' · ')}
                      </span>
                    </span>
                    {done ? <span class="pill ok">{score != null ? `≈ ${score}` : 'Hecho'}</span> : <span class="pill">Empezar</span>}
                  </button>
                );
              })}
            </div>
            {next && (
              <button class="btn signal" onClick={() => navigate(partRoute(next))}>
                Seguir: {next.label}
              </button>
            )}
            {allDone && (
              <button class="btn signal" onClick={finish} disabled={!!busy}>
                Ver mi nivel
              </button>
            )}
            {!allDone && Object.keys(partial).length > 0 && (
              <p class="muted small">
                Hasta ahora: {Object.entries(partial)
                  .map(([k, v]) => `${SKILLS[k as keyof typeof SKILLS].label} ≈ ${v}`)
                  .join(' · ')}{' '}
                {overallOf(partial) != null ? `(global provisional ≈ ${overallOf(partial)})` : ''}
              </p>
            )}
            <button
              class="linkbtn"
              onClick={() => {
                if (confirm('¿Empezar de cero? Se pierde lo hecho en este diagnóstico.')) void begin(active.mode);
              }}
            >
              Empezar de cero
            </button>
          </>
        )}
      </Page>
    </>
  );
}
