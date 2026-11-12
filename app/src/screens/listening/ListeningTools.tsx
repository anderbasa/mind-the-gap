// Dictados (tres velocidades, comparación palabra a palabra) e «inglés hablado real».
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { aiErrorMessage } from '../../ai/client';
import { loadConnected, loadDictation, renderOnDevice, unitAudio, type UnitAudio } from '../../listening/bank';
import { diffWords, type DiffOp } from '../../listening/marking';
import { connectedUnit, dictationUnit, type ConnectedT, type DictationT } from '../../listening/schema';
import type { UnitSpec } from '../../listening/ttsCore';
import { hasStore, store } from '../../state';
import { Band, Page, Spinner, toast } from '../../ui/components';
import { audioEl, stopAudio, unlockAudioEl } from './AudioPlayer';
import { recordActivity } from '../../progress/progress';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;
const NO_AUTOCORRECT = { autocorrect: 'off', autocapitalize: 'sentences', autocomplete: 'off' } as Record<string, string>;

/** Audio de una frase suelta: del banco o generado aquí. */
function useUnitAudio(unit: UnitSpec | null) {
  const [audio, setAudio] = useState<UnitAudio | null | undefined>(undefined);
  const [making, setMaking] = useState(false);
  useEffect(() => {
    setAudio(undefined);
    if (!unit) return;
    unitAudio(unit)
      .then(setAudio)
      .catch(() => setAudio(null));
  }, [unit?.id]);
  const make = async () => {
    if (!unit) return;
    setMaking(true);
    try {
      setAudio(await renderOnDevice(unit));
    } catch (e) {
      toast(aiErrorMessage(e), 5000);
    } finally {
      setMaking(false);
    }
  };
  return { audio, making, make };
}

async function playAt(a: UnitAudio, rate: number) {
  await unlockAudioEl();
  const el = audioEl();
  el.pause();
  if (el.src !== a.url) el.src = a.url;
  el.currentTime = 0;
  el.playbackRate = rate;
  await el.play().catch(() => toast('No se ha podido reproducir el audio.'));
}

function PlayButtons(props: { audio: UnitAudio | null | undefined; making: boolean; make: () => void; speeds: { label: string; rate: number }[] }) {
  if (props.audio === undefined) return <Spinner />;
  if (props.audio === null) {
    return props.making ? (
      <Spinner label="Generando la voz…" />
    ) : (
      <div class="stack" style={g(6)}>
        <span class="small muted">El audio aún no está en el banco.</span>
        <button class="btn quiet small" onClick={props.make} style={{ alignSelf: 'flex-start' }}>
          Generarlo aquí (gratis)
        </button>
      </div>
    );
  }
  const a = props.audio;
  return (
    <div class="row" style={{ ...g(8), flexWrap: 'wrap' }}>
      {props.speeds.map((s) => (
        <button key={s.label} class="btn small" onClick={() => playAt(a, s.rate)}>
          ▶ {s.label}
        </button>
      ))}
    </div>
  );
}

function Diff(props: { ops: DiffOp[] }) {
  return (
    <p class="read diff">
      {props.ops.map((o, i) =>
        o.kind === 'ok' ? (
          <span key={i}>{o.word} </span>
        ) : o.kind === 'missing' ? (
          <span key={i} class="d-miss" title="Te falta">
            {o.word}{' '}
          </span>
        ) : o.kind === 'extra' ? (
          <s key={i} class="d-extra" title="Sobra">
            {o.word}{' '}
          </s>
        ) : o.kind === 'wrong' ? (
          <span key={i}>
            <s class="d-extra">{o.given}</s> <span class="d-fix">{o.word}</span>{' '}
          </span>
        ) : null,
      )}
    </p>
  );
}

/* ── Dictados ───────────────────────────────────────────────────── */

const DONE_KEY = 'mtg.dictation.done';
const SPEEDS = [
  { label: 'Lento', rate: 0.8 },
  { label: 'Normal', rate: 1 },
  { label: 'Rápido', rate: 1.15 },
];

function readDone(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DONE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function Dictados() {
  const [items, setItems] = useState<DictationT[] | null>(null);
  const [level, setLevel] = useState<0 | 1 | 2 | 3>(0);
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState('');
  const [result, setResult] = useState<ReturnType<typeof diffWords> | null>(null);
  const [done, setDone] = useState<string[]>(readDone());

  useEffect(() => {
    loadDictation().then((d) => {
      setItems(d);
      const first = d.findIndex((x) => !readDone().includes(x.id));
      setIdx(first < 0 ? 0 : first);
    });
    return () => stopAudio();
  }, []);

  const pool = (items ?? []).filter((x) => !level || x.level === level);
  const cur = pool[idx % Math.max(1, pool.length)] ?? null;
  const unit = cur ? dictationUnit(cur) : null;
  const { audio, making, make } = useUnitAudio(unit);

  const check = () => {
    if (!cur || !text.trim()) return;
    const r = diffWords(cur.text, text);
    setResult(r);
    const d = [...new Set([...done, cur.id])];
    setDone(d);
    try {
      localStorage.setItem(DONE_KEY, JSON.stringify(d));
    } catch {
      /* nada */
    }
    void recordActivity({ kind: 'dictation' });
    if (hasStore()) void store().add('attempts', { kind: 'dictation', itemId: cur.id, correct: r.correct, total: r.total, at: Date.now() }).catch(() => undefined);
  };

  const next = () => {
    stopAudio();
    setText('');
    setResult(null);
    const n = pool.findIndex((x, i) => i > idx % pool.length && !done.includes(x.id));
    setIdx(n >= 0 ? n : (idx + 1) % Math.max(1, pool.length));
  };

  return (
    <>
      <Band back="/practicar/listening" kicker="Listening · Entrenar el oído" title="Dictados" sub="Escucha, escribe y compara palabra a palabra" line="var(--line-listening)" />
      <Page>
        <div class="chips" role="group" aria-label="Nivel">
          {([0, 1, 2, 3] as const).map((l) => (
            <button
              key={l}
              class={`chip ${level === l ? 'on' : ''}`}
              aria-pressed={level === l}
              onClick={() => {
                setLevel(l);
                setIdx(0);
                setText('');
                setResult(null);
              }}
            >
              {l === 0 ? 'Todos' : `Nivel ${l}`}
            </button>
          ))}
        </div>
        {!items && <Spinner />}
        {cur && (
          <section class="card stack" style={g(12)}>
            <div class="spread">
              <span class="kicker">
                Frase {(idx % pool.length) + 1} de {pool.length}
              </span>
              <span class="pill">
                {cur.speaker.accent} · nivel {cur.level}
              </span>
            </div>
            <PlayButtons audio={audio} making={making} make={make} speeds={SPEEDS} />
            <label class="field">
              <span>Lo que oyes</span>
              <textarea
                class="textarea read"
                rows={3}
                value={text}
                disabled={!!result}
                spellcheck={false}
                {...NO_AUTOCORRECT}
                onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
              />
            </label>
            {!result ? (
              <button class="btn signal" onClick={check} disabled={!text.trim()}>
                Comprobar
              </button>
            ) : (
              <>
                <div class={`notice ${result.correct === result.total ? 'ok' : 'info'} small`}>
                  <span>
                    {result.correct} de {result.total} palabras bien.{' '}
                    {result.correct === result.total ? '¡Perfecto!' : 'En rojo, lo que te falta; tachado, lo que sobra o está mal escrito.'}
                  </span>
                </div>
                <Diff ops={result.ops} />
                <p class="read muted">{cur.text}</p>
                <button class="btn" onClick={next}>
                  Siguiente frase
                </button>
              </>
            )}
            <p class="muted small">Puedes escucharla las veces que quieras. «Lento» y «Rápido» cambian la velocidad sin cambiar el tono de voz.</p>
          </section>
        )}
        <p class="muted small">
          Hechas {done.length} de {items?.length ?? 0}. Las contracciones (I'd / I would) y los números (12 / twelve) cuentan como iguales; la ortografía, no.
        </p>
      </Page>
    </>
  );
}

/* ── Inglés hablado real ───────────────────────────────────────── */

const KIND_ES: Record<ConnectedT['kind'], string> = {
  informal: 'Reducciones informales',
  contraction: 'Contracciones',
  weak: 'Formas débiles',
  linking: 'Palabras que se unen',
  elision: 'Sonidos que desaparecen',
  assimilation: 'Sonidos que se funden',
};

function ConnectedCard(props: { c: ConnectedT }) {
  const { c } = props;
  const unit = connectedUnit(c);
  const { audio, making, make } = useUnitAudio(unit);
  const [show, setShow] = useState(false);
  const [text, setText] = useState('');
  const [res, setRes] = useState<ReturnType<typeof diffWords> | null>(null);
  return (
    <section class="card stack" style={g(8)}>
      <strong>{c.title}</strong>
      <span class="small">{c.es}</span>
      <PlayButtons
        audio={audio}
        making={making}
        make={make}
        speeds={[
          { label: 'Escuchar', rate: 1 },
          { label: 'Más despacio', rate: 0.75 },
        ]}
      />
      <label class="field">
        <span>Escríbela completa, sin reducir (como se escribiría bien)</span>
        <input class="input read" value={text} spellcheck={false} {...NO_AUTOCORRECT} onInput={(e) => setText((e.target as HTMLInputElement).value)} />
      </label>
      <div class="row" style={{ ...g(8), flexWrap: 'wrap' }}>
        <button class="btn small" disabled={!text.trim()} onClick={() => setRes(diffWords(c.full, text))}>
          Comprobar
        </button>
        <button class="linkbtn" onClick={() => setShow(!show)}>
          {show ? 'Ocultar la frase' : 'Ver la frase'}
        </button>
      </div>
      {res && <Diff ops={res.ops} />}
      {show && (
        <div class="stack" style={g(2)}>
          <span class="small muted">Se oye: «{c.spoken}»</span>
          <span class="read">{c.full}</span>
        </div>
      )}
    </section>
  );
}

export function HablaReal() {
  const [items, setItems] = useState<ConnectedT[] | null>(null);
  useEffect(() => {
    loadConnected().then(setItems);
    return () => stopAudio();
  }, []);
  const kinds = [...new Set((items ?? []).map((x) => x.kind))];
  return (
    <>
      <Band back="/practicar/listening" kicker="Listening · Entrenar el oído" title="Inglés hablado real" sub="Lo que hace difícil entender a velocidad nativa" line="var(--line-listening)" />
      <Page>
        <p class="small">
          A velocidad normal los nativos no pronuncian cada palabra entera: las reducen, las unen o se comen sonidos. Si conoces estos fenómenos, los reconoces. Escucha
          cada frase, intenta escribirla completa y compara.
        </p>
        {!items && <Spinner />}
        {kinds.map((k) => (
          <section key={k} class="stack" style={g(8)}>
            <span class="kicker">{KIND_ES[k]}</span>
            {items!
              .filter((x) => x.kind === k)
              .map((c) => (
                <ConnectedCard key={c.id} c={c} />
              ))}
          </section>
        ))}
      </Page>
    </>
  );
}
