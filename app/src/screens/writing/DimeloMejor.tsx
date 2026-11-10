// «Dímelo mejor»: pegas una frase tuya y te la devuelve corregida y en tres registros.
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { aiErrorMessage } from '../../ai/client';
import { Band, Page, Spinner, toast } from '../../ui/components';
import { ExplainEs } from '../../ui/ExplainEs';
import { recentSayBetter, sayItBetter, type SayBetter, type SayBetterRow } from '../../writing/sayBetter';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;
const REGISTER_ES = { formal: 'formal', neutral: 'neutro', informal: 'informal' } as const;

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copiada');
  } catch {
    toast('No se ha podido copiar: mantén pulsado el texto para copiarlo.');
  }
}

function Version(props: { label: string; text: string; note: string }) {
  return (
    <div class="card stack" style={g(6)}>
      <div class="spread">
        <span class="kicker">{props.label}</span>
        <button class="linkbtn" onClick={() => copy(props.text)}>
          Copiar
        </button>
      </div>
      <span class="read">{props.text}</span>
      <span class="small muted">{props.note}</span>
    </div>
  );
}

function Result(props: { r: SayBetter }) {
  const { r } = props;
  return (
    <>
      <section class={`card stack review ${r.hadErrors ? 'partial' : 'ok'}`} style={g(8)}>
        <div class="spread">
          <span class="kicker">{r.hadErrors ? 'Corregida' : 'Sin errores'}</span>
          <span class="pill">Tu registro: {REGISTER_ES[r.register]}</span>
        </div>
        <span class="read">{r.corrected}</span>
        {r.errors.map((e, i) => (
          <div key={i} class="stack" style={g(2)}>
            <span class="small">
              <s class="bad-text">{e.quote}</s> → <strong class="ok-text">{e.correction}</strong>
            </span>
            <span class="small muted">{e.why}</span>
          </div>
        ))}
        {r.errors.length > 0 && <ExplainEs message={r.errors.map((e) => `"${e.quote}" → "${e.correction}": ${e.why}`).join('\n')} />}
      </section>
      <Version label="Neutra" text={r.neutral} note="Vale para casi todo." />
      <Version label="Más formal" text={r.formal} note="Para un profesor, un email oficial o un trabajo." />
      <Version label="Más natural" text={r.natural} note="Como lo diría alguien de tu edad con un nativo." />
      <section class="card card-line stack" style={{ ...g(6), '--card-line': 'var(--signal)' } as JSX.CSSProperties}>
        <span class="kicker">Consejo de Theo</span>
        <span class="small">{r.tip}</span>
        <ExplainEs message={r.tip} />
      </section>
    </>
  );
}

export function DimeloMejor() {
  const [text, setText] = useState('');
  const [context, setContext] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SayBetter | null>(null);
  const [recent, setRecent] = useState<SayBetterRow[]>([]);

  const loadRecent = () =>
    recentSayBetter()
      .then(setRecent)
      .catch(() => undefined);
  useEffect(() => {
    void loadRecent();
  }, []);

  const go = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      setResult(await sayItBetter(text, context));
      void loadRecent();
    } catch (e) {
      toast(aiErrorMessage(e), 4500);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Band back="/practicar" kicker="Practicar · Herramientas" title="Dímelo mejor" sub="Pega una frase tuya y te la digo mejor" line="var(--line-grammar)" />
      <Page>
        <label class="field">
          <span>Tu frase o tu texto (en inglés)</span>
          <textarea
            class="textarea read"
            rows={4}
            value={text}
            placeholder="Dear teacher, I write you because I can't assist to the class of tomorrow…"
            spellcheck={false}
            onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
          />
        </label>
        <label class="field">
          <span>¿Para quién es? (opcional)</span>
          <input class="input" value={context} placeholder="Un profesor, un amigo, un trabajo de clase…" onInput={(e) => setContext((e.target as HTMLInputElement).value)} />
        </label>
        <button class="btn signal" onClick={go} disabled={busy || !text.trim()}>
          Dímelo mejor
        </button>
        <p class="muted small">
          Gratis (Gemini). No pegues datos personales de otras personas: con la capa gratuita, Google puede usar el texto para mejorar sus modelos.
        </p>

        {busy && <Spinner label="Theo está pensando…" />}
        {result && <Result r={result} />}

        {recent.length > 0 && (
          <section class="stack" style={g(8)}>
            <span class="kicker">Tus últimas frases</span>
            <div class="list">
              {recent.map((r) => (
                <button
                  key={r.id}
                  class="list-item"
                  onClick={() => {
                    setText(r.text);
                    setContext(r.context);
                    setResult(r.result);
                    window.scrollTo(0, 0);
                  }}
                >
                  <span class="grow">
                    <span class="list-title read" style={{ display: 'block', fontWeight: 400 }}>
                      {r.text.length > 90 ? `${r.text.slice(0, 90)}…` : r.text}
                    </span>
                    {r.context && <span class="list-sub">{r.context}</span>}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </Page>
    </>
  );
}
