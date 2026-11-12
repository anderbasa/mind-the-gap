// Racha, XP del día, la semana en barras, celebraciones de Theo y la página de logros.
import { useEffect } from 'preact/hooks';
import type { JSX } from 'preact';
import { DEFS, checkAchievements, earned, loadEarned, markSeen } from '../progress/achievements';
import { loadProgress, madridDay, progress, xpGoal } from '../progress/progress';
import { DAY_MIN_SEC, mondayOf, shiftDay, type DayDoc } from '../progress/rules';
import { navigate } from '../router';
import { Band, Page, Spinner } from '../ui/components';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;
const WD = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const dayName = (iso: string) => new Intl.DateTimeFormat('es-ES', { weekday: 'long', timeZone: 'UTC' }).format(Date.parse(`${iso}T12:00:00Z`));
const fmtDate = (t: number) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long' }).format(t);

/** Los 7 días de esta semana (lunes a domingo). */
function thisWeek(days: DayDoc[], today: string) {
  const mon = mondayOf(today);
  const by = new Map(days.map((d) => [d.date, d]));
  return WD.map((label, i) => {
    const date = shiftDay(mon, i);
    return { label, date, day: by.get(date), future: date > today };
  });
}

export function HoyRacha() {
  useEffect(() => {
    if (!progress.value) void loadProgress();
  }, []);
  const p = progress.value;
  if (!p) return null;
  const today = madridDay();
  const goal = xpGoal();
  const xp = p.today.xp ?? 0;
  const s = p.streak;
  const week = thisWeek(p.days, today);
  const maxXp = Math.max(goal, ...week.map((w) => w.day?.xp ?? 0));
  const left = Math.max(0, Math.ceil((DAY_MIN_SEC - (p.today.activeSec ?? 0)) / 60));
  const prot = s.protectedDays.find((d) => mondayOf(d) === mondayOf(today));

  return (
    <section class="card stack" style={g(12)}>
      <div class="spread">
        <div class="stack" style={g(0)}>
          <span class="kicker">Racha</span>
          <strong class="tabular" style={{ fontSize: '28px', lineHeight: 1.1 }}>
            {s.current} {s.current === 1 ? 'día' : 'días'}
          </strong>
        </div>
        <div class="stack" style={{ ...g(0), textAlign: 'right' }}>
          <span class="kicker">XP de hoy</span>
          <strong class="tabular" style={{ fontSize: '28px', lineHeight: 1.1 }}>
            {xp}
            <span class="muted" style={{ fontSize: '15px', fontWeight: 500 }}> / {goal}</span>
          </strong>
        </div>
      </div>
      <div class="xpbar" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={xp}>
        <div style={{ width: `${Math.min(100, (xp / goal) * 100)}%` }} />
      </div>
      <p class="small" style={{ margin: 0 }}>
        {s.todayDone
          ? `Hoy ya cuenta para la racha (${s.todayMin} min).`
          : `Te ${left === 1 ? 'falta 1 minuto' : `faltan ${left} minutos`} de estudio (o acabar la sesión de hoy) para que hoy cuente.`}{' '}
        {s.atRisk ? <strong style={{ color: 'var(--signal)' }}>El comodín de esta semana ya está gastado: si hoy no estudias, la racha vuelve a 0.</strong> : s.wildcardFree ? 'Comodín de la semana: libre.' : prot ? `Comodín de la semana: gastado el ${dayName(prot)}.` : ''}
      </p>
      <div class="weekbars" aria-label="XP de esta semana">
        {week.map((w) => {
          const v = w.day?.xp ?? 0;
          const counted = !!w.day && ((w.day.activeSec ?? 0) >= DAY_MIN_SEC || !!w.day.sessionDone);
          const isProt = s.protectedDays.includes(w.date);
          return (
            <div key={w.date} class={`wb${w.date === today ? ' today' : ''}${w.future ? ' future' : ''}`} title={`${dayName(w.date)}: ${v} XP · ${Math.floor((w.day?.activeSec ?? 0) / 60)} min`}>
              <span class="wb-col">
                <span class="wb-bar" style={{ height: `${Math.max(v ? 8 : 0, (v / maxXp) * 100)}%` }} />
              </span>
              <span class={`wb-dot${counted ? ' on' : isProt ? ' prot' : ''}`} />
              <span class="wb-lab">{w.label}</span>
            </div>
          );
        })}
      </div>
      <button class="linkbtn" onClick={() => navigate('/logros')}>
        Logros e hitos · mejor racha {s.best} · {p.xpTotal} XP en total
      </button>
    </section>
  );
}

/** Logros nuevos: Theo los celebra con lo que hiciste de verdad. */
export function Celebraciones() {
  useEffect(() => {
    void (earned.value ? Promise.resolve() : loadEarned()).then(() => checkAchievements());
  }, []);
  const e = earned.value;
  if (!e) return null;
  const fresh = Object.entries(e)
    .filter(([, v]) => !v.seen)
    .sort((a, b) => b[1].at - a[1].at);
  if (!fresh.length) return null;
  const more = fresh.length - 1;
  return (
    <>
      {fresh.slice(0, 1).map(([id, v]) => {
        const d = DEFS.find((x) => x.id === id);
        return (
          <section key={id} class="card card-line stack" style={{ ...g(8), '--card-line': 'var(--ok)' } as JSX.CSSProperties}>
            <span class="kicker">{d?.kind === 'milestone' ? 'Hito B2 → C1' : 'Logro'} · Theo</span>
            <h2 style={{ margin: 0 }}>{d?.title ?? id}</h2>
            <p class="read" style={{ margin: 0 }}>
              {v.text}
            </p>
            <div class="row" style={{ ...g(8), flexWrap: 'wrap' }}>
              <button class="btn quiet" onClick={() => markSeen(id)}>
                {more ? 'Siguiente' : 'Guardado en mis logros'}
              </button>
              {more > 0 && (
                <button class="linkbtn" onClick={() => navigate('/logros')}>
                  {more === 1 ? 'Y 1 más: verlo en Logros' : `Y ${more} más: verlos en Logros`}
                </button>
              )}
            </div>
          </section>
        );
      })}
    </>
  );
}

/* ── Página de logros ─────────────────────────────────────────── */

export function Logros() {
  useEffect(() => {
    void loadProgress();
    void loadEarned()
      .then(() => checkAchievements(true))
      .then(() => Promise.all(Object.entries(earned.value ?? {}).filter(([, v]) => !v.seen).map(([id]) => markSeen(id))));
  }, []);
  const p = progress.value;
  const e = earned.value;
  if (!p || !e) return <Spinner />;
  const totalMin = Math.round(p.days.reduce((a, d) => a + (d.activeSec ?? 0), 0) / 60);
  const daysCounted = p.days.filter((d) => (d.activeSec ?? 0) >= DAY_MIN_SEC || d.sessionDone).length;
  const section = (kind: 'milestone' | 'achievement', title: string) => (
    <section class="stack" style={g(8)}>
      <span class="kicker">{title}</span>
      {DEFS.filter((d) => d.kind === kind).map((d) => {
        const got = e[d.id];
        return (
          <div key={d.id} class={`card stack${got ? ' card-line' : ''}`} style={{ ...g(4), ...(got ? { '--card-line': 'var(--ok)' } : { opacity: 0.72 }) } as JSX.CSSProperties}>
            <div class="spread">
              <strong>{d.title}</strong>
              {got ? <span class="pill ok">{fmtDate(got.at)}</span> : <span class="pill">Pendiente</span>}
            </div>
            <span class="small">{got ? got.text : d.how}</span>
          </div>
        );
      })}
    </section>
  );
  return (
    <>
      <Band back="/progreso" kicker="Mind the Gap · Progreso" title="Logros" sub="Lo que has conseguido, con datos" line="var(--ok)" />
      <Page>
        <section class="card">
          <div class="wgrid">
            {(
              [
                ['Racha actual', `${p.streak.current} días`],
                ['Mejor racha', `${p.streak.best} días`],
                ['XP total', String(p.xpTotal)],
                ['Tiempo de estudio', totalMin >= 60 ? `${Math.floor(totalMin / 60)} h ${totalMin % 60} min` : `${totalMin} min`],
                ['Días que cuentan', String(daysCounted)],
                ['Logros', `${Object.keys(e).length} de ${DEFS.length}`],
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k} class="stack" style={g(0)}>
                <strong class="tabular" style={{ fontSize: '20px' }}>
                  {v}
                </strong>
                <span class="small muted">{k}</span>
              </div>
            ))}
          </div>
        </section>
        {section('milestone', 'Hitos B2 → C1')}
        {section('achievement', 'Logros')}
        <details class="fold">
          <summary>
            <span class="grow small">
              <strong>Cómo funcionan la racha y la XP</strong>
            </span>
          </summary>
          <div class="fold-body stack small" style={g(6)}>
            <p>
              <strong>Racha:</strong> un día cuenta con 10 minutos de estudio activo (con la app abierta y usándola, escuchando un audio o grabando) o con la sesión de hoy completa. Cada semana tienes un comodín automático que
              protege un día que falles.
            </p>
            <p>
              <strong>XP:</strong> cada ejercicio da puntos según lo difícil que es (un writing, 40; una Part 4, 12; una tarjeta, 1) y se multiplica según tu destreza: hasta ×1,75 en la más floja y ×0,75 en las que ya
              pasan de 185. Así, trabajar lo que te cuesta da más que repetir lo fácil. Las tarjetas dan como mucho 20 XP al día.
            </p>
          </div>
        </details>
      </Page>
    </>
  );
}

/** Minutos por semana (últimas 6), para Progreso. */
export function TiempoSemanal() {
  useEffect(() => {
    if (!progress.value) void loadProgress();
  }, []);
  const p = progress.value;
  if (!p) return null;
  const mon = mondayOf(madridDay());
  const weeks = [5, 4, 3, 2, 1, 0].map((i) => {
    const start = shiftDay(mon, -7 * i);
    const end = shiftDay(start, 6);
    const min = Math.round(p.days.filter((d) => d.date >= start && d.date <= end).reduce((a, d) => a + (d.activeSec ?? 0), 0) / 60);
    return { start, min };
  });
  const max = Math.max(60, ...weeks.map((w) => w.min));
  return (
    <section class="card stack" style={g(10)}>
      <div class="spread">
        <span class="kicker">Tiempo de estudio por semana</span>
        <span class="pill">{weeks[5].min} min esta semana</span>
      </div>
      <div class="weekbars" style={{ height: '110px' }}>
        {weeks.map((w, i) => (
          <div key={w.start} class={`wb${i === 5 ? ' today' : ''}`} title={`Semana del ${fmtDate(Date.parse(`${w.start}T12:00:00Z`))}: ${w.min} min`}>
            <span class="wb-col">
              <span class="wb-bar" style={{ height: `${Math.max(w.min ? 6 : 0, (w.min / max) * 100)}%` }} />
            </span>
            <span class="wb-lab tabular">{w.min}</span>
          </div>
        ))}
      </div>
      <p class="muted small" style={{ margin: 0 }}>
        Minutos de estudio activo (lunes a domingo). Cuenta solo mientras usas la app, escuchas o grabas.
      </p>
    </section>
  );
}
