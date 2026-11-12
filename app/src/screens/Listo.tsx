// «¿Estoy listo?»: dónde estás (con margen y tendencia), el criterio para presentarte (editable),
// cuándo reservar, la cuenta atrás y el registro de sample tests oficiales para calibrar.
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { SKILL_ORDER, SKILLS, type Skill } from '../domain/skills';
import { MAX_MARKS, rawToScale, type ScoreDoc } from '../scoring/estimate';
import { calibration, countdown, deleteOfficial, loadScores, projectedAt, readiness, saveOfficial } from '../scoring/readiness';
import { navigate } from '../router';
import { saveSettings, settings } from '../state';
import { Band, MetroLine, Page, SkillLine, Spinner, toast } from '../ui/components';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;
const fmt = (t: number) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(t);
const longDate = (iso: string) => new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(Date.parse(`${iso}T12:00:00Z`));

/** Buscador oficial de centros de Cambridge (por país y ciudad). */
export const CENTRE_FINDER = 'https://www.cambridgeenglish.org/find-a-centre/find-an-exam-centre/';
/** Sample tests oficiales de C1 Advanced (gratis). */
export const SAMPLE_TESTS = 'https://www.cambridgeenglish.org/exams-and-tests/qualifications/advanced/preparation/';

export function Listo() {
  const [scores, setScores] = useState<ScoreDoc[] | null>(null);
  const reload = () => loadScores().then(setScores);
  useEffect(() => {
    void reload();
  }, []);

  if (!scores) return <Spinner />;
  const cfg = settings.value;
  const crit = cfg.readiness;
  const now = Date.now();
  const r = readiness(scores, crit, now);
  const est = r.estimate;
  const cd = cfg.examDate ? countdown(cfg.examDate, now) : null;
  const proj = cd && cd.days >= 0 ? projectedAt(r, cd.days) : null;

  return (
    <>
      <Band back="/progreso" kicker="Mind the Gap · Examen" title="¿Estoy listo?" sub="Honesto: con margen y con tu criterio" line="var(--signal)" />
      <Page>
        {/* Veredicto */}
        <section class="card card-line stack" style={{ ...g(10), '--card-line': r.ready ? 'var(--ok)' : 'var(--signal)' } as JSX.CSSProperties}>
          <span class="kicker">Veredicto</span>
          <h2 style={{ margin: 0 }}>{r.ready ? 'Sí: estás listo para presentarte.' : est.overall == null ? 'Aún no hay datos para decirlo.' : 'Todavía no.'}</h2>
          {r.checks.map((c) => (
            <div key={c.label} class="row" style={{ ...g(8), alignItems: 'flex-start' }}>
              <span class={`pill ${c.ok ? 'ok' : ''}`}>{c.ok ? '✓' : '✗'}</span>
              <span class="grow small">
                <strong>{c.label}</strong>
                <br />
                <span class="muted">{c.detail}</span>
              </span>
            </div>
          ))}
          {!r.ready && (
            <button class="btn signal" onClick={() => navigate('/simulacro')}>
              Hacer un simulacro
            </button>
          )}
        </section>

        {/* Estimación */}
        <section class="card stack" style={g(12)}>
          <div class="spread">
            <span class="kicker">Dónde estás hoy</span>
            {r.trend != null && <span class="pill">{r.trend > 0 ? `+${r.trend}` : r.trend} / semana</span>}
          </div>
          <MetroLine estimate={est.overall} />
          {est.overall != null ? (
            <p class="small">
              Global <strong>≈ {est.overall}</strong> ± {est.margin}
              {!est.complete && ' (faltan destrezas por medir: la global es solo con las que hay)'}.{' '}
              {r.trend == null
                ? 'Aún no hay tendencia: hace falta alguna medición más reciente.'
                : r.trend > 0.2
                  ? `Vas subiendo unos ${r.trend} puntos por semana.`
                  : r.trend < -0.2
                    ? `Has bajado unos ${-r.trend} puntos por semana este mes: nada grave, pero mira qué destreza tira hacia abajo.`
                    : 'Estable este mes.'}
              {r.weeksToTarget != null && r.weeksToTarget > 0 && ` Al ritmo actual, llegarías a ${crit.globalMin} en unas ${r.weeksToTarget} semanas.`}
            </p>
          ) : (
            <p class="muted small">Haz el diagnóstico o un simulacro y aquí aparecerá tu nota con su margen.</p>
          )}
          {SKILL_ORDER.map((k) => (
            <SkillLine key={k} label={SKILLS[k].label} color={SKILLS[k].color} score={est.skills[k]?.value ?? null} margin={est.skills[k]?.margin} />
          ))}
          <p class="muted small">
            Media ponderada de tus notas de los últimos 4 meses: un sample test oficial pesa ×3, un simulacro ×2, el diagnóstico ×1,5 y el mini ×1, y cada nota pesa la mitad cada 30 días. El margen es ±3 (lo que pide
            Cambridge cerca de un límite) o lo que varíen tus notas, si es más.
          </p>
        </section>

        {/* Fecha y reserva */}
        <section class="card stack" style={g(10)}>
          <span class="kicker">{cd ? 'Cuenta atrás' : 'Reservar el examen'}</span>
          {cd ? (
            <>
              <h2 style={{ margin: 0 }} class="tabular">
                {cd.days < 0 ? 'Fecha pasada' : cd.days === 0 ? '¡Es hoy!' : `${cd.days} ${cd.days === 1 ? 'día' : 'días'}`}
              </h2>
              <span class="small">{longDate(cfg.examDate!)}</span>
              <p class="small">{cd.advice}</p>
              {proj != null && cd.days > 0 && (
                <p class="small">
                  {r.trend == null ? 'Con tu nota de hoy (aún sin tendencia), el día del examen estarías en ' : 'Al ritmo actual, el día del examen estarías en '}
                  <strong>≈ {proj}</strong>
                  {proj < 180 ? ': todavía por debajo del C1. Si no sube en las próximas semanas, plantéate cambiar de fecha (los centros suelen permitirlo con un coste).' : proj < crit.globalMin ? `: en C1, pero sin el colchón de ${crit.globalMin} que te pusiste.` : '.'}
                </p>
              )}
            </>
          ) : r.bookNow ? (
            <p class="small">
              <strong>Toca reservar.</strong> {r.ready ? 'Ya cumples tu criterio.' : `Al ritmo actual llegas a ${crit.globalMin} en unas ${r.weeksToTarget} semanas.`} Los centros cierran la inscripción varias semanas antes, así que reserva con
              8–10 semanas de margen: eliges fecha y llegas preparado.
            </p>
          ) : (
            <p class="small muted">
              Te avisaré aquí cuando, al ritmo que llevas, te falten unas 10 semanas para tu objetivo: es el momento de reservar (los centros cierran la inscripción semanas antes).
            </p>
          )}
          <a class="btn quiet" href={CENTRE_FINDER} target="_blank" rel="noopener noreferrer">
            Buscar centro oficial (Cambridge) ↗
          </a>
          <label class="field">
            <span>Fecha de tu examen</span>
            <input
              class="input"
              type="date"
              value={cfg.examDate ?? ''}
              onChange={async (e) => {
                const v = (e.currentTarget as HTMLInputElement).value;
                await saveSettings({ examDate: v || null });
                toast(v ? 'Fecha guardada: modo cuenta atrás' : 'Fecha quitada');
              }}
            />
            <small>Con fecha, Hoy muestra la cuenta atrás y aquí ves qué toca en cada tramo.</small>
          </label>
        </section>

        <Criterio />
        <Oficiales scores={scores} onChange={reload} />
      </Page>
    </>
  );
}

/* ── Criterio editable ─────────────────────────────────────────── */

function Criterio() {
  const crit = settings.value.readiness;
  const set = async (patch: Partial<typeof crit>) => {
    await saveSettings({ readiness: { ...crit, ...patch } });
  };
  const num = (label: string, value: number, key: keyof typeof crit, min: number, max: number, note: string) => (
    <label class="field">
      <span>{label}</span>
      <input
        class="input"
        type="number"
        min={min}
        max={max}
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const v = Math.round(Number((e.currentTarget as HTMLInputElement).value));
          if (Number.isFinite(v) && v >= min && v <= max) void set({ [key]: v });
        }}
      />
      <small>{note}</small>
    </label>
  );
  return (
    <details class="fold">
      <summary>
        <span class="grow stack" style={g(2)}>
          <span class="kicker">Tu criterio de «listo»</span>
          <span class="small">
            Global ≥ {crit.globalMin} en {crit.mocksNeeded} simulacros · ninguna destreza &lt; {crit.skillMin}
          </span>
        </span>
      </summary>
      <div class="fold-body stack" style={g(10)}>
      <p class="small">
        Para el C1 basta un 180, pero el día del examen se rinde algo peor que en casa y la nota tiene un margen de ±3. Por eso el criterio por defecto pide <strong>185 de global</strong> en tus <strong>2 últimos simulacros
        completos</strong> y que <strong>ninguna destreza baje de 170</strong> (una muy baja arrastra la media y no se compensa fácil). Cuentan los simulacros completos de la app y los sample tests oficiales completos.
      </p>
      {num('Global mínima', crit.globalMin, 'globalMin', 160, 210, 'La media de las cinco notas en cada simulacro.')}
      {num('Simulacros completos seguidos', crit.mocksNeeded, 'mocksNeeded', 1, 5, 'Los últimos que hayas hecho, todos por encima.')}
      {num('Mínimo por destreza', crit.skillMin, 'skillMin', 142, 200, 'Ninguna de las cinco por debajo, en esos simulacros.')}
      <button class="linkbtn" onClick={() => set({ globalMin: 185, mocksNeeded: 2, skillMin: 170 })}>
        Volver al criterio por defecto
      </button>
      </div>
    </details>
  );
}

/* ── Sample tests oficiales ───────────────────────────────────── */

function Oficiales(props: { scores: ScoreDoc[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState<Partial<Record<Skill, string>>>({});
  const [label, setLabel] = useState('');
  const [date, setDate] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(Date.now()));
  const [busy, setBusy] = useState(false);
  const cal = calibration(props.scores);

  const parsed = SKILL_ORDER.map((k) => [k, raw[k]?.trim() ? Number(raw[k]!.replace(',', '.')) : null] as const);
  const bad = parsed.some(([k, v]) => v != null && (!Number.isFinite(v) || v < 0 || v > MAX_MARKS[k]));
  const filled = parsed.filter(([, v]) => v != null);

  const save = async () => {
    if (bad || !filled.length) return;
    setBusy(true);
    try {
      const skills = Object.fromEntries(filled.map(([k, v]) => [k, rawToScale(k, v!)]));
      const vals = Object.values(skills);
      const at = Date.parse(`${date}T12:00:00Z`) || Date.now();
      await saveOfficial({ skills, overall: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length), at, label: label.trim() || 'Sample test oficial' });
      toast('Nota oficial guardada');
      setRaw({});
      setLabel('');
      setOpen(false);
      props.onChange();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section class="card stack" style={g(10)}>
      <span class="kicker">Sample tests oficiales · calibración</span>
      <p class="small">
        Haz los sample tests gratuitos de Cambridge (en papel o en su web) y apunta aquí tus <strong>puntos brutos</strong>: la app los pasa a la escala con la tabla oficial y los compara con lo que estimaba. Así sabes si
        la app te infla o te infravalora.
      </p>
      <a class="linkbtn" href={SAMPLE_TESTS} target="_blank" rel="noopener noreferrer">
        Sample tests oficiales de C1 Advanced ↗
      </a>
      {cal.mean != null && (
        <p class="small">
          <strong>
            {cal.mean === 0 ? 'La app acierta de media con tus notas oficiales.' : cal.mean > 0 ? `En los oficiales sacas de media ${cal.mean} puntos más de lo que estimaba la app.` : `En los oficiales sacas de media ${-cal.mean} puntos menos de lo que estimaba la app: tómate sus estimaciones con prudencia.`}
          </strong>
        </p>
      )}
      {cal.rows.map((c) => (
        <div key={c.doc.at} class="spread small">
          <span>
            <strong>{c.doc.label}</strong> · {fmt(c.doc.at)}
            <br />
            <span class="muted">
              {SKILL_ORDER.filter((k) => c.doc.skills[k] != null).map((k) => `${SKILLS[k].short} ${c.doc.skills[k]}`).join(' · ')} → global {c.doc.overall}
              {c.diff != null ? ` (app: ${c.app}, ${c.diff >= 0 ? '+' : ''}${c.diff})` : ''}
            </span>
          </span>
          <button
            class="linkbtn"
            onClick={async () => {
              if (!confirm('¿Borrar esta nota oficial?')) return;
              await deleteOfficial(c.doc.at);
              props.onChange();
            }}
          >
            Borrar
          </button>
        </div>
      ))}
      {!open ? (
        <button class="btn quiet" onClick={() => setOpen(true)}>
          Apuntar una nota oficial
        </button>
      ) : (
        <div class="stack" style={g(8)}>
          <label class="field">
            <span>Qué test</span>
            <input class="input" value={label} placeholder="Sample test 1" onInput={(e) => setLabel((e.target as HTMLInputElement).value)} />
          </label>
          <label class="field">
            <span>Fecha</span>
            <input class="input" type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
          </label>
          {SKILL_ORDER.map((k) => {
            const v = parsed.find(([s]) => s === k)![1];
            return (
              <label key={k} class="field">
                <span>
                  {SKILLS[k].label} (de {MAX_MARKS[k]})
                </span>
                <input class="input" inputMode="decimal" value={raw[k] ?? ''} placeholder="Déjalo vacío si no lo hiciste" onInput={(e) => setRaw((r) => ({ ...r, [k]: (e.target as HTMLInputElement).value }))} />
                {v != null && Number.isFinite(v) && v >= 0 && v <= MAX_MARKS[k] && <small>≈ {rawToScale(k, v)} en la escala</small>}
              </label>
            );
          })}
          <p class="muted small">Speaking sobre 75 y Writing sobre 40, como en la tabla oficial de conversión.</p>
          <div class="row" style={g(8)}>
            <button class="btn signal" disabled={busy || bad || !filled.length} onClick={save}>
              Guardar
            </button>
            <button class="btn quiet" onClick={() => setOpen(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
