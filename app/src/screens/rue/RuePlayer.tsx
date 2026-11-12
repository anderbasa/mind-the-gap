// Un ejercicio de una parte: cargar (o generar), contestar, corregir y guardar.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { allSets, getProgress, getSet, markDone, pickNext } from '../../rue/bank';
import { confirmSpend } from '../../rue/generate';
import { cancelJob, clearJob, jobs, startJob } from '../../rue/jobs';
import { markSet, type Answers, type SetResult } from '../../rue/marking';
import { reviewOpenAnswers } from '../../rue/review';
import { PARTS, type PartId, type RueSet } from '../../rue/schema';
import { hasStore, store } from '../../state';
import { goBack, navigate, route } from '../../router';
import { Band, Page, Spinner } from '../../ui/components';
import { PartView } from './parts';
import { Results } from './Results';
import { SaveWordBar, picked } from './WordTap';
import { DiagContinue } from '../DiagContinue';
import { recordPart } from '../../diagnostic/run';
import { recordActivity } from '../../progress/progress';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;
type Phase = { k: 'loading' } | { k: 'empty'; allSeen: boolean; oldest: RueSet | null } | { k: 'doing' } | { k: 'marking' } | { k: 'done' };

function Elapsed(props: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - props.since) / 1000));
  return (
    <span class="tabular">
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </span>
  );
}

const draftKey = (id: string) => `mtg.rue.draft.${id}`;

function readDraft(id: string): Answers {
  try {
    return JSON.parse(localStorage.getItem(draftKey(id)) ?? '{}');
  } catch {
    return {};
  }
}

function Timer(props: { start: number; limitMin: number; exam: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = Math.floor((now - props.start) / 1000);
  const left = props.limitMin * 60 - elapsed;
  const show = props.exam ? Math.abs(left) : elapsed;
  const txt = `${left < 0 && props.exam ? '+' : ''}${Math.floor(show / 60)}:${String(show % 60).padStart(2, '0')}`;
  return <span class={`pill tabular ${props.exam && left < 0 ? 'signal' : ''}`}>{props.exam ? `⏱ ${txt}` : txt}</span>;
}

export function RuePlayer() {
  const part = route.value.path.split('/')[3] as PartId;
  const exam = route.value.query.get('mode') === 'exam';
  const wantedId = route.value.query.get('id');
  const diag = (route.value.query.get('diag') === '1' || route.value.query.get('mock') === '1');
  const info = PARTS[part];

  const [phase, setPhase] = useState<Phase>({ k: 'loading' });
  const [set, setSet] = useState<RueSet | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [result, setResult] = useState<SetResult | null>(null);
  const [aiReasons, setAiReasons] = useState<Record<number, string>>({});
  const [reviewFailed, setReviewFailed] = useState(0);
  const start = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  const begin = (s: RueSet) => {
    setSet(s);
    setAnswers(readDraft(s.id));
    setResult(null);
    start.current = Date.now();
    setPhase({ k: 'doing' });
    window.scrollTo(0, 0);
  };

  const load = async (forceNew = false) => {
    setPhase({ k: 'loading' });
    if (wantedId && !forceNew) {
      const s = await getSet(wantedId);
      if (s) return begin(s);
    }
    const [sets, progress] = await Promise.all([allSets(part), getProgress()]);
    const next = pickNext(sets, progress, part);
    if (next.set && next.fresh && !forceNew) return begin(next.set);
    setPhase({ k: 'empty', allSeen: !!next.set, oldest: next.set });
  };

  // La generación vive fuera de esta pantalla (rue/jobs.ts): si sales, sigue.
  const job = jobs.value[part];
  const generating = !!job && !job.done && !job.error;

  const generate = () => {
    if (!confirmSpend(1)) return; // solo pregunta si fuese a gastar saldo
    clearJob(part);
    startJob(part);
  };

  useEffect(() => {
    picked.value = null;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part, wantedId]);

  // Cuando el trabajo termina estando en esta pantalla, empezamos el ejercicio nuevo.
  useEffect(() => {
    if (job?.done && (phase.k === 'empty' || phase.k === 'loading')) {
      const s = job.done;
      clearJob(part);
      begin(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.done, phase.k]);

  const setAnswer = (n: number, v: string) => {
    setAnswers((prev) => {
      const next = { ...prev, [n]: v };
      try {
        localStorage.setItem(draftKey(set!.id), JSON.stringify(next));
      } catch {
        /* sin almacenamiento */
      }
      return next;
    });
  };

  const submit = async () => {
    if (!set) return;
    const missing = set.items.filter((it) => !(answers[it.n] ?? '').trim()).length;
    if (missing && !confirm(`Te quedan ${missing} sin contestar. ¿Corregir igualmente?`)) return;
    const ms = Date.now() - start.current;
    setElapsed(ms);
    setPhase({ k: 'marking' });
    let r = markSet(set, answers);
    let reasons: Record<number, string> = {};
    let failed = 0;
    if (r.items.some((i) => i.needsReview && i.given.trim())) {
      const rev = await reviewOpenAnswers(set, r);
      r = markSet(set, answers, rev.marks);
      reasons = rev.reasons;
      failed = rev.failed;
    }
    setResult(r);
    setAiReasons(reasons);
    setReviewFailed(failed);
    setPhase({ k: 'done' });
    window.scrollTo(0, 0);
    try {
      localStorage.removeItem(draftKey(set.id));
    } catch {
      /* nada */
    }
    if (diag) void recordPart('rue', set.id, { marks: r.marks, max: r.max });
    if (hasStore()) {
      const pct = r.max ? (r.marks / r.max) * 100 : 0;
      void markDone(set.id, pct);
      void recordActivity({ kind: 'rue', part, mode: exam ? 'exam' : 'practice' });
      void store().add('attempts', {
        kind: 'rue',
        part,
        exerciseId: set.id,
        source: set.source,
        mode: exam ? 'exam' : 'practice',
        answers,
        marks: r.marks,
        max: r.max,
        pct: Math.round(pct),
        perItem: r.items.map((i) => ({ n: i.n, marks: i.marks, max: i.max })),
        durationMs: ms,
        at: Date.now(),
      });
      for (const it of r.items.filter((i) => i.marks < i.max)) {
        const src = set.items.find((x) => x.n === it.n) as Record<string, unknown>;
        void store().add('errors', {
          kind: 'rue',
          part,
          exerciseId: set.id,
          n: it.n,
          focus: (src.focus as string) ?? info.name,
          yourAnswer: it.given,
          correct: it.expected,
          explanation: String(src.explanation ?? ''),
          at: Date.now(),
        });
      }
    }
  };

  const kicker = `${exam ? 'Examen' : 'Práctica'} · ${info.skill === 'reading' ? 'Reading' : 'Use of English'}`;
  const answered = set ? set.items.filter((it) => (answers[it.n] ?? '').trim()).length : 0;

  return (
    <>
      <Band
        back="/practicar/rue"
        kicker={kicker}
        title={info.name.replace(/^Part \d · /, '')}
        sub={`Part ${part.slice(1)} · ${info.items} preguntas · ${info.items * info.marksPerItem} puntos`}
        line={info.skill === 'reading' ? 'var(--line-reading)' : 'var(--line-uoe)'}
        right={phase.k === 'doing' ? <Timer start={start.current} limitMin={info.minutes} exam={exam} /> : undefined}
      />
      <Page>
        {phase.k === 'loading' && <Spinner label="Buscando un ejercicio…" />}

        {phase.k === 'empty' && generating && job && (
          <section class="card stack" style={g(12)}>
            <Spinner label={job.step} />
            <p class="small">
              Llevamos <Elapsed since={job.startedAt} />. Suele tardar entre 1 y 3 minutos: un modelo lo escribe y otro lo resuelve a ciegas para comprobarlo.
            </p>
            <p class="muted small">Puedes salir de esta pantalla y hacer otra cosa: sigue preparándose y te aviso cuando esté listo.</p>
            <button class="btn ghost small" onClick={() => cancelJob(part)}>
              Cancelar
            </button>
          </section>
        )}

        {phase.k === 'empty' && !generating && (
          <section class="card stack" style={g(12)}>
            <h2>{phase.allSeen ? 'Ya los has hecho todos' : 'Aún no hay ejercicios de esta parte'}</h2>
            {job?.error && <div class="notice bad">{job.error}</div>}
            <p>El banco de esta parte se va ampliando con ejercicios escritos y revisados a mano. Mientras tanto, repetir uno que hiciste hace tiempo también sirve.</p>
            {phase.oldest && (
              <button class="btn signal" onClick={() => begin(phase.oldest!)}>
                Repetir el que hiciste hace más tiempo
              </button>
            )}
            <button class="btn ghost" onClick={generate}>
              {job?.error ? 'Probar otra vez con IA (experimental)' : 'Probar a generar uno con IA (experimental)'}
            </button>
            <p class="muted small">Con Gemini gratis tarda 1–3 minutos y muchos se descartan en el control de calidad.</p>
          </section>
        )}

        {(phase.k === 'doing' || phase.k === 'marking') && set && (
          <>
            <p class="instructions">{info.instructions}</p>
            <PartView set={set} answers={answers} setAnswer={setAnswer} practice={!exam} />
            <div class="submitbar">
              <span class="muted small tabular">
                {answered}/{set.items.length} contestadas
              </span>
              <button class="btn signal" onClick={submit} disabled={phase.k === 'marking'}>
                {phase.k === 'marking' ? 'Corrigiendo…' : 'Corregir'}
              </button>
            </div>
          </>
        )}

        {phase.k === 'done' && diag && <DiagContinue />}
        {phase.k === 'done' && set && result && (
          <Results
            set={set}
            result={result}
            aiReasons={aiReasons}
            reviewFailed={reviewFailed}
            exam={exam}
            elapsedMs={elapsed}
            onBack={() => goBack('/practicar/rue')}
            onNext={() => {
              navigate(`/practicar/rue/${part}?mode=${exam ? 'exam' : 'practice'}`, { replace: true });
              if (!wantedId) void load(); // si venía con id, el cambio de ruta ya recarga
            }}
          />
        )}
      </Page>
      <SaveWordBar />
    </>
  );
}
