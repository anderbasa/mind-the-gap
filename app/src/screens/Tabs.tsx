// Pestañas principales. En la Fase 1 muestran la estructura y lo que llega en cada fase.
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { profile, settings, store } from '../state';
import { SKILL_ORDER, SKILLS } from '../domain/skills';
import { navigate } from '../router';
import { Band, ListItem, MetroLine, Page, SkillLine, Spinner } from '../ui/components';
import { IconTheo } from '../ui/icons';
import type { ScoreDoc } from '../scoring/estimate';
import { countdown, currentEstimate, type Estimate } from '../scoring/readiness';
import { tutorNotes } from '../tutor/notes';
import { SrsPanel } from './SrsPanel';
import { getToday, type SessionDoc } from '../planner/state';
import { Celebraciones, HoyRacha, TiempoSemanal } from './Racha';

/** En Hoy: la sesión del día (empezarla o seguirla). */
function HoySesion() {
  const [doc, setDoc] = useState<SessionDoc | null | undefined>(undefined);
  useEffect(() => {
    getToday()
      .then(setDoc)
      .catch(() => setDoc(null));
  }, []);
  const active = doc?.tasks.filter((t) => !t.postponed) ?? [];
  const done = active.filter((t) => t.done).length;
  return (
    <section class="card card-line stack" style={{ ...g(12), '--card-line': 'var(--signal)' } as JSX.CSSProperties}>
      <div class="spread">
        <h2>Sesión de hoy</h2>
        {doc && <span class={`pill ${done === active.length ? 'ok' : ''}`}>{done}/{active.length}</span>}
      </div>
      {doc === undefined ? null : doc ? (
        <>
          <p class="small">{done === active.length ? '¡Hecha! Si te quedan ganas, rehaz el plan con más tiempo.' : doc.greeting}</p>
          <button class="btn signal" onClick={() => navigate('/sesion')}>
            {done === active.length ? 'Ver la sesión' : 'Seguir la sesión'}
          </button>
        </>
      ) : (
        <>
          <p class="small">Tres preguntas (tiempo, si puedes hablar y tu energía) y te monto la sesión con lo que más puntos te resta, explicando por qué.</p>
          <button class="btn signal" onClick={() => navigate('/sesion')}>
            Empezar la sesión de hoy
          </button>
        </>
      )}
      <button class="linkbtn" onClick={() => navigate('/theo')}>
        <IconTheo width={16} height={16} /> O habla con Theo por escrito
      </button>
    </section>
  );
}
import { getPatterns, topFive, type Pattern } from '../errors/notebook';
import { listCards, todaysQueue } from '../srs/srs';

/** En Hoy: tus 5 errores top y el repaso de vocabulario pendiente. */
function HoyExtras() {
  const [top, setTop] = useState<Pattern[]>([]);
  const [due, setDue] = useState<number | null>(null);
  useEffect(() => {
    getPatterns()
      .then((d) => setTop(topFive(d)))
      .catch(() => undefined);
    listCards()
      .then((c) => {
        const q = todaysQueue(c);
        setDue(c.length ? q.due.length + q.fresh.length : null);
      })
      .catch(() => undefined);
  }, []);
  return (
    <>
      {due !== null && due > 0 && (
        <section class="card card-line stack" style={{ ...g(8), '--card-line': 'var(--line-vocab)' } as JSX.CSSProperties}>
          <div class="spread">
            <h3>Repaso de vocabulario</h3>
            <span class="pill">{due}</span>
          </div>
          <button class="btn quiet" onClick={() => navigate('/vocabulario/repaso')}>
            Repasar ahora
          </button>
        </section>
      )}
      {top.length > 0 && (
        <section class="card stack" style={g(8)}>
          <span class="kicker">Tus 5 errores top</span>
          {top.map((p, i) => (
            <div key={p.name} class="spread">
              <span class="small">
                {i + 1}. {p.name}
              </span>
              <span class="pill bad">×{p.count}</span>
            </div>
          ))}
          <button class="linkbtn" onClick={() => navigate('/cuaderno')}>
            Practicarlos en el cuaderno de errores
          </button>
        </section>
      )}
    </>
  );
}

interface ScoreView {
  est: Estimate;
  overall: number;
  /** Última medición de casi todo (diagnóstico, mini, simulacro completo u oficial). */
  last: ScoreDoc;
}

const KIND_ES: Record<ScoreDoc['kind'], string> = { diagnostic: 'diagnóstico', mini: 'mini-diagnóstico', mock: 'simulacro', official: 'sample test oficial' };

/** Tu nota estimada ahora: media ponderada de diagnósticos, simulacros y notas oficiales. */
function useScore(): ScoreView | null | undefined {
  const [s, setS] = useState<ScoreView | null | undefined>(undefined);
  useEffect(() => {
    currentEstimate()
      .then(({ estimate, scores, lastBroad }) => {
        const last = lastBroad ?? scores[0];
        setS(estimate.overall != null && last ? { est: estimate, overall: estimate.overall, last } : null);
      })
      .catch(() => setS(null));
  }, []);
  return s;
}

/** Con fecha de examen: cuenta atrás en Hoy. */
function CuentaAtras() {
  const date = settings.value.examDate;
  if (!date) return null;
  const cd = countdown(date, Date.now());
  if (cd.phase === 'past') return null;
  return (
    <button class="card card-line stack" style={{ ...g(4), '--card-line': 'var(--ink)', textAlign: 'left' } as JSX.CSSProperties} onClick={() => navigate('/listo')}>
      <span class="kicker">Cuenta atrás · C1 Advanced</span>
      <strong class="tabular" style={{ fontSize: '22px' }}>
        {cd.days === 0 ? '¡Es hoy!' : `${cd.days} ${cd.days === 1 ? 'día' : 'días'}`}
      </strong>
      <span class="small">{cd.advice}</span>
    </button>
  );
}

const DAY = 86_400_000;

function Trayecto() {
  const score = useScore();
  const challenge = tutorNotes.value?.nextChallenge;
  if (score === undefined) return <Spinner />;
  const old = score && Date.now() - score.last.at > 30 * DAY;
  return (
    <section class="card stack" style={g(10)}>
      <div class="spread">
        <span class="kicker">Tu trayecto</span>
        <span class="pill">Next station: 180</span>
      </div>
      <MetroLine estimate={score?.overall ?? null} />
      {score ? (
        <p class="small">
          Nota estimada <strong>≈ {score.overall}</strong> ± {score.est.margin}
          {score.overall < 180 ? ` · te faltan unos ${180 - score.overall} puntos para el C1` : ' · ya estás en zona C1'}. Última medición: {KIND_ES[score.last.kind]} del{' '}
          {new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long' }).format(score.last.at)} (orientativa).
        </p>
      ) : (
        <p class="muted small">Aún no hay nota estimada: Theo no se fía de tu nota del First. El diagnóstico mide dónde estás de verdad, y el tramo rojo será tu «gap».</p>
      )}
      {(!score || old) && (
        <button class="btn signal" onClick={() => navigate(score ? '/diagnostico?mini=1' : '/diagnostico')}>
          {score ? 'Toca el mini-diagnóstico mensual' : 'Hacer el diagnóstico (~60 min)'}
        </button>
      )}
      {score && !old && (
        <button class="linkbtn" onClick={() => navigate('/listo')}>
          ¿Estoy listo?
        </button>
      )}
      {challenge && (
        <p class="small">
          <strong>Mini reto de Theo:</strong> <span class="read">{challenge}</span>
        </p>
      )}
    </section>
  );
}

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;

function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 6) return 'Burning the midnight oil';
  if (h < 13) return 'Good morning';
  if (h < 20) return 'Good afternoon';
  return 'Good evening';
}

function todayEs(d = new Date()): string {
  return new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}

/* ── Hoy ───────────────────────────────────────────────────────── */

export function Hoy() {
  const name = profile.value?.name.trim();
  return (
    <>
      <Band kicker={`Mind the Gap · ${todayEs()}`} title={`${greeting()}${name ? `, ${name}` : ''}.`} />
      <Page>
        <Celebraciones />
        <CuentaAtras />
        <HoyRacha />
        <HoySesion />
        <Trayecto />
        <HoyExtras />


        <section class="stack" style={g(8)}>
          <span class="kicker">Así va la obra</span>
          <div class="list">
            <ListItem dot="var(--ok)" title="Fase 1 · Base" sub="Login, perfil, Theo, capa de IA, prueba de voz" right={<span class="pill ok">Hecha</span>} />
            <ListItem dot="var(--line-uoe)" title="Fase 2 · Reading & Use of English" sub="Las 8 partes, modo práctica y examen" right={<span class="pill ok">Hecha</span>} />
            <ListItem dot="var(--line-writing)" title="Fase 3 · Writing y Reformular" sub="Corrección, Upgrade to C1, reescritura, Dímelo mejor" right={<span class="pill ok">Hecha</span>} />
            <ListItem dot="var(--line-listening)" title="Fase 4 · Listening" sub="4 partes con varios acentos, dictados, inglés hablado real" right={<span class="pill ok">Hecha</span>} />
            <ListItem dot="var(--line-speaking)" title="Fase 5 · Speaking por voz" sub="Simulacro, role-plays, long turn" right={<span class="pill ok">Hecha</span>} />
            <ListItem dot="var(--line-vocab)" title="Fase 6 · Diagnóstico, errores, vocabulario y gramática" sub="Diagnóstico, memoria de Theo, cuaderno de errores, FSRS y gramática C1" right={<span class="pill ok">Hecha</span>} />
            <ListItem dot="var(--signal)" title="Fase 7 · Sesión de hoy y examen" sub="Plan del día, informe semanal, simulacros y ¿Estoy listo?" right={<span class="pill ok">Hecha</span>} />
            <ListItem dot="var(--ok)" title="Fase 8 · Rachas, XP y logros" sub="Hecha la primera mitad. Faltan Escenas de series, Telegram y el pulido" right={<span class="pill">En obra</span>} />
          </div>
        </section>
      </Page>
    </>
  );
}

/* ── Practicar ─────────────────────────────────────────────────── */

export function Practicar() {
  return (
    <>
      <Band kicker="Mind the Gap · Practicar" title="Practise" sub="Formato de examen real, contenido original." />
      <Page>
        <section class="stack" style={g(8)}>
          <span class="kicker">Ya disponible</span>
          <div class="list">
            <ListItem dot={SKILLS.reading.color} title="Reading & Use of English" sub="8 partes · práctica o examen · prioridad P4, P3 y P1" to="/practicar/rue" />
            <ListItem dot={SKILLS.writing.color} title="Writing" sub="Essay, email, letter, proposal, report, review · escrito o en foto" to="/practicar/writing" />
            <ListItem dot={SKILLS.listening.color} title="Listening" sub="4 partes con acentos variados, dictados e inglés hablado real" to="/practicar/listening" />
            <ListItem dot={SKILLS.speaking.color} title="Speaking" sub="Simulacro con examinador y compañero, long turn y role-plays" to="/practicar/speaking" />
            <ListItem dot={SKILLS.listening.color} title="Escenas de series" sub="Pega subtítulos de algo que hayas visto: Theo te monta la lección" to="/practicar/series" />
            <ListItem dot="var(--line-grammar)" title="Reformular" sub="Una frase y una instrucción: hasta 3 formas de decirlo" to="/practicar/reformular" />
            <ListItem dot="var(--line-grammar)" title="Dímelo mejor" sub="Pega una frase tuya: corregida, neutra, formal y natural" to="/practicar/dimelo" />
            <ListItem dot="var(--signal)" title="Habla con Theo" sub="Chat por escrito, con correcciones rápidas" to="/theo" />
          </div>
        </section>
        <section class="stack" style={g(8)}>
          <span class="kicker">El examen</span>
          <div class="list">
            <ListItem dot="var(--ink)" title="Simulacros" sub="Por paper o completos · el Paper 1 también en papel" to="/simulacro" />
            <ListItem dot="var(--signal)" title="¿Estoy listo?" sub="Tu nota con margen, tu criterio, cuándo reservar y cuenta atrás" to="/listo" />
          </div>
        </section>
        <section class="stack" style={g(8)}>
          <span class="kicker">Herramientas</span>
          <div class="list">
            <ListItem dot="var(--line-grammar)" title="Gramática C1" sub="12 puntos clave, práctica libre corregida y minijuegos" to="/practicar/gramatica" />
            <ListItem dot="var(--bad)" title="Cuaderno de errores" sub="Tus patrones, tus 5 errores top y práctica dirigida" to="/cuaderno" />
          </div>
        </section>
      </Page>
    </>
  );
}

/* ── Vocabulario ───────────────────────────────────────────────── */

interface VocabRow {
  id: string;
  term: string;
  context: string;
  createdAt: number;
}

function SavedWords() {
  const [rows, setRows] = useState<VocabRow[] | null>(null);
  useEffect(() => {
    store()
      .list<Omit<VocabRow, 'id'>>('vocab', { orderBy: 'createdAt', desc: true, limit: 200 })
      .then(setRows)
      .catch(() => setRows([]));
  }, []);
  const remove = async (id: string) => {
    await store().remove(`vocab/${id}`);
    setRows((r) => (r ?? []).filter((x) => x.id !== id));
  };
  if (!rows) return <Spinner />;
  return (
    <section class="stack" style={g(8)}>
      <span class="kicker">Tus palabras guardadas ({rows.length})</span>
      {rows.length === 0 ? (
        <p class="muted small">Toca cualquier palabra de un texto del Reading para guardarla aquí, con su frase.</p>
      ) : (
        <div class="list">
          {rows.map((w) => (
            <div key={w.id} class="list-item" style={{ cursor: 'default', alignItems: 'flex-start' }}>
              <span class="grow">
                <span class="list-title" style={{ display: 'block' }}>
                  {w.term}
                </span>
                <span class="list-sub read" style={{ fontSize: '15px' }}>
                  {w.context}
                </span>
              </span>
              <button class="linkbtn" onClick={() => remove(w.id)}>
                Quitar
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function Vocabulario() {
  return (
    <>
      <Band kicker="Mind the Gap · Vocabulario" title="Vocabulary" line="var(--line-vocab)" />
      <Page>
        <SrsPanel />
        <SavedWords />
      </Page>
    </>
  );
}

/* ── Progreso ──────────────────────────────────────────────────── */

export function Progreso() {
  const score = useScore();
  return (
    <>
      <Band kicker="Mind the Gap · Progreso" title="Progress" />
      <Page>
        <section class="card stack" style={g(16)}>
          <div class="spread">
            <span class="kicker">Nota estimada por destreza</span>
            <span class="pill">frente a 180</span>
          </div>
          {SKILL_ORDER.map((k) => (
            <SkillLine key={k} label={SKILLS[k].label} color={SKILLS[k].color} score={score?.est.skills[k]?.value ?? null} margin={score?.est.skills[k]?.margin} />
          ))}
          {score ? (
            <p class="muted small">
              Global ≈ {score.overall} ± {score.est.margin}: media ponderada de tus diagnósticos, simulacros y notas oficiales de los últimos meses (las recientes pesan más), con las tablas oficiales de Cambridge. Son
              estimaciones orientativas.
            </p>
          ) : (
            <p class="muted small">Las notas aparecerán tras el diagnóstico (Hoy → «Hacer el diagnóstico»). Siempre se muestran como estimación.</p>
          )}
        </section>
        <TiempoSemanal />
        <button class="list-item" onClick={() => navigate('/logros')}>
          <span class="line-dot" style={{ '--dot': 'var(--ok)' } as JSX.CSSProperties} />
          <span class="grow">
            <span class="list-title" style={{ display: 'block' }}>
              Logros e hitos
            </span>
            <span class="list-sub">Racha, XP y lo que has conseguido, con datos</span>
          </span>
        </button>
        <section class="card stack" style={g(10)}>
          <h2>¿Estoy listo?</h2>
          <p class="small">
            Criterio: global ≥ {settings.value.readiness.globalMin} en {settings.value.readiness.mocksNeeded} simulacros completos y ninguna destreza por debajo de {settings.value.readiness.skillMin}. Con margen, tendencia,
            aviso para reservar y cuenta atrás.
          </p>
          <div class="row" style={{ ...g(8), flexWrap: 'wrap' }}>
            <button class="btn signal" onClick={() => navigate('/listo')}>
              Ver si estoy listo
            </button>
            <button class="btn quiet" onClick={() => navigate('/simulacro')}>
              Simulacros
            </button>
          </div>
        </section>
      </Page>
    </>
  );
}
