// Un listening: audio (examen: dos veces sin pausa / práctica: pausa, velocidad, repetir frase),
// preguntas, corrección y transcripción con las respuestas marcadas.
import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren, JSX } from 'preact';
import { aiErrorMessage } from '../../ai/client';
import { listeningProgress, loadSets, pickSet, renderOnDevice, unitAudio, type UnitAudio } from '../../listening/bank';
import { markListening, type LAnswers, type LResult } from '../../listening/marking';
import { LPART_INFO, transcriptOf, type L4T, type ListeningSetT, type LPart, type McqT, type UnitT } from '../../listening/schema';
import { navigate, route } from '../../router';
import { hasStore, store } from '../../state';
import { Band, Page, Spinner, toast } from '../../ui/components';
import { ExplainEs } from '../../ui/ExplainEs';
import { AudioPlayer, audioEl, seekAndPlay, stopAudio } from './AudioPlayer';
import { DiagContinue } from '../DiagContinue';
import { recordPart } from '../../diagnostic/run';
import { recordActivity } from '../../progress/progress';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;
const draftKey = (id: string) => `mtg.listening.draft.${id}`;

function readDraft(id: string): LAnswers {
  try {
    return JSON.parse(localStorage.getItem(draftKey(id)) ?? '{}');
  } catch {
    return {};
  }
}

/* ── Audio de una pieza (del banco o generado aquí) ─────────────── */

function AudioBlock(props: { unit: UnitT; exam: boolean; readSec: number; autoStart?: boolean; onExamDone?: () => void; label: string }) {
  const [audio, setAudio] = useState<UnitAudio | null | undefined>(undefined);
  const [making, setMaking] = useState<string | null>(null);

  useEffect(() => {
    setAudio(undefined);
    unitAudio(props.unit)
      .then(setAudio)
      .catch(() => setAudio(null));
  }, [props.unit.id]);

  const make = async () => {
    setMaking('Empezando…');
    try {
      const a = await renderOnDevice(props.unit, (d, t) => setMaking(`Generando la voz… (${d} de ${t})`));
      setAudio(a);
    } catch (e) {
      toast(aiErrorMessage(e), 5000);
    } finally {
      setMaking(null);
    }
  };

  if (audio === undefined) return <Spinner label="Cargando el audio…" />;
  if (audio === null) {
    return (
      <div class="player stack" style={g(8)}>
        <strong>{props.label}</strong>
        <p class="small">
          Este audio aún no está generado en el banco (GitHub lo va generando con la cuota gratuita de Gemini). Puedes generarlo ahora en este dispositivo: es gratis y
          tarda un minuto más o menos.
        </p>
        {making ? (
          <Spinner label={making} />
        ) : (
          <button class="btn quiet" onClick={make}>
            Generarlo aquí (gratis)
          </button>
        )}
      </div>
    );
  }
  return <AudioPlayer audio={audio} exam={props.exam} readSec={props.readSec} autoStart={props.autoStart} onExamDone={props.onExamDone} label={props.label} />;
}

/* ── Preguntas ───────────────────────────────────────────────────── */

function Mcq(props: { q: McqT; value?: string; onPick: (v: string) => void; locked: boolean }) {
  const { q } = props;
  return (
    <div class="card stack" style={g(8)}>
      <div class="row" style={{ ...g(10), alignItems: 'flex-start' }}>
        <span class="qnum">{q.n}</span>
        <span class="read" style={{ fontWeight: 600 }}>
          {q.stem}
        </span>
      </div>
      <div class="choices">
        {Object.entries(q.options).map(([k, v]) => (
          <button key={k} class={`choice ${props.value === k ? 'on' : ''}`} disabled={props.locked} onClick={() => props.onPick(k)}>
            <strong>{k}</strong>
            <span class="read">{v}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function GapSentence(props: { n: number; sentence: string; value: string; onInput: (v: string) => void; locked: boolean }) {
  const [before, after = ''] = props.sentence.split('___');
  return (
    <div class="card stack" style={g(8)}>
      <div class="row" style={{ ...g(10), alignItems: 'flex-start' }}>
        <span class="qnum">{props.n}</span>
        <span class="read">
          {before}
          <input
            class="input gapinput"
            value={props.value}
            disabled={props.locked}
            spellcheck={false}
            {...({ autocorrect: 'off', autocapitalize: 'off', autocomplete: 'off' } as Record<string, string>)}
            onInput={(e) => props.onInput((e.target as HTMLInputElement).value)}
            aria-label={`Respuesta ${props.n}`}
          />
          {after}
        </span>
      </div>
    </div>
  );
}

function Matching(props: { set: L4T; answers: LAnswers; onPick: (n: number, v: string) => void; locked: boolean }) {
  const { set } = props;
  const block = (task: L4T['task1'], first: number) => (
    <section class="card stack" style={g(10)}>
      <p class="small" style={{ fontWeight: 700 }}>
        {task.prompt}
      </p>
      <div class="stack" style={g(2)}>
        {Object.entries(task.options).map(([k, v]) => (
          <span key={k} class="small">
            <strong>{k}</strong> {v}
          </span>
        ))}
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} class="stack" style={g(4)}>
          <span class="row" style={g(8)}>
            <span class="qnum">{first + i}</span>
            <span class="small">Speaker {i + 1}</span>
          </span>
          <div class="letters">
            {Object.keys(task.options).map((k) => (
              <button
                key={k}
                class={`choice ${props.answers[first + i] === k ? 'on' : ''}`}
                disabled={props.locked}
                onClick={() => props.onPick(first + i, k)}
                aria-label={`Speaker ${i + 1}: ${k}`}
              >
                <strong>{k}</strong>
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
  return (
    <>
      {block(set.task1, 21)}
      {block(set.task2, 26)}
    </>
  );
}

/* ── Transcripción con las respuestas marcadas ─────────────────── */

function markEvidence(text: string, evidences: { n: number; ev: string }[]): ComponentChildren[] {
  const lower = text.toLowerCase();
  const ranges = evidences
    .map(({ n, ev }) => {
      const at = lower.indexOf(ev.toLowerCase());
      return at < 0 ? null : { start: at, end: at + ev.length, n };
    })
    .filter((x): x is { start: number; end: number; n: number } => !!x)
    .sort((a, b) => a.start - b.start);
  const out: ComponentChildren[] = [];
  let last = 0;
  for (const r of ranges) {
    if (r.start < last) continue;
    out.push(text.slice(last, r.start));
    out.push(
      <mark key={r.n} class="ev">
        {text.slice(r.start, r.end)}
        <sup>{r.n}</sup>
      </mark>,
    );
    last = r.end;
  }
  out.push(text.slice(last));
  return out;
}

function Transcript(props: { unit: UnitT; evidences: { n: number; ev: string }[]; title?: string }) {
  const lines = transcriptOf(props.unit);
  return (
    <section class="card stack" style={g(8)}>
      <span class="kicker">{props.title ?? 'Transcripción'}</span>
      <p class="small muted">Toca una frase para volver a oírla.</p>
      {lines.map((l, i) => (
        <button key={i} class="tline" onClick={() => playTurn(props.unit, i)}>
          <span class="small" style={{ fontWeight: 700 }}>
            {l.who}
          </span>
          <span class="read">{markEvidence(l.text, props.evidences)}</span>
        </button>
      ))}
    </section>
  );
}

async function playTurn(unit: UnitT, i: number) {
  const a = await unitAudio(unit);
  if (!a) return toast('Este audio aún no está disponible.');
  const el = audioEl();
  if (el.src !== a.url) el.src = a.url;
  seekAndPlay(a.turns[i]?.[0] ?? 0);
}

/* ── Pantalla ───────────────────────────────────────────────────── */

export function ListeningPlayer() {
  const part = route.value.path.split('/')[3] as LPart;
  const exam = route.value.query.get('mode') === 'exam';
  const wanted = route.value.query.get('id');
  const diag = (route.value.query.get('diag') === '1' || route.value.query.get('mock') === '1');
  const info = LPART_INFO[part];

  const [set, setSet] = useState<ListeningSetT | null | undefined>(undefined);
  const [answers, setAnswers] = useState<LAnswers>({});
  const [result, setResult] = useState<LResult | null>(null);
  const [extract, setExtract] = useState(0);
  const [examStep, setExamStep] = useState(0); // P1 en examen: qué extracto suena
  const [start] = useState(Date.now());

  const load = (exclude?: string) => {
    stopAudio();
    Promise.all([loadSets(), listeningProgress()]).then(([sets, prog]) => {
      const s = pickSet(sets, part, prog, exclude ? null : wanted, exclude);
      setSet(s);
      setResult(null);
      setExtract(0);
      setExamStep(0);
      setAnswers(s ? readDraft(s.id) : {});
      window.scrollTo(0, 0);
    });
  };

  useEffect(() => {
    load();
    return () => stopAudio();
  }, [part, wanted]);

  const pick = (n: number, v: string) => {
    if (result || !set) return;
    setAnswers((prev) => {
      const next = { ...prev, [n]: v };
      try {
        localStorage.setItem(draftKey(set.id), JSON.stringify(next));
      } catch {
        /* nada */
      }
      return next;
    });
  };

  const submit = () => {
    if (!set) return;
    const blanks = info.items - Object.values(answers).filter((x) => x.trim()).length;
    if (blanks > 0 && !confirm(`Te quedan ${blanks} sin contestar. ¿Corregir igualmente?`)) return;
    stopAudio();
    const r = markListening(set, answers);
    setResult(r);
    window.scrollTo(0, 0);
    try {
      localStorage.removeItem(draftKey(set.id));
    } catch {
      /* nada */
    }
    if (diag) void recordPart('listening', set.id, { marks: r.marks, max: r.max });
    if (!hasStore()) return;
    const pct = Math.round((r.marks / r.max) * 100);
    void recordActivity({ kind: 'listening', part, mode: exam ? 'exam' : 'practice' });
    void store()
      .add('attempts', { kind: 'listening', part, setId: set.id, mode: exam ? 'exam' : 'practice', marks: r.marks, max: r.max, pct, answers, durationMs: Date.now() - start, at: Date.now() })
      .catch(() => undefined);
    for (const it of r.items.filter((i) => !i.ok)) {
      void store()
        .add('errors', { kind: 'listening', part, exerciseId: set.id, n: it.n, focus: info.name, yourAnswer: it.given, correct: it.expected, explanation: it.explanation, at: Date.now() })
        .catch(() => undefined);
    }
  };

  if (set === undefined) return <Spinner />;
  if (!set) {
    return (
      <>
        <Band back="/practicar/listening" kicker="Listening" title="No hay ejercicios de esta parte" />
        <Page>
          <button class="btn" onClick={() => navigate('/practicar/listening', { replace: true })}>
            Volver
          </button>
        </Page>
      </>
    );
  }

  const locked = !!result;
  const kicker = `${exam ? 'Examen' : 'Práctica'} · Listening`;
  const evidencesFor = (nums: number[]) => (result ? result.items.filter((i) => nums.includes(i.n)).map((i) => ({ n: i.n, ev: i.evidence })) : []);

  return (
    <>
      <Band back="/practicar/listening" kicker={kicker} title={info.name.replace(/^Part \d · /, '')} sub={`${set.title} · ${info.items} preguntas`} line="var(--line-listening)" />
      <Page>
        {result && diag && <DiagContinue />}
        {result && !diag && (
          <section class="card card-line stack" style={{ ...g(8), '--card-line': 'var(--line-listening)' } as JSX.CSSProperties}>
            <div class="spread">
              <span class="kicker">Resultado</span>
              <span class="pill">{exam ? 'Examen' : 'Práctica'}</span>
            </div>
            <span class="bigscore tabular">
              {result.marks}
              <small>/{result.max}</small>
            </span>
            <p class="small muted">Debajo tienes cada respuesta con su explicación y la transcripción con el momento exacto en que se oye.</p>
            <div class="row" style={{ ...g(8), flexWrap: 'wrap' }}>
              <button class="btn small" onClick={() => load(set.id)}>
                Otro de esta parte
              </button>
              <button class="btn quiet small" onClick={() => navigate('/practicar/listening')}>
                Volver al Listening
              </button>
            </div>
          </section>
        )}

        {!result && (
          <p class="small read" style={{ fontStyle: 'italic' }}>
            {info.rubric}
          </p>
        )}

        {/* Parte 1: tres extractos */}
        {set.part === 'l1' && (
          <>
            {!exam && !result && (
              <div class="chips" role="group" aria-label="Extracto">
                {set.extracts.map((_, i) => (
                  <button key={i} class={`chip ${extract === i ? 'on' : ''}`} aria-pressed={extract === i} onClick={() => setExtract(i)}>
                    Extract {i + 1}
                  </button>
                ))}
              </div>
            )}
            {set.extracts.map((x, i) => {
              const visible = exam || result ? true : extract === i;
              if (!visible) return null;
              const playingHere = exam && !result ? examStep === i : false;
              return (
                <section key={x.unit.id} class="stack" style={g(10)}>
                  <span class="kicker">Extract {i + 1}</span>
                  <p class="read">{x.context}</p>
                  {!result && (!exam || playingHere) && (
                    <AudioBlock
                      unit={x.unit}
                      exam={exam}
                      readSec={info.readSec}
                      autoStart={exam && i > 0}
                      onExamDone={() => setExamStep(i + 1)}
                      label={`Extract ${i + 1}`}
                    />
                  )}
                  {exam && !result && examStep > i && <span class="small muted">✓ Extracto escuchado dos veces.</span>}
                  {x.questions.map((q) => (
                    <Mcq key={q.n} q={q} value={answers[q.n]} onPick={(v) => pick(q.n, v)} locked={locked} />
                  ))}
                  {result && <Review result={result} nums={x.questions.map((q) => q.n)} />}
                  {result && <Transcript unit={x.unit} evidences={evidencesFor(x.questions.map((q) => q.n))} title={`Transcripción · Extract ${i + 1}`} />}
                </section>
              );
            })}
          </>
        )}

        {set.part !== 'l1' && (
          <>
            <p class="read">{set.context}</p>
            {!result && <AudioBlock unit={set.unit} exam={exam} readSec={info.readSec} label={set.title} />}
            {set.part === 'l2' &&
              set.items.map((it) => (
                <GapSentence key={it.n} n={it.n} sentence={it.sentence} value={answers[it.n] ?? ''} onInput={(v) => pick(it.n, v)} locked={locked} />
              ))}
            {set.part === 'l3' && set.questions.map((q) => <Mcq key={q.n} q={q} value={answers[q.n]} onPick={(v) => pick(q.n, v)} locked={locked} />)}
            {set.part === 'l4' && <Matching set={set} answers={answers} onPick={pick} locked={locked} />}
            {result && <Review result={result} nums={result.items.map((i) => i.n)} />}
            {result && <Transcript unit={set.unit} evidences={evidencesFor(result.items.map((i) => i.n))} />}
          </>
        )}

        {!result && (
          <div class="submitbar">
            <span class="small">
              {Object.values(answers).filter((x) => x.trim()).length}/{info.items} contestadas
            </span>
            <button class="btn signal" onClick={submit}>
              Corregir
            </button>
          </div>
        )}
      </Page>
    </>
  );
}

function Review(props: { result: LResult; nums: number[] }) {
  const items = props.result.items.filter((i) => props.nums.includes(i.n));
  return (
    <div class="stack" style={g(8)}>
      {items.map((it) => (
        <div key={it.n} class={`card stack review ${it.ok ? 'ok' : 'bad'}`} style={g(6)}>
          <div class="spread">
            <span class="qnum">{it.n}</span>
            <span class={`pill ${it.ok ? 'ok' : 'bad'}`}>{it.ok ? '1/1' : '0/1'}</span>
          </div>
          <span class="small">
            Tu respuesta: <strong class={it.ok ? 'ok-text' : 'bad-text'}>{it.given || '—'}</strong>
            {!it.ok && (
              <>
                {' · '}Correcta: <strong>{it.expected}</strong>
              </>
            )}
          </span>
          <span class="small">{it.explanation}</span>
          <blockquote class="evidence">«{it.evidence}»</blockquote>
          <ExplainEs message={`Listening question ${it.n}. Correct answer: ${it.expected}. Student's answer: ${it.given || '(blank)'}. Explanation: ${it.explanation} The key words in the recording: "${it.evidence}"`} />
        </div>
      ))}
    </div>
  );
}
