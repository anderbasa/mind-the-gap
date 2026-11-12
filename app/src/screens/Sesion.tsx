// Sesión de hoy: tres preguntas (tiempo, si puedes hablar, energía) y un plan con «por qué te toca esto».
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { buildPlan, type CheckIn, type Plan } from '../planner/plan';
import { detectDone, gatherState, getToday, madridDay, saveToday, type SessionDoc } from '../planner/state';
import { navigate } from '../router';
import { Band, Page, Spinner, toast } from '../ui/components';
import { Fold } from '../ui/ExplainEs';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;
const CI_KEY = 'mtg.checkin';
const SKILL_ES = { reading: 'Reading', uoe: 'Use of English', writing: 'Writing', listening: 'Listening', speaking: 'Speaking' } as const;

function readCheckIn(): CheckIn {
  try {
    return { minutes: 30, canSpeak: true, energy: 'normal', ...(JSON.parse(localStorage.getItem(CI_KEY) ?? '{}') as Partial<CheckIn>) };
  } catch {
    return { minutes: 30, canSpeak: true, energy: 'normal' };
  }
}

function Choice<T extends string | number | boolean>(props: { label: string; value: T; options: { v: T; t: string }[]; onChange: (v: T) => void }) {
  return (
    <div class="stack" style={g(6)}>
      <strong class="small">{props.label}</strong>
      <div class="chips">
        {props.options.map((o) => (
          <button key={String(o.v)} class={`chip ${props.value === o.v ? 'on' : ''}`} aria-pressed={props.value === o.v} onClick={() => props.onChange(o.v)}>
            {o.t}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Sesion() {
  const [doc, setDoc] = useState<SessionDoc | null | undefined>(undefined);
  const [ci, setCi] = useState<CheckIn>(readCheckIn());
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<Plan['priorities']>([]);

  useEffect(() => {
    getToday()
      .then(async (d) => setDoc(d ? await detectDone(d) : null))
      .catch(() => setDoc(null));
  }, []);

  const build = async () => {
    setBusy(true);
    try {
      localStorage.setItem(CI_KEY, JSON.stringify(ci));
    } catch {
      /* nada */
    }
    try {
      const st = await gatherState();
      const plan = buildPlan(st, ci, Date.now(), new Date().getDate());
      setWhy(plan.priorities);
      const d: SessionDoc = { date: madridDay(), checkin: ci, tasks: plan.tasks, greeting: plan.greeting, startedAt: Date.now() };
      await saveToday(d);
      setDoc(d);
    } catch (e) {
      toast((e as Error).message || 'No se ha podido montar la sesión.', 4000);
    } finally {
      setBusy(false);
    }
  };

  const markDone = async (id: string) => {
    if (!doc) return;
    const d = { ...doc, tasks: doc.tasks.map((t) => (t.id === id ? { ...t, done: true } : t)) };
    setDoc(d);
    await saveToday(d).catch(() => undefined);
  };

  if (doc === undefined) return <Spinner />;

  const active = doc?.tasks.filter((t) => !t.postponed) ?? [];
  const doneN = active.filter((t) => t.done).length;
  const allDone = !!doc && active.length > 0 && doneN === active.length;
  const nextTask = active.find((t) => !t.done);

  return (
    <>
      <Band back="/" kicker="Mind the Gap · Hoy" title="Sesión de hoy" sub={doc ? `${doneN} de ${active.length} hechas · ~${active.reduce((a, t) => a + t.minutes, 0)} min` : 'Tres preguntas y te la monto'} line="var(--signal)" />
      <Page>
        {!doc && (
          <section class="card stack" style={g(14)}>
            <Choice
              label="¿Cuánto tiempo tienes?"
              value={ci.minutes}
              onChange={(v) => setCi({ ...ci, minutes: v })}
              options={[
                { v: 5, t: '5 min' },
                { v: 15, t: '15 min' },
                { v: 30, t: '30 min' },
                { v: 45, t: '45 min' },
                { v: 60, t: '1 hora' },
                { v: 90, t: '1 h 30' },
              ]}
            />
            <Choice
              label="¿Puedes hablar en voz alta?"
              value={ci.canSpeak}
              onChange={(v) => setCi({ ...ci, canSpeak: v })}
              options={[
                { v: true, t: 'Sí' },
                { v: false, t: 'No (biblioteca, tren…)' },
              ]}
            />
            <Choice
              label="¿Cómo vas de energía?"
              value={ci.energy}
              onChange={(v) => setCi({ ...ci, energy: v })}
              options={[
                { v: 'low', t: 'Baja' },
                { v: 'normal', t: 'Normal' },
                { v: 'high', t: 'Alta' },
              ]}
            />
            {busy ? (
              <Spinner label="Montando tu sesión…" />
            ) : (
              <button class="btn signal" onClick={build}>
                Montar mi sesión
              </button>
            )}
          </section>
        )}

        {doc && (
          <>
            <section class="card card-line stack" style={{ ...g(6), '--card-line': 'var(--signal)' } as JSX.CSSProperties}>
              <span class="kicker">Theo</span>
              <p class="read">{allDone ? '¡Sesión completada! Buen trabajo: mañana más, y mejor.' : doc.greeting}</p>
            </section>
            {nextTask && (
              <button class="btn signal" onClick={() => navigate(nextTask.route)}>
                Seguir: {nextTask.title}
              </button>
            )}
            <div class="stack" style={g(8)}>
              {doc.tasks.map((t, i) => (
                <section key={t.id} class={`card stack task ${t.done ? 'done' : ''} ${t.postponed ? 'postponed' : ''}`} style={g(6)}>
                  <div class="spread">
                    <strong>
                      {t.done ? '✓ ' : t.postponed ? '⏸ ' : `${i + 1}. `}
                      {t.title}
                    </strong>
                    {!t.postponed && <span class="pill">{t.minutes} min</span>}
                  </div>
                  <span class="small muted">{t.why}</span>
                  {!t.done && !t.postponed && (
                    <div class="row" style={{ ...g(10), flexWrap: 'wrap' }}>
                      <button class="btn small" onClick={() => navigate(t.route)}>
                        Empezar
                      </button>
                      <button class="linkbtn" onClick={() => markDone(t.id)}>
                        Ya la he hecho
                      </button>
                    </div>
                  )}
                </section>
              ))}
            </div>
            {why.length > 0 && (
              <Fold title="¿Por qué este orden?" sub="Prioridad = distancia a 180 + días sin practicar + errores recientes">
                <div class="stack" style={g(4)}>
                  {why.map((p) => (
                    <span key={p.skill} class="small">
                      <strong>
                        {SKILL_ES[p.skill]} ({Math.round(p.score)}):
                      </strong>{' '}
                      {p.why}
                    </span>
                  ))}
                </div>
              </Fold>
            )}
            <button class="linkbtn" onClick={() => setDoc(null)}>
              Rehacer el plan (otras respuestas)
            </button>
            <button class="linkbtn" onClick={() => navigate('/informe')}>
              Ver el informe semanal
            </button>
          </>
        )}
      </Page>
    </>
  );
}
