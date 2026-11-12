// Simulacros: por paper o completos. En pantalla (con las pantallas de ejercicios en modo examen)
// o el Paper 1 en papel: PDF imprimible con hoja de respuestas y después introduces lo que marcaste.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren, JSX } from 'preact';
import { PAPERS, startMock } from '../diagnostic/mock';
import { finishRun, getRun, nextPart, partRoute, recordPart, skillsOf, type DiagRun } from '../diagnostic/run';
import { SKILL_ORDER, SKILLS } from '../domain/skills';
import { getSet } from '../rue/bank';
import { markSet, type Answers } from '../rue/marking';
import { buildPaperPdf, sharePdf } from '../rue/paperPdf';
import { reviewOpenAnswers } from '../rue/review';
import { PARTS, type RueSet } from '../rue/schema';
import { overallOf, scaleText } from '../scoring/estimate';
import { navigate } from '../router';
import { store } from '../state';
import { updateTutorNotes } from '../tutor/notes';
import { Band, ListItem, MetroLine, Page, SkillLine, Spinner, toast } from '../ui/components';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;

/* ── Índice y progreso ─────────────────────────────────────────── */

export function Simulacro() {
  const [run, setRun] = useState<DiagRun | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    getRun('mock')
      .then(setRun)
      .catch(() => setRun(null));
  }, []);

  const begin = async (paper: (typeof PAPERS)[number]['id']) => {
    setBusy('Preparando el simulacro…');
    try {
      setRun(await startMock(paper));
    } finally {
      setBusy(null);
    }
  };
  const finish = async () => {
    if (!run) return;
    setBusy('Calculando tu nota…');
    try {
      const r = await finishRun(run);
      setRun({ ...r });
      void updateTutorNotes(`Mock exam finished (${run.paper}): ${JSON.stringify(r.result)}`, { force: true });
    } finally {
      setBusy(null);
    }
  };

  if (run === undefined) return <Spinner />;
  const active = run && !run.finishedAt ? run : null;
  const next = active ? nextPart(active) : null;
  const allDone = !!active && active.parts.every((p) => p.done);
  const hasRue = !!active?.parts.some((p) => p.kind === 'rue');
  const partial = active ? skillsOf(active) : {};

  return (
    <>
      <Band back="/practicar" kicker="Practicar · Examen" title="Simulacros" sub="En condiciones de examen, sin pistas" line="var(--ink)" />
      <Page>
        {busy && <Spinner label={busy} />}
        {!active && !busy && (
          <>
            {run?.result && (
              <section class="card stack" style={g(10)}>
                <span class="kicker">Último simulacro · {PAPERS.find((p) => p.id === run.paper)?.title}</span>
                {run.paper === 'full' && <MetroLine estimate={run.result.overall} />}
                {SKILL_ORDER.filter((k) => run.result!.skills[k] != null).map((k) => (
                  <SkillLine key={k} label={SKILLS[k].label} color={SKILLS[k].color} score={run.result!.skills[k] ?? null} />
                ))}
                <p class="muted small">Con las tablas oficiales de conversión de Cambridge. Cuenta para «¿Estoy listo?».</p>
              </section>
            )}
            <div class="list">
              {PAPERS.map((p) => (
                <ListItem key={p.id} dot="var(--ink)" title={p.title} sub={`${p.es} · ~${p.minutes >= 60 ? `${Math.floor(p.minutes / 60)} h ${p.minutes % 60 ? `${p.minutes % 60} min` : ''}` : `${p.minutes} min`}`} onClick={() => begin(p.id)} />
              ))}
            </div>
            <p class="muted small">
              Usa ejercicios que aún no has hecho, si quedan. El examen en papel del Paper 1 está dentro de cada simulacro que lo incluya.
            </p>
          </>
        )}
        {active && (
          <>
            <div class="list">
              {active.parts.map((p) => (
                <button key={p.ref + p.part} class="list-item" disabled={p.done} onClick={() => navigate(partRoute(p, 'mock'))} style={p.done ? { cursor: 'default' } : undefined}>
                  <span class="line-dot" style={{ '--dot': p.done ? 'var(--ok)' : 'var(--ink)' } as JSX.CSSProperties} />
                  <span class="grow">
                    <span class="list-title" style={{ display: 'block' }}>
                      {p.label}
                    </span>
                    {p.done && p.max ? <span class="list-sub">{p.marks}/{p.max}</span> : p.done && p.scale ? <span class="list-sub">≈ {p.scale}</span> : null}
                  </span>
                  {p.done ? <span class="pill ok">✓</span> : <span class="pill">Hacer</span>}
                </button>
              ))}
            </div>
            {next && (
              <button class="btn signal" onClick={() => navigate(partRoute(next, 'mock'))}>
                Seguir: {next.label}
              </button>
            )}
            {hasRue && active.parts.some((p) => p.kind === 'rue' && !p.done) && (
              <section class="card flat stack" style={g(6)}>
                <span class="kicker">¿Prefieres el Paper 1 en papel?</span>
                <span class="small">Imprímelo (o guárdalo en PDF), hazlo con lápiz y luego mete aquí tus respuestas para corregirlo.</span>
                <div class="row" style={{ ...g(8), flexWrap: 'wrap' }}>
                  <button class="btn quiet small" onClick={() => navigate('/simulacro/imprimir')}>
                    Imprimir el Paper 1
                  </button>
                  <button class="btn quiet small" onClick={() => navigate('/simulacro/respuestas')}>
                    Introducir mis respuestas
                  </button>
                </div>
              </section>
            )}
            {allDone && (
              <button class="btn signal" onClick={finish} disabled={!!busy}>
                Ver mi nota
              </button>
            )}
            {!allDone && Object.keys(partial).length > 0 && (
              <p class="muted small">
                Hasta ahora: {Object.entries(partial).map(([k, v]) => `${SKILLS[k as keyof typeof SKILLS].label} ${scaleText(v!)}`).join(' · ')}
                {overallOf(partial) != null && active.paper === 'full' ? ` (global provisional ≈ ${overallOf(partial)})` : ''}
              </p>
            )}
            <button class="linkbtn" onClick={() => confirm('¿Abandonar este simulacro? Lo hecho no cuenta.') && setRun(null)}>
              Elegir otro simulacro
            </button>
          </>
        )}
      </Page>
    </>
  );
}

/* ── Paper 1 en papel ─────────────────────────────────────────── */

async function rueSetsOfRun(): Promise<RueSet[]> {
  const run = await getRun('mock');
  if (!run || run.finishedAt) return [];
  // Solo las partes que aún no has hecho en pantalla.
  const refs = run.parts.filter((p) => p.kind === 'rue' && !p.done).map((p) => p.ref);
  return (await Promise.all(refs.map((r) => getSet(r)))).filter((s): s is RueSet => !!s);
}

const num = (s: RueSet, n: number) => PARTS[s.part].firstNumber + n - 1;
const withGaps = (text: string, s: RueSet) => text.replace(/\{(\d+)\}/g, (_, n) => ` (${num(s, Number(n))}) ________ `);

function NoMock() {
  return (
    <>
      <Band back="/simulacro" kicker="Simulacro · Paper 1 en papel" title="Nada que imprimir" line="var(--ink)" />
      <Page>
        <p class="small">No tienes un simulacro en marcha con partes del Paper 1 pendientes. Empieza uno (el completo o el del Paper 1) y vuelve aquí.</p>
        <button class="btn signal" onClick={() => navigate('/simulacro', { replace: true })}>
          Ir a simulacros
        </button>
      </Page>
    </>
  );
}

function Paras(props: { text: string; s: RueSet }) {
  return (
    <>
      {props.text.split(/\n\s*\n/).map((p, i) => (
        <p key={i} class="read">
          {withGaps(p, props.s)}
        </p>
      ))}
    </>
  );
}

function PrintPart(props: { s: RueSet }): ComponentChildren {
  const s = props.s as RueSet & Record<string, unknown>;
  const head = (
    <>
      <h2>{PARTS[s.part].name}</h2>
      <p class="small">
        <em>{PARTS[s.part].instructions}</em>
      </p>
    </>
  );
  switch (s.part) {
    case 'p1':
      return (
        <section class="ppart">
          {head}
          <Paras text={s.text} s={s} />
          {s.items.map((it) => (
            <p key={it.n} class="small">
              <strong>{num(s, it.n)}</strong> A {it.options.A} · B {it.options.B} · C {it.options.C} · D {it.options.D}
            </p>
          ))}
        </section>
      );
    case 'p2':
      return (
        <section class="ppart">
          {head}
          <Paras text={s.text} s={s} />
        </section>
      );
    case 'p3':
      return (
        <section class="ppart">
          {head}
          <Paras text={s.text} s={s} />
          <p class="small">{s.items.map((it) => `${num(s, it.n)}: ${it.base}`).join(' · ')}</p>
        </section>
      );
    case 'p4':
      return (
        <section class="ppart">
          {head}
          {s.items.map((it) => (
            <div key={it.n} class="pitem">
              <p>
                <strong>{num(s, it.n)}</strong> {it.first}
              </p>
              <p>
                <strong>{it.keyword}</strong>
              </p>
              <p>
                {it.before} ______________________ {it.after}
              </p>
            </div>
          ))}
        </section>
      );
    case 'p5':
      return (
        <section class="ppart">
          {head}
          <Paras text={s.text} s={s} />
          {s.items.map((it) => (
            <div key={it.n} class="pitem">
              <p>
                <strong>{num(s, it.n)}</strong> {it.question}
              </p>
              <p class="small">
                A {it.options.A}
                <br />B {it.options.B}
                <br />C {it.options.C}
                <br />D {it.options.D}
              </p>
            </div>
          ))}
        </section>
      );
    case 'p6':
      return (
        <section class="ppart">
          {head}
          <h3>{s.title}</h3>
          {s.texts.map((t) => (
            <div key={t.letter}>
              <p>
                <strong>
                  {t.letter} · {t.author}
                </strong>
              </p>
              <p class="read">{t.text}</p>
            </div>
          ))}
          {s.items.map((it) => (
            <p key={it.n}>
              <strong>{num(s, it.n)}</strong> {it.question}
            </p>
          ))}
        </section>
      );
    case 'p7':
      return (
        <section class="ppart">
          {head}
          <Paras text={s.text} s={s} />
          {s.paragraphs.map((p) => (
            <p key={p.letter} class="read">
              <strong>{p.letter}</strong> {p.text}
            </p>
          ))}
        </section>
      );
    case 'p8':
      return (
        <section class="ppart">
          {head}
          <p>{s.intro}</p>
          {s.sections.map((sec) => (
            <div key={sec.letter}>
              <p>
                <strong>
                  {sec.letter} · {sec.heading}
                </strong>
              </p>
              <p class="read">{sec.text}</p>
            </div>
          ))}
          {s.items.map((it) => (
            <p key={it.n}>
              <strong>{num(s, it.n)}</strong> {it.statement}
            </p>
          ))}
        </section>
      );
  }
}

export function SimulacroImprimir() {
  const [sets, setSets] = useState<RueSet[] | null>(null);
  const [pdfLib, setPdfLib] = useState<typeof import('jspdf') | null>(null);
  const [busy, setBusy] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rueSetsOfRun().then(setSets);
    // Se carga ya, para que al tocar el botón el PDF salga al momento (iOS solo deja compartir justo tras el toque).
    import('jspdf')
      .then(setPdfLib)
      .catch(() => undefined);
  }, []);

  const downloadPdf = async () => {
    if (!pdfLib || !docRef.current) return;
    setBusy(true);
    try {
      const blob = buildPaperPdf(docRef.current, pdfLib.jsPDF);
      const res = await sharePdf(blob, 'C1-Advanced-Paper-1.pdf');
      if (res === 'downloaded') toast('PDF descargado');
    } catch (e) {
      toast((e as Error).message || 'No se ha podido crear el PDF.', 4000);
    } finally {
      setBusy(false);
    }
  };

  if (!sets) return <Spinner />;
  if (!sets.length) return <NoMock />;
  return (
    <>
      <div class="noprint">
        <Band back="/simulacro" kicker="Simulacro · Paper 1 en papel" title="Imprimir o PDF" sub="8 partes y hoja de respuestas" line="var(--ink)" />
      </div>
    <div class="printdoc" ref={docRef}>
      <section class="noprint card flat stack" style={{ ...g(6), margin: '16px 0' }}>
        <span class="small">
          <strong>Descargar PDF</strong> lo crea en el móvil: en el iPhone se abre el menú de compartir y eliges «Guardar en Archivos», «Imprimir» o mandártelo.
        </span>
        <span class="small muted">Hazlo con lápiz en 1 h 30 min y luego, en el simulacro, «Introducir mis respuestas».</span>
      </section>
      <header class="phead">
        <h1>C1 Advanced · Reading and Use of English (practice)</h1>
        <p>Time: 1 hour 30 minutes · Mind the Gap · original practice material</p>
      </header>
      {sets.map((s) => (
        <PrintPart key={s.id} s={s} />
      ))}
      <section class="ppart psheet">
        <h2>Answer sheet</h2>
        {sets.map((s) => (
          <div key={s.id} class="sheetpart">
            <strong>Part {s.part.slice(1)}</strong>
            <div class="sheetgrid">
              {s.items.map((it) => (
                <span key={it.n} class={['p2', 'p3', 'p4'].includes(s.part) ? 'cell wide' : 'cell'}>
                  {num(s, it.n)} ______
                </span>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
      <div class="printbar noprint">
        <button class="btn signal" onClick={downloadPdf} disabled={!pdfLib || busy}>
          {busy ? 'Creando el PDF…' : pdfLib ? 'Descargar PDF' : 'Preparando el PDF…'}
        </button>
        <button class="btn quiet" onClick={() => window.print()}>
          Imprimir
        </button>
      </div>
    </>
  );
}

/* ── Introducir las respuestas del papel ──────────────────────── */

export function SimulacroRespuestas() {
  const [sets, setSets] = useState<RueSet[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answers>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    rueSetsOfRun().then(setSets);
  }, []);

  const set = (id: string, n: number, v: string) => setAnswers((a) => ({ ...a, [id]: { ...(a[id] ?? {}), [n]: v } }));

  const submit = async () => {
    if (!sets) return;
    setBusy(true);
    try {
      let failed = 0;
      for (const s of sets) {
        const ans = answers[s.id] ?? {};
        let r = markSet(s, ans);
        if (r.items.some((i) => i.needsReview && i.given.trim())) {
          const rev = await reviewOpenAnswers(s, r);
          r = markSet(s, ans, rev.marks);
          failed += rev.failed;
        }
        await recordPart('rue', s.id, { marks: r.marks, max: r.max });
        void store()
          .add('attempts', { kind: 'rue', part: s.part, exerciseId: s.id, source: s.source, mode: 'exam', paper: true, answers: ans, marks: r.marks, max: r.max, pct: Math.round((r.marks / r.max) * 100), at: Date.now() })
          .catch(() => undefined);
      }
      toast(failed ? `Paper 1 corregido. ${failed} respuesta${failed === 1 ? '' : 's'} abierta${failed === 1 ? '' : 's'} sin revisar por la IA: cuenta${failed === 1 ? '' : 'n'} solo si coincide${failed === 1 ? '' : 'n'} con la clave.` : 'Paper 1 corregido', failed ? 5000 : 2600);
      navigate('/simulacro', { replace: true });
    } catch (e) {
      toast((e as Error).message || 'No se ha podido corregir.', 4000);
      setBusy(false);
    }
  };

  if (!sets) return <Spinner />;
  if (!sets.length) return <NoMock />;
  return (
    <>
      <Band back="/simulacro" kicker="Simulacro · Paper 1 en papel" title="Tus respuestas" sub="Copia lo que marcaste en la hoja" line="var(--ink)" />
      <Page>
        {sets.map((s) => {
          // Las letras salen del propio ejercicio (textos de la P6, párrafos de la P7, secciones de la P8).
          const letters =
            s.part === 'p1' || s.part === 'p5'
              ? ['A', 'B', 'C', 'D']
              : s.part === 'p6'
                ? s.texts.map((t) => t.letter)
                : s.part === 'p7'
                  ? s.paragraphs.map((p) => p.letter).sort()
                  : s.part === 'p8'
                    ? s.sections.map((x) => x.letter)
                    : null;
          return (
            <section key={s.id} class="card stack" style={g(8)}>
              <span class="kicker">{PARTS[s.part].name}</span>
              {s.items.map((it) => (
                <div key={it.n} class="row" style={{ ...g(8), alignItems: 'center' }}>
                  <span class="qnum">{num(s, it.n)}</span>
                  {letters ? (
                    <div class="letters">
                      {letters.map((l) => (
                        <button key={l} class={`choice ${answers[s.id]?.[it.n] === l ? 'on' : ''}`} onClick={() => set(s.id, it.n, l)}>
                          <strong>{l}</strong>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <input class="input" style={{ flex: 1 }} value={answers[s.id]?.[it.n] ?? ''} spellcheck={false} {...({ autocorrect: 'off', autocapitalize: 'off' } as Record<string, string>)} onInput={(e) => set(s.id, it.n, (e.target as HTMLInputElement).value)} />
                  )}
                </div>
              ))}
            </section>
          );
        })}
        <button class="btn signal" onClick={submit} disabled={busy}>
          {busy ? 'Corrigiendo…' : 'Corregir el Paper 1'}
        </button>
      </Page>
    </>
  );
}
