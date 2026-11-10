// Un ejercicio de una parte: cargar (o generar), contestar, corregir y guardar.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { aiErrorMessage } from '../../ai/client';
import { AiError } from '../../ai/types';
import { allSets, getProgress, getSet, markDone, pickNext } from '../../rue/bank';
import { GenerationError, generateSet } from '../../rue/generate';
import { markSet, type Answers, type SetResult } from '../../rue/marking';
import { reviewOpenAnswers } from '../../rue/review';
import { PARTS, type PartId, type RueSet } from '../../rue/schema';
import { hasStore, store } from '../../state';
import { goBack, navigate, route } from '../../router';
import { Band, Page, Spinner, toast } from '../../ui/components';
import { PartView } from './parts';
import { Results } from './Results';
import { SaveWordBar, picked } from './WordTap';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;
type Phase = { k: 'loading' } | { k: 'empty'; allSeen: boolean; oldest: RueSet | null } | { k: 'generating'; step: string } | { k: 'doing' } | { k: 'marking' } | { k: 'done' };

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
  const info = PARTS[part];

  const [phase, setPhase] = useState<Phase>({ k: 'loading' });
  const [set, setSet] = useState<RueSet | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [result, setResult] = useState<SetResult | null>(null);
  const [aiReasons, setAiReasons] = useState<Record<number, string>>({});
  const [reviewFailed, setReviewFailed] = useState(0);
  const start = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const abort = useRef<AbortController | null>(null);

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

  const generate = async () => {
    abort.current = new AbortController();
    setPhase({ k: 'generating', step: 'Preparando…' });
    try {
      const s = await generateSet(part, { signal: abort.current.signal, onStep: (step) => setPhase({ k: 'generating', step }) });
      begin(s);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return load();
      const msg =
        e instanceof GenerationError
          ? `El ejercicio generado no ha pasado el control de calidad y se ha descartado (${e.issues[0]}). Prueba otra vez.`
          : e instanceof AiError
            ? aiErrorMessage(e)
            : 'No se ha podido generar.';
      toast(msg, 7000);
      console.warn(e);
      await load(true);
    }
  };

  useEffect(() => {
    picked.value = null;
    void load();
    return () => abort.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part, wantedId]);

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
    if (hasStore()) {
      const pct = r.max ? (r.marks / r.max) * 100 : 0;
      void markDone(set.id, pct);
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

        {phase.k === 'empty' && (
          <section class="card stack" style={g(12)}>
            <h2>{phase.allSeen ? 'Ya los has hecho todos' : 'Aún no hay ejercicios de esta parte'}</h2>
            <p>Theo puede escribir uno nuevo ahora (tarda entre 20 segundos y un minuto: lo escribe un modelo y lo comprueba otro a ciegas).</p>
            <button class="btn signal" onClick={generate}>
              Generar uno nuevo
            </button>
            {phase.oldest && (
              <button class="btn ghost" onClick={() => begin(phase.oldest!)}>
                Repetir el que hiciste hace más tiempo
              </button>
            )}
          </section>
        )}

        {phase.k === 'generating' && (
          <section class="card stack" style={g(12)}>
            <Spinner label={phase.step} />
            <p class="muted small">Si se agota la cuota gratuita de hoy, podrás seguir con el banco que ya tienes.</p>
            <button class="btn ghost small" onClick={() => abort.current?.abort()}>
              Cancelar
            </button>
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
