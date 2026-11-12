// Escenas de series: pegar subtítulos → lección de Theo (gratis, Gemini) → huecos por niveles,
// reformular, preguntas corregidas; lo que te falte va al vocabulario.
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { aiErrorMessage } from '../ai/client';
import { IS_DEMO } from '../config';
import { recordActivity } from '../progress/progress';
import { navigate, route } from '../router';
import { DEMO_SCENE } from '../series/demoScene';
import {
  cardFor,
  checkAnswers,
  cleanSubtitles,
  getSeries,
  listSeries,
  makeLesson,
  markGaps,
  MAX_CHARS,
  MIN_CHARS,
  patchSeries,
  placeGaps,
  type SeriesDoc,
} from '../series/series';
import { addCards } from '../srs/srs';
import { Band, ListItem, Page, Segmented, Spinner, toast } from '../ui/components';
import { ExplainEs } from '../ui/ExplainEs';
import { clearDraft, loadDraft, saveDraft } from '../ui/drafts';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;
const LINE = 'var(--line-listening)';

/* ── Pegar el fragmento ───────────────────────────────────────── */

export function SeriesHub() {
  const [raw, setRaw] = useState(IS_DEMO ? DEMO_SCENE : '');
  const [show, setShow] = useState('');
  const [busy, setBusy] = useState(false);
  const [past, setPast] = useState<(SeriesDoc & { id: string })[] | null>(null);
  useEffect(() => {
    listSeries().then(setPast);
  }, []);
  const text = cleanSubtitles(raw);
  const tooShort = text.length < MIN_CHARS;
  const tooLong = text.length > MAX_CHARS;

  const create = async () => {
    setBusy(true);
    try {
      const { id } = await makeLesson(text.slice(0, MAX_CHARS), show);
      navigate(`/practicar/series/leccion?id=${id}`);
    } catch (e) {
      toast(aiErrorMessage(e), 4500);
      setBusy(false);
    }
  };

  return (
    <>
      <Band back="/practicar" kicker="Practicar · Listening y vocabulario" title="Escenas de series" sub="Aprende con lo que ya ves" line={LINE} />
      <Page>
        {busy ? (
          <Spinner label="Theo está preparando la lección… (puede tardar medio minuto)" />
        ) : (
          <>
            <section class="card stack" style={g(10)}>
              <p class="small" style={{ margin: 0 }}>
                Pega un trozo de los subtítulos (en inglés) de un capítulo que <strong>ya hayas visto</strong>: unos minutos de diálogo. Theo te prepara vocabulario coloquial, la gramática que aparece, huecos por niveles,
                frases para reformular y preguntas. La app no descarga subtítulos: el texto lo pones tú.
              </p>
              <label class="field">
                <span>Serie y capítulo (opcional)</span>
                <input class="input" value={show} placeholder="p. ej. Fleabag 1x03" onInput={(e) => setShow((e.target as HTMLInputElement).value)} />
              </label>
              <label class="field">
                <span>Subtítulos</span>
                <textarea
                  class="input"
                  rows={10}
                  value={raw}
                  spellcheck={false}
                  placeholder={'Pega aquí. Vale con números y tiempos (formato .srt): se quitan solos.'}
                  onInput={(e) => setRaw((e.target as HTMLTextAreaElement).value)}
                />
                <small>
                  {text.length} caracteres
                  {tooShort ? ` · mínimo ${MIN_CHARS}` : tooLong ? ` · se usarán los primeros ${MAX_CHARS} (unos 3–4 minutos de diálogo)` : ' · perfecto'}
                </small>
              </label>
              <button class="btn signal" disabled={tooShort} onClick={create}>
                Crear la lección (gratis)
              </button>
            </section>
            {past && past.length > 0 && (
              <section class="stack" style={g(8)}>
                <span class="kicker">Tus escenas</span>
                <div class="list">
                  {past.map((p) => (
                    <ListItem
                      key={p.id}
                      dot={LINE}
                      title={p.lesson.title}
                      sub={`${p.show ? `${p.show} · ` : ''}${new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(p.createdAt)}${p.gapScore ? ` · huecos ${p.gapScore.ok}/${p.gapScore.total}` : ''}`}
                      to={`/practicar/series/leccion?id=${p.id}`}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </Page>
    </>
  );
}

/* ── La lección ───────────────────────────────────────────────── */

export function SeriesLeccion() {
  const id = route.value.query.get('id') ?? '';
  const [doc, setDoc] = useState<SeriesDoc | null | undefined>(undefined);
  useEffect(() => {
    getSeries(id)
      .then(setDoc)
      .catch(() => setDoc(null));
  }, [id]);
  if (doc === undefined) return <Spinner />;
  if (!doc) {
    return (
      <>
        <Band back="/practicar/series" kicker="Escenas de series" title="No encuentro la lección" line={LINE} />
        <Page>
          <button class="btn signal" onClick={() => navigate('/practicar/series', { replace: true })}>
            Volver
          </button>
        </Page>
      </>
    );
  }
  return <Leccion id={id} doc={doc} onChange={(p) => setDoc({ ...doc, ...p })} />;
}

function Leccion(props: { id: string; doc: SeriesDoc; onChange: (p: Partial<SeriesDoc>) => void }) {
  const { doc, id } = props;
  const L = doc.lesson;
  const [es, setEs] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());

  const awardOnce = () => {
    if (doc.xp) return;
    void recordActivity({ kind: 'series' });
    props.onChange({ xp: true });
    void patchSeries(id, { xp: true });
  };

  const addVocab = async (v: (typeof L.vocab)[number]) => {
    const n = await addCards([cardFor(v, doc.show)]).catch(() => 0);
    setAdded((cur) => new Set([...cur, v.term]));
    toast(n ? `«${v.term}» va a tu vocabulario` : `«${v.term}» ya estaba en tu vocabulario`);
  };

  return (
    <>
      <Band back="/practicar/series" kicker={`Escenas de series${doc.show ? ` · ${doc.show}` : ''}`} title={L.title} line={LINE} />
      <Page>
        <section class="card stack" style={g(8)}>
          <span class="kicker">De qué va</span>
          <p class="read" style={{ margin: 0 }}>
            {es ? L.summaryEs : L.summary}
          </p>
          <p class="small muted" style={{ margin: 0 }}>
            {L.register}
          </p>
          <button class="linkbtn" onClick={() => setEs(!es)}>
            {es ? 'En inglés' : 'En castellano'}
          </button>
        </section>

        <section class="stack" style={g(8)}>
          <span class="kicker">Vocabulario y expresiones</span>
          {L.vocab.map((v) => (
            <div key={v.term} class="card stack" style={g(4)}>
              <div class="spread">
                <strong>{v.term}</strong>
                <span class="pill">
                  {v.type} · {v.level}
                </span>
              </div>
              <span class="small">
                {v.meaning} <span class="muted">· {v.es}</span>
              </span>
              <span class="small read muted">«{v.quote}»</span>
              <button class="linkbtn" disabled={added.has(v.term)} onClick={() => addVocab(v)} style={{ alignSelf: 'flex-start' }}>
                {added.has(v.term) ? 'En tu vocabulario ✓' : 'No la sabía: a mi vocabulario'}
              </button>
            </div>
          ))}
        </section>

        {L.grammar.length > 0 && (
          <section class="card stack" style={g(8)}>
            <span class="kicker">Gramática que aparece</span>
            {L.grammar.map((x) => (
              <div key={x.point} class="stack" style={g(2)}>
                <strong class="small">{x.point}</strong>
                <span class="small read">«{x.quote}»</span>
                <span class="small muted">{x.es}</span>
              </div>
            ))}
          </section>
        )}

        <Huecos id={id} doc={doc} onChange={props.onChange} onDone={awardOnce} />
        <Respuestas id={id} doc={doc} onChange={props.onChange} onDone={awardOnce} />
      </Page>
    </>
  );
}

/* ── Huecos por niveles ───────────────────────────────────────── */

const LEVELS = [
  { value: '1', label: 'Fácil' },
  { value: '2', label: 'Medio' },
  { value: '3', label: 'Difícil' },
];

function Huecos(props: { id: string; doc: SeriesDoc; onChange: (p: Partial<SeriesDoc>) => void; onDone: () => void }) {
  const { doc } = props;
  const [level, setLevel] = useState(() => loadDraft<{ level: string }>(`series-gaps.${props.id}`)?.level ?? String(doc.gapScore?.level ?? 2));
  const dKey = `series-gaps.${props.id}`;
  const [given, setGiven] = useState<Record<number, string>>(() => loadDraft<{ level: string; given: Record<number, string> }>(dKey)?.given ?? {});
  const [result, setResult] = useState<ReturnType<typeof markGaps> | null>(null);
  const segs = useMemo(() => placeGaps(doc.text, doc.lesson.gaps, Number(level)), [doc.text, doc.lesson.gaps, level]);
  const nGaps = segs.filter((s) => s.t === 'gap').length;

  const changeLevel = (v: string) => {
    setLevel(v);
    setGiven({});
    setResult(null);
    clearDraft(dKey);
  };

  const check = async () => {
    const r = markGaps(segs, given);
    setResult(r);
    clearDraft(dKey);
    const gapScore = { level: Number(level), ok: r.ok, total: r.total };
    props.onChange({ gapScore });
    void patchSeries(props.id, { gapScore });
    props.onDone();
    // Lo que te falte va al vocabulario: la palabra de la escena con su frase.
    if (r.wrong.length) {
      const lines = doc.text.split('\n');
      const cards = r.wrong.map((w) => cardFor({ term: w.word, meaning: w.hint, quote: lines.find((l) => l.includes(w.word)) }, doc.show));
      const n = await addCards(cards).catch(() => 0);
      if (n) toast(`${n} ${n === 1 ? 'palabra que te ha faltado va' : 'palabras que te han faltado van'} a tu vocabulario`);
    }
  };

  return (
    <section class="card stack" style={g(10)}>
      <div class="spread">
        <span class="kicker">Huecos · {nGaps}</span>
      </div>
      <Segmented label="Nivel de los huecos" value={level} onChange={changeLevel} options={LEVELS} />
      <div class="scene read">
        {segs.map((s, k) =>
          s.t === 'text' ? (
            <span key={k}>{s.s}</span>
          ) : (
            <span key={k} class="scene-gap">
              <input
                class={`gapin${result ? (result.wrong.some((w) => w.word === s.word) ? ' bad' : ' ok') : ''}`}
                style={{ width: `${Math.max(4, s.word.length + 1)}ch` }}
                value={given[s.i] ?? ''}
                disabled={!!result}
                spellcheck={false}
                aria-label={`Hueco: ${s.hint}`}
                title={s.hint}
                {...({ autocorrect: 'off', autocapitalize: 'off' } as Record<string, string>)}
                onInput={(e) => {
                  const v = (e.target as HTMLInputElement).value;
                  setGiven((cur) => {
                    const next = { ...cur, [s.i]: v };
                    saveDraft(dKey, { level, given: next });
                    return next;
                  });
                }}
              />
              {level === '1' && !result && <sup class="muted">{s.word[0]}</sup>}
              {result && result.wrong.some((w) => w.word === s.word) && <span class="gapfix"> {s.word}</span>}
            </span>
          ),
        )}
      </div>
      <details class="small">
        <summary>Pistas</summary>
        <ol class="tight">
          {segs
            .filter((s): s is Extract<typeof s, { t: 'gap' }> => s.t === 'gap')
            .map((s) => (
              <li key={s.i}>{s.hint}</li>
            ))}
        </ol>
      </details>
      {result ? (
        <>
          <p class="small" style={{ margin: 0 }}>
            <strong>
              {result.ok}/{result.total}
            </strong>{' '}
            {result.ok === result.total ? '— perfecto. Prueba el nivel siguiente.' : '— en verde las buenas; las que fallas van a tu vocabulario.'}
          </p>
          <button class="btn quiet" onClick={() => changeLevel(level)}>
            Repetir
          </button>
        </>
      ) : (
        <button class="btn signal" onClick={check} disabled={!nGaps}>
          Comprobar huecos
        </button>
      )}
    </section>
  );
}

/* ── Reformular y preguntas (corrige Theo) ────────────────────── */

function Respuestas(props: { id: string; doc: SeriesDoc; onChange: (p: Partial<SeriesDoc>) => void; onDone: () => void }) {
  const L = props.doc.lesson;
  const aKey = `series-answers.${props.id}`;
  const [ans, setAns] = useState(() => props.doc.answers ?? loadDraft<{ rephrase: string[]; questions: string[] }>(aKey) ?? { rephrase: L.rephrase.map(() => ''), questions: L.questions.map(() => '') });
  const [busy, setBusy] = useState(false);
  const chk = props.doc.check;
  if (!L.rephrase.length && !L.questions.length) return null;

  const set = (k: 'rephrase' | 'questions', i: number, v: string) =>
    setAns((cur) => {
      const next = { ...cur, [k]: cur[k].map((x, j) => (j === i ? v : x)) };
      saveDraft(aKey, next);
      return next;
    });
  const submit = async () => {
    setBusy(true);
    try {
      const check = await checkAnswers(L, ans);
      props.onChange({ check, answers: ans });
      await patchSeries(props.id, { check, answers: ans });
      clearDraft(aKey);
      props.onDone();
    } catch (e) {
      toast(aiErrorMessage(e), 4500);
    } finally {
      setBusy(false);
    }
  };

  const verdict = (ok: boolean) => <span class={`pill ${ok ? 'ok' : ''}`}>{ok ? '✓' : '✗'}</span>;

  return (
    <section class="card stack" style={g(12)}>
      {L.rephrase.length > 0 && <span class="kicker">Dilo de otra forma</span>}
      {L.rephrase.map((x, i) => (
        <div key={`r${i}`} class="stack" style={g(4)}>
          <span class="small read">«{x.quote}»</span>
          <span class="small">
            <strong>{x.instruction}</strong>
          </span>
          <textarea class="input" rows={2} value={ans.rephrase[i]} disabled={!!chk} onInput={(e) => set('rephrase', i, (e.target as HTMLTextAreaElement).value)} />
          {chk?.rephrase[i] && (
            <div class="small stack" style={g(2)}>
              <span>
                {verdict(chk.rephrase[i].ok)} {chk.rephrase[i].comment}
              </span>
              {!chk.rephrase[i].ok && chk.rephrase[i].corrected && <span class="read">→ {chk.rephrase[i].corrected}</span>}
              <span class="muted">Modelo: {x.model.join(' / ')}</span>
            </div>
          )}
        </div>
      ))}
      {L.questions.length > 0 && <span class="kicker">Preguntas</span>}
      {L.questions.map((x, i) => (
        <div key={`q${i}`} class="stack" style={g(4)}>
          <span class="small">
            <strong>{x.q}</strong>
          </span>
          <textarea class="input" rows={2} value={ans.questions[i]} disabled={!!chk} onInput={(e) => set('questions', i, (e.target as HTMLTextAreaElement).value)} />
          {chk?.questions[i] && (
            <div class="small stack" style={g(2)}>
              <span>
                {verdict(chk.questions[i].ok)} {chk.questions[i].comment}
              </span>
              <span class="muted">Respuesta modelo: {x.answer}</span>
            </div>
          )}
        </div>
      ))}
      {chk ? (
        <ExplainEs message={[...chk.rephrase.map((r) => r.comment), ...chk.questions.map((q) => q.comment)].join('\n')} />
      ) : (
        <button class="btn signal" onClick={submit} disabled={busy || [...ans.rephrase, ...ans.questions].every((x) => !x.trim())}>
          {busy ? 'Theo está corrigiendo…' : 'Corregir (gratis)'}
        </button>
      )}
    </section>
  );
}
