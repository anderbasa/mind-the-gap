// Cuaderno de errores: patrones (al tercer error del mismo tipo), tus 5 top, práctica dirigida y tarjetas.
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { aiErrorMessage } from '../ai/client';
import { analysePatterns, getPatterns, KIND_ES, listErrors, practiceFor, topFive, type ErrorRow, type Pattern, type PatternsDoc, type PracticeItem } from '../errors/notebook';
import { diffWords } from '../listening/marking';
import { addCards } from '../srs/srs';
import { store } from '../state';
import { Band, Page, Spinner, toast } from '../ui/components';
import { Fold } from '../ui/ExplainEs';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;
const NO_AUTOCORRECT = { autocorrect: 'off', autocapitalize: 'sentences', autocomplete: 'off' } as Record<string, string>;

function Practice(props: { p: Pattern }) {
  const [items, setItems] = useState<PracticeItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const load = async () => {
    setBusy(true);
    try {
      setItems(await practiceFor(props.p));
    } catch (e) {
      toast(aiErrorMessage(e), 4000);
    } finally {
      setBusy(false);
    }
  };

  const check = (i: number, it: PracticeItem) => {
    const given = answers[i] ?? '';
    const ok = [it.right, ...it.accepted].some((a) => {
      const d = diffWords(a, given);
      return d.correct === d.total && d.ops.every((o) => o.kind === 'ok');
    });
    setChecked({ ...checked, [i]: ok });
    void store()
      .add('attempts', { kind: 'error-practice', pattern: props.p.name, ok, at: Date.now() })
      .catch(() => undefined);
  };

  const toCards = async () => {
    const list = [...props.p.examples.map((e) => ({ wrong: e.wrong, right: e.right, why: props.p.rule })), ...(items ?? []).map((x) => ({ wrong: x.wrong, right: x.right, why: x.why }))];
    const n = await addCards(
      list.map((x) => ({ type: 'fix' as const, term: props.p.name, front: x.wrong, answer: x.right, back: x.right, es: x.why, say: x.right, source: 'error' as const })),
    );
    toast(n ? `${n} tarjeta(s) nueva(s) en tu repaso` : 'Ya estaban en tu repaso');
  };

  return (
    <div class="stack" style={g(8)}>
      {!items && (busy ? <Spinner label="Preparando frases…" /> : <button class="btn quiet small" style={{ alignSelf: 'flex-start' }} onClick={load}>Practicar con 5 frases (gratis)</button>)}
      {items?.map((it, i) => (
        <div key={i} class="stack" style={g(4)}>
          <span class="read small">
            <strong>{i + 1}.</strong> {it.wrong}
          </span>
          <input class="input read" value={answers[i] ?? ''} placeholder="Escríbela bien" spellcheck={false} {...NO_AUTOCORRECT} onInput={(e) => setAnswers({ ...answers, [i]: (e.target as HTMLInputElement).value })} />
          {checked[i] === undefined ? (
            <button class="btn small" style={{ alignSelf: 'flex-start' }} disabled={!(answers[i] ?? '').trim()} onClick={() => check(i, it)}>
              Comprobar
            </button>
          ) : (
            <span class={`small ${checked[i] ? 'ok-text' : 'bad-text'}`}>
              {checked[i] ? '✓ Bien. ' : `✗ ${it.right}. `}
              <span class="muted">{it.why}</span>
            </span>
          )}
        </div>
      ))}
      <button class="linkbtn" onClick={toCards}>
        Crear tarjetas con este error
      </button>
    </div>
  );
}

export function Cuaderno() {
  const [errors, setErrors] = useState<ErrorRow[] | null>(null);
  const [doc, setDoc] = useState<PatternsDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    Promise.all([listErrors(), getPatterns()])
      .then(([e, d]) => {
        setErrors(e);
        setDoc(d);
      })
      .catch(() => setErrors([]));
  }, []);

  const analyse = async () => {
    if (!errors?.length) return;
    setBusy(true);
    try {
      setDoc(await analysePatterns(errors));
    } catch (e) {
      toast(aiErrorMessage(e), 5000);
    } finally {
      setBusy(false);
    }
  };

  const top = topFive(doc);
  const newSince = doc && errors ? Math.max(0, errors.length - doc.basedOn) : 0;
  const kinds = [...new Set((errors ?? []).map((e) => e.kind))];
  const shown = (errors ?? []).filter((e) => filter === 'all' || e.kind === filter).slice(0, 60);

  return (
    <>
      <Band back="/practicar" kicker="Practicar · Herramientas" title="Cuaderno de errores" sub="Tus errores, agrupados en patrones" line="var(--bad)" />
      <Page>
        {!errors && <Spinner />}
        {errors && errors.length === 0 && <p class="small">Aún no hay errores guardados. Se guardan solos al corregir ejercicios, writings y speakings.</p>}

        {errors && errors.length > 0 && (
          <section class="card stack" style={g(10)}>
            <div class="spread">
              <span class="kicker">Tus 5 errores top</span>
              <span class="small muted">{errors.length} errores guardados</span>
            </div>
            {!doc && <p class="small">Theo aún no ha agrupado tus errores. Tarda unos segundos y es gratis.</p>}
            {top.map((p, i) => (
              <div key={p.name} class="spread" style={{ alignItems: 'flex-start' }}>
                <span class="small">
                  <strong>
                    {i + 1}. {p.name}
                  </strong>
                  <br />
                  <span class="muted">{p.rule}</span>
                </span>
                <span class={`pill ${p.count >= 3 ? 'bad' : ''}`}>×{p.count}</span>
              </div>
            ))}
            {busy ? (
              <Spinner label="Theo está repasando tus errores…" />
            ) : (
              <button class="btn quiet small" style={{ alignSelf: 'flex-start' }} onClick={analyse}>
                {doc ? `Volver a analizar${newSince ? ` (${newSince} nuevos)` : ''}` : 'Agrupar mis errores'}
              </button>
            )}
          </section>
        )}

        {doc?.patterns.map((p) => (
          <Fold key={p.name} title={`${p.name} · ×${p.count}`} sub={p.count >= 3 ? 'Patrón: se repite 3 veces o más' : p.rule}>
            <div class="stack" style={g(8)}>
              <span class="small">{p.rule}</span>
              {p.examples.map((e, i) => (
                <span key={i} class="read small">
                  <s class="bad-text">{e.wrong}</s> → <strong class="ok-text">{e.right}</strong>
                </span>
              ))}
              <Practice p={p} />
            </div>
          </Fold>
        ))}

        {errors && errors.length > 0 && (
          <section class="stack" style={g(8)}>
            <span class="kicker">Todos tus errores</span>
            <div class="chips">
              {['all', ...kinds].map((k) => (
                <button key={k} class={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>
                  {k === 'all' ? 'Todos' : (KIND_ES[k] ?? k)}
                </button>
              ))}
            </div>
            <div class="list">
              {shown.map((e) => (
                <div key={e.id} class="list-item" style={{ cursor: 'default', alignItems: 'flex-start' }}>
                  <span class="grow">
                    <span class="list-sub" style={{ display: 'block' }}>
                      {KIND_ES[e.kind] ?? e.kind}
                      {e.category ? ` · ${e.category}` : e.focus ? ` · ${e.focus}` : ''}
                    </span>
                    <span class="read small">
                      {e.yourAnswer ? <s class="bad-text">{e.yourAnswer}</s> : <span class="muted">(en blanco)</span>} → <strong>{e.correct}</strong>
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </Page>
    </>
  );
}
