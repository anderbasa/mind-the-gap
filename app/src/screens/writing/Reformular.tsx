// Reformular: una frase + una instrucción; escribes hasta 3 versiones y cada una se corrige al momento.
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { aiErrorMessage } from '../../ai/client';
import { store } from '../../state';
import { Band, Page, Spinner, toast } from '../../ui/components';
import { ExplainEs } from '../../ui/ExplainEs';
import { checkVersion, generateItems, loadGenerated, REPHRASE_BANK, TOPIC_IDS, TOPICS, type Check, type RephraseItem, type Topic } from '../../writing/rephrase';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;
const DONE_KEY = 'mtg.rephrase.done';
const TOPIC_KEY = 'mtg.rephrase.topic';
const NO_AUTOCORRECT = { autocorrect: 'off', autocapitalize: 'sentences', autocomplete: 'off' } as Record<string, string>;

function readDone(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DONE_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function saveDone(s: Set<string>) {
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify([...s]));
  } catch {
    /* nada */
  }
}

function readTopic(): Topic | 'all' {
  try {
    const t = localStorage.getItem(TOPIC_KEY);
    return t && t in TOPICS ? (t as Topic) : 'all';
  } catch {
    return 'all';
  }
}

interface Version {
  text: string;
  check?: Check;
  busy?: boolean;
}

const VERDICT: Record<Check['verdict'], { label: string; cls: string }> = {
  perfect: { label: 'Perfecta', cls: 'ok' },
  minor: { label: 'Casi', cls: 'warn' },
  wrong: { label: 'Todavía no', cls: 'bad' },
};

function pickNext(pool: RephraseItem[], done: Set<string>, skip?: string): RephraseItem | null {
  const fresh = pool.filter((x) => !done.has(x.id) && x.id !== skip);
  if (fresh.length) return fresh[0];
  const rest = pool.filter((x) => x.id !== skip);
  return rest.length ? rest[Math.floor(Math.random() * rest.length)] : (pool[0] ?? null);
}

export function Reformular() {
  const [topic, setTopicState] = useState<Topic | 'all'>(readTopic());
  const [extra, setExtra] = useState<RephraseItem[]>([]);
  const [done, setDone] = useState<Set<string>>(readDone());
  const [item, setItem] = useState<RephraseItem | null>(null);
  const [versions, setVersions] = useState<Version[]>([{ text: '' }]);
  const [models, setModels] = useState(false);
  const [generating, setGenerating] = useState(false);

  const pool = [...REPHRASE_BANK, ...extra].filter((x) => topic === 'all' || x.topic === topic);

  useEffect(() => {
    loadGenerated()
      .then(setExtra)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!item || (topic !== 'all' && item.topic !== topic)) start(pickNext(pool, done));
  }, [topic, extra.length]);

  const start = (it: RephraseItem | null) => {
    setItem(it);
    setVersions([{ text: '' }]);
    setModels(false);
    window.scrollTo(0, 0);
  };

  const setTopic = (t: Topic | 'all') => {
    setTopicState(t);
    try {
      localStorage.setItem(TOPIC_KEY, t);
    } catch {
      /* nada */
    }
  };

  const update = (i: number, patch: Partial<Version>) => setVersions((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)));

  const check = async (i: number) => {
    if (!item) return;
    const text = versions[i].text.trim();
    if (!text) return;
    update(i, { busy: true, check: undefined });
    try {
      const others = versions.filter((_, j) => j !== i).map((v) => v.text.trim()).filter(Boolean);
      const c = await checkVersion(item, text, others);
      update(i, { busy: false, check: c });
      if (c.verdict !== 'perfect') {
        void store()
          .add('errors', {
            kind: 'rephrase',
            category: TOPICS[item.topic],
            itemId: item.id,
            yourAnswer: text,
            correct: c.corrected,
            explanation: c.comment,
            at: Date.now(),
          })
          .catch(() => undefined);
      }
    } catch (e) {
      update(i, { busy: false });
      toast(aiErrorMessage(e), 4000);
    }
  };

  const next = () => {
    if (!item) return;
    const checked = versions.filter((v) => v.check);
    let d = done;
    if (checked.length) {
      d = new Set(done);
      d.add(item.id);
      setDone(d);
      saveDone(d);
      void store()
        .add('attempts', {
          kind: 'rephrase',
          itemId: item.id,
          topic: item.topic,
          verdicts: checked.map((v) => v.check!.verdict),
          at: Date.now(),
        })
        .catch(() => undefined);
    }
    start(pickNext(pool, d, item.id));
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const items = await generateItems(topic === 'all' ? null : topic, [...REPHRASE_BANK, ...extra]);
      setExtra((x) => [...x, ...items]);
      toast(`${items.length} frases nuevas`);
    } catch (e) {
      toast(aiErrorMessage(e), 5000);
    } finally {
      setGenerating(false);
    }
  };

  const doneInPool = pool.filter((x) => done.has(x.id)).length;
  const last = versions[versions.length - 1];

  return (
    <>
      <Band back="/practicar" kicker="Practicar · Herramientas" title="Reformular" sub="La misma idea, hasta de 3 formas distintas" line="var(--line-grammar)" />
      <Page>
        <div class="chips" role="group" aria-label="Tema">
          <button class={`chip ${topic === 'all' ? 'on' : ''}`} aria-pressed={topic === 'all'} onClick={() => setTopic('all')}>
            Todos
          </button>
          {TOPIC_IDS.map((t) => (
            <button key={t} class={`chip ${topic === t ? 'on' : ''}`} aria-pressed={topic === t} onClick={() => setTopic(t)}>
              {TOPICS[t]}
            </button>
          ))}
        </div>

        {!item && <Spinner />}
        {item && (
          <section class="card stack" style={g(12)}>
            <div class="spread">
              <span class="pill">{TOPICS[item.topic]}</span>
              {item.source === 'ai' && <span class="small muted">Generada por IA</span>}
            </div>
            <p class="read" style={{ fontSize: '20px' }}>
              {item.sentence}
            </p>
            <p style={{ fontWeight: 700 }}>{item.instruction}</p>

            {versions.map((v, i) => (
              <div key={i} class="stack" style={g(6)}>
                <label class="field">
                  <span>Versión {i + 1}</span>
                  <textarea
                    class="textarea read"
                    rows={2}
                    style={{ minHeight: '64px' }}
                    value={v.text}
                    spellcheck={false}
                    {...NO_AUTOCORRECT}
                    onInput={(e) => update(i, { text: (e.target as HTMLTextAreaElement).value, check: undefined })}
                  />
                </label>
                {v.busy ? (
                  <Spinner label="Comprobando…" />
                ) : (
                  !v.check && (
                    <button class="btn small" onClick={() => check(i)} disabled={!v.text.trim()} style={{ alignSelf: 'flex-start' }}>
                      Comprobar
                    </button>
                  )
                )}
                {v.check && (
                  <div class={`card flat stack review ${VERDICT[v.check.verdict].cls === 'ok' ? 'ok' : VERDICT[v.check.verdict].cls === 'warn' ? 'partial' : 'bad'}`} style={g(6)}>
                    <span class={`pill ${VERDICT[v.check.verdict].cls}`} style={{ alignSelf: 'flex-start' }}>
                      {VERDICT[v.check.verdict].label}
                    </span>
                    <span class="small">{v.check.comment}</span>
                    {v.check.verdict !== 'perfect' && v.check.corrected.trim() !== v.text.trim() && (
                      <span class="read">
                        → <strong class="ok-text">{v.check.corrected}</strong>
                      </span>
                    )}
                    {!v.check.differentFromOthers && <span class="small muted">Es casi igual que otra de tus versiones: prueba con otra estructura.</span>}
                    <ExplainEs message={`Rephrasing exercise. Original: "${item.sentence}" Instruction: ${item.instruction} Student wrote: "${v.text}". Teacher's comment: ${v.check.comment} Corrected: "${v.check.corrected}"`} />
                  </div>
                )}
              </div>
            ))}

            <div class="row" style={{ ...g(8), flexWrap: 'wrap' }}>
              {versions.length < 3 && last.check && (
                <button class="btn quiet small" onClick={() => setVersions([...versions, { text: '' }])}>
                  Otra forma
                </button>
              )}
              <button class="btn ghost small" onClick={() => setModels(!models)}>
                {models ? 'Ocultar modelos' : 'Ver respuestas modelo'}
              </button>
            </div>
            {models && (
              <div class="stack" style={g(4)}>
                {item.models.map((m) => (
                  <span key={m} class="read">
                    · {m}
                  </span>
                ))}
                <span class="small muted">No son las únicas correctas.</span>
              </div>
            )}
            <button class="btn signal" onClick={next}>
              Siguiente frase
            </button>
          </section>
        )}

        <section class="card flat stack" style={g(8)}>
          <span class="small">
            {doneInPool} de {pool.length} hechas{topic === 'all' ? '' : ` en «${TOPICS[topic]}»`}.
          </span>
          {generating ? (
            <Spinner label="Escribiendo frases nuevas…" />
          ) : (
            <button class="btn quiet small" onClick={generate} style={{ alignSelf: 'flex-start' }}>
              Generar 5 frases más (gratis)
            </button>
          )}
          <p class="muted small">Las genera Gemini solo cuando pulsas, nunca con saldo de pago. Cada versión se corrige con la cuota gratuita.</p>
        </section>
      </Page>
    </>
  );
}
