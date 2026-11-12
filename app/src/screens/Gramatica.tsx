// Gramática C1: índice con tu progreso, lección (microlección + bloques de colores + práctica libre),
// minijuego de orden de palabras e idioms contrarreloj.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { aiErrorMessage } from '../ai/client';
import { getLesson, IDIOMS, LESSONS, ROLE_ES, type Role } from '../grammar/lessons';
import { checkGrammar, explainAgain, getGrammarProgress, recordGrammar, type GrammarProgress, type GrammarResult } from '../grammar/practice';
import { navigate, route } from '../router';
import { store } from '../state';
import { Band, ListItem, Page, Spinner, toast } from '../ui/components';
import { ExplainEs } from '../ui/ExplainEs';
import { Rich } from '../ui/rich';
import { recordActivity } from '../progress/progress';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;
const NO_AUTOCORRECT = { autocorrect: 'off', autocapitalize: 'sentences', autocomplete: 'off' } as Record<string, string>;
const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);

/* ── Índice ───────────────────────────────────────────────────── */

export function GramaticaHub() {
  const [prog, setProg] = useState<Record<string, GrammarProgress> | null>(null);
  useEffect(() => {
    getGrammarProgress()
      .then(setProg)
      .catch(() => setProg({}));
  }, []);
  const next = prog ? LESSONS.find((l) => !prog[l.id]?.done) : null;
  return (
    <>
      <Band back="/practicar" kicker="Practicar · Herramientas" title="Gramática C1" sub="Lo que más sube la nota en Writing y Speaking" line="var(--line-grammar)" />
      <Page>
        {!prog && <Spinner />}
        {prog && (
          <>
            {next && (
              <button class="btn signal" onClick={() => navigate(`/practicar/gramatica/punto?id=${next.id}`)}>
                Siguiente: {next.title}
              </button>
            )}
            <div class="list">
              {LESSONS.map((l, i) => {
                const p = prog[l.id];
                const last = p?.results.slice(-5) ?? [];
                return (
                  <ListItem
                    key={l.id}
                    dot="var(--line-grammar)"
                    title={`${i + 1}. ${l.title}`}
                    sub={p ? `Últimas ${last.length}: ${last.filter(Boolean).length} bien` : 'Sin empezar'}
                    right={p?.done ? <span class="pill ok">Dominado</span> : undefined}
                    to={`/practicar/gramatica/punto?id=${l.id}`}
                  />
                );
              })}
            </div>
            <p class="muted small">Un punto queda dominado con 4 de tus 5 últimas frases bien. Las corrige Gemini (gratis).</p>
          </>
        )}
        <section class="stack" style={g(8)}>
          <span class="kicker">Minijuegos</span>
          <div class="list">
            <ListItem dot="var(--line-grammar)" title="Orden de palabras" sub="Toca las palabras en el orden correcto" to="/practicar/gramatica/orden" />
            <ListItem dot="var(--line-grammar)" title="Idioms contrarreloj" sub="30 segundos: ¿cuántos aciertas?" to="/practicar/gramatica/idioms" />
          </div>
        </section>
      </Page>
    </>
  );
}

/* ── Lección ──────────────────────────────────────────────────── */

export function GramaticaPunto() {
  const lesson = getLesson(route.value.query.get('id'));
  const [prog, setProg] = useState<GrammarProgress | undefined>(undefined);
  const [k, setK] = useState(0);
  const [answer, setAnswer] = useState('');
  const [res, setRes] = useState<GrammarResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [again, setAgain] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);

  useEffect(() => {
    if (lesson) getGrammarProgress().then((p) => setProg(p[lesson.id]));
  }, [lesson?.id]);

  if (!lesson) return <Spinner />;
  const prompt = lesson.prompts[k % lesson.prompts.length];

  const check = async () => {
    setBusy(true);
    try {
      const r = await checkGrammar(lesson, prompt, answer);
      setRes(r);
      setProg(await recordGrammar(lesson.id, r.ok, prog));
      void recordActivity({ kind: 'grammar' });
      if (!r.ok) {
        void store()
          .add('errors', { kind: 'grammar', category: 'grammar', focus: lesson.title, yourAnswer: answer, correct: r.corrected, explanation: r.comment, at: Date.now() })
          .catch(() => undefined);
      }
    } catch (e) {
      toast(aiErrorMessage(e), 4000);
    } finally {
      setBusy(false);
    }
  };

  const nextPrompt = () => {
    setK(k + 1);
    setAnswer('');
    setRes(null);
  };

  const explain = async () => {
    setExplaining(true);
    try {
      setAgain(await explainAgain(lesson));
    } catch (e) {
      toast(aiErrorMessage(e), 4000);
    } finally {
      setExplaining(false);
    }
  };

  const idx = LESSONS.findIndex((l) => l.id === lesson.id);
  const last5 = prog?.results.slice(-5) ?? [];

  return (
    <>
      <Band back="/practicar/gramatica" kicker={`Gramática C1 · ${idx + 1} de ${LESSONS.length}`} title={lesson.title} line="var(--line-grammar)" />
      <Page>
        <section class="card stack" style={g(10)}>
          <p class="small">{lesson.es}</p>
          <div class="gblocks">
            {lesson.blocks.map(([t, role], i) => (
              <span key={i} class={`gb gb-${role}`} title={ROLE_ES[role]}>
                {t}
              </span>
            ))}
          </div>
          <div class="chips small">
            {[...new Set(lesson.blocks.map(([, r]) => r))].map((r: Role) => (
              <span key={r} class={`gleg gb-${r}`}>
                {ROLE_ES[r]}
              </span>
            ))}
          </div>
          {lesson.examples.map((e) => (
            <span key={e} class="read">
              · {e}
            </span>
          ))}
          {explaining ? (
            <Spinner label="Buscando otra forma de explicarlo…" />
          ) : (
            <button class="linkbtn" onClick={explain}>
              No lo pillo: explícamelo de otra forma
            </button>
          )}
          {again && (
            <div class="hint small">
              <Rich text={again} />
            </div>
          )}
        </section>

        <section class="card card-line stack" style={{ ...g(10), '--card-line': 'var(--line-grammar)' } as JSX.CSSProperties}>
          <div class="spread">
            <span class="kicker">Practica</span>
            <span class="small muted">
              {prog?.done ? 'Dominado ✓' : `Últimas 5: ${last5.filter(Boolean).length}/${last5.length}`}
            </span>
          </div>
          <strong class="read">{prompt}</strong>
          <textarea class="textarea read" rows={2} style={{ minHeight: '64px' }} value={answer} disabled={!!res} spellcheck={false} {...NO_AUTOCORRECT} onInput={(e) => setAnswer((e.target as HTMLTextAreaElement).value)} />
          {!res ? (
            busy ? (
              <Spinner label="Corrigiendo…" />
            ) : (
              <button class="btn" onClick={check} disabled={!answer.trim()}>
                Comprobar
              </button>
            )
          ) : (
            <>
              <span class={res.ok ? 'ok-text' : 'bad-text'}>{res.ok ? (res.minor ? '✓ Bien (con un pequeño desliz)' : '✓ Perfecto') : '✗ Todavía no'}</span>
              <span class="small">{res.comment}</span>
              {res.corrected.trim() !== answer.trim() && (
                <span class="read">
                  → <strong>{res.corrected}</strong>
                </span>
              )}
              <ExplainEs message={`Grammar point: ${lesson.title}. Task: ${prompt}. Student wrote: "${answer}". Teacher: ${res.comment} Corrected: "${res.corrected}"`} />
              <button class="btn signal" onClick={nextPrompt}>
                Siguiente frase
              </button>
            </>
          )}
          {prog?.done && idx < LESSONS.length - 1 && (
            <button class="btn quiet" onClick={() => navigate(`/practicar/gramatica/punto?id=${LESSONS[idx + 1].id}`, { replace: true })}>
              Pasar a: {LESSONS[idx + 1].title}
            </button>
          )}
        </section>
      </Page>
    </>
  );
}

/* ── Orden de palabras ────────────────────────────────────────── */

const ORDER_SENTENCES = LESSONS.flatMap((l) => l.examples).filter((s) => s.split(' ').length <= 12);

export function OrdenPalabras() {
  const [list] = useState(() => shuffle(ORDER_SENTENCES));
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const [score, setScore] = useState(0);
  const [result, setResult] = useState<boolean | null>(null);
  const sentence = list[i % list.length];
  const words = sentence.split(' ');
  const [order, setOrder] = useState(() => shuffle(words.map((_, k) => k)));

  const reset = (n: number) => {
    const s = list[n % list.length].split(' ');
    setOrder(shuffle(s.map((_, k) => k)));
    setPicked([]);
    setResult(null);
  };

  const check = () => {
    const ok = picked.map((k) => words[k]).join(' ') === sentence;
    setResult(ok);
    if (ok) setScore(score + 1);
  };

  return (
    <>
      <Band back="/practicar/gramatica" kicker="Gramática · Minijuego" title="Orden de palabras" sub={`Aciertos: ${score}`} line="var(--line-grammar)" />
      <Page>
        <section class="card stack" style={g(12)}>
          <div class="wbuilt read">{picked.length ? picked.map((k) => words[k]).join(' ') : <span class="muted">Toca las palabras en orden…</span>}</div>
          <div class="chips">
            {order.map((k) => (
              <button key={k} class={`chip ${picked.includes(k) ? 'used' : ''}`} disabled={picked.includes(k) || result !== null} onClick={() => setPicked([...picked, k])}>
                {words[k]}
              </button>
            ))}
          </div>
          {result === null ? (
            <div class="row" style={g(8)}>
              <button class="btn" disabled={picked.length !== words.length} onClick={check}>
                Comprobar
              </button>
              <button class="btn quiet small" onClick={() => setPicked(picked.slice(0, -1))} disabled={!picked.length}>
                Borrar última
              </button>
            </div>
          ) : (
            <>
              <span class={result ? 'ok-text' : 'bad-text'}>{result ? '✓ ¡Bien!' : `✗ ${sentence}`}</span>
              <button
                class="btn signal"
                onClick={() => {
                  setI(i + 1);
                  reset(i + 1);
                }}
              >
                Siguiente
              </button>
            </>
          )}
        </section>
      </Page>
    </>
  );
}

/* ── Idioms contrarreloj ──────────────────────────────────────── */

export function IdiomsGame() {
  const [state, setState] = useState<'ready' | 'play' | 'end'>('ready');
  const [left, setLeft] = useState(30);
  const [score, setScore] = useState(0);
  const [round, setRound] = useState<{ idiom: string; options: string[]; answer: string } | null>(null);
  const [flash, setFlash] = useState<'ok' | 'bad' | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const newRound = () => {
    const it = IDIOMS[Math.floor(Math.random() * IDIOMS.length)];
    const others = shuffle(IDIOMS.filter((x) => x !== it)).slice(0, 3).map((x) => x.meaning);
    setRound({ idiom: it.idiom, answer: it.meaning, options: shuffle([it.meaning, ...others]) });
  };

  const start = () => {
    setScore(0);
    setLeft(30);
    setState('play');
    newRound();
    timer.current = setInterval(() => {
      setLeft((l) => {
        if (l <= 1) {
          if (timer.current) clearInterval(timer.current);
          setState('end');
          return 0;
        }
        return l - 1;
      });
    }, 1000);
  };

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const pick = (o: string) => {
    if (!round) return;
    const ok = o === round.answer;
    setFlash(ok ? 'ok' : 'bad');
    if (ok) setScore((s) => s + 1);
    setTimeout(() => setFlash(null), 300);
    newRound();
  };

  return (
    <>
      <Band back="/practicar/gramatica" kicker="Gramática · Minijuego" title="Idioms contrarreloj" line="var(--line-grammar)" />
      <Page>
        <section class={`card stack ${flash ? `flash-${flash}` : ''}`} style={g(12)}>
          {state === 'ready' && (
            <>
              <p class="small">30 segundos: elige el significado de cada idiom. Un error no resta, pero pierdes tiempo.</p>
              <button class="btn signal" onClick={start}>
                Empezar
              </button>
            </>
          )}
          {state === 'play' && round && (
            <>
              <div class="spread">
                <span class="pill tabular">⏱ {left}</span>
                <span class="pill">Aciertos: {score}</span>
              </div>
              <strong class="read" style={{ fontSize: '22px' }}>
                {round.idiom}
              </strong>
              <div class="choices">
                {round.options.map((o) => (
                  <button key={o} class="choice" onClick={() => pick(o)}>
                    <span class="read">{o}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {state === 'end' && (
            <>
              <span class="bigscore tabular">{score}</span>
              <p class="small">idioms en 30 segundos. ¿Lo superas?</p>
              <button class="btn signal" onClick={start}>
                Otra vez
              </button>
            </>
          )}
        </section>
      </Page>
    </>
  );
}
