// Corrección de un ejercicio: nota, y por cada pregunta tu respuesta, la buena, el porqué,
// «Explícamelo en castellano» y «Reportar pregunta».
import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { aiErrorMessage, runAI } from '../../ai/client';
import { fill, getPrompt } from '../../ai/prompts';
import { reportSet } from '../../rue/bank';
import { examNumber, normalize, type SetResult } from '../../rue/marking';
import { PARTS, type RueSet } from '../../rue/schema';
import { toast } from '../../ui/components';
import { Rich } from '../../ui/rich';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;

function itemExtra(set: RueSet, n: number): { explanation: string; evidence?: string; accepted?: string[]; label?: string } {
  const it = set.items.find((x) => x.n === n)! as RueSet['items'][number] & Record<string, unknown>;
  const out: { explanation: string; evidence?: string; accepted?: string[]; label?: string } = { explanation: String(it.explanation) };
  if (set.part === 'p5') out.evidence = String(it.evidence);
  if (set.part === 'p2' || set.part === 'p3' || set.part === 'p4') out.accepted = it.answers as string[];
  if (set.part === 'p1' || set.part === 'p5') out.label = (it.options as Record<string, string>)[String(it.answer)];
  return out;
}

const REASONS = ['La respuesta correcta está mal', 'Hay más de una respuesta posible', 'El texto o la pregunta no se entiende', 'Otro problema'];

function ItemReview(props: { set: RueSet; r: SetResult['items'][number]; aiReason?: string }) {
  const { set, r } = props;
  const extra = itemExtra(set, r.n);
  const [es, setEs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const full = r.marks === r.max;
  const partial = r.marks > 0 && !full;

  const explain = async () => {
    if (es) return setEs(null);
    setBusy(true);
    try {
      const msg = `Question ${examNumber(set.part, r.n)} (${PARTS[set.part].name}). Correct answer: ${r.expected}${extra.label ? ` (${extra.label})` : ''}. Student's answer: ${r.given || '(blank)'}. Explanation: ${extra.explanation}`;
      const out = await runAI({ task: 'explain-es', messages: [{ role: 'user', parts: [{ text: fill(getPrompt('explain-es').body, { message: msg }) }] }], maxTokens: 600, cache: true });
      setEs(out.text.trim());
    } catch (e) {
      toast(aiErrorMessage(e), 4000);
    } finally {
      setBusy(false);
    }
  };

  const report = async (reason: string) => {
    try {
      await reportSet(set, reason, r.n);
      toast('Reportada. Este ejercicio sale de la rotación.');
    } catch {
      toast('No se ha podido reportar.');
    }
    setReporting(false);
  };

  return (
    <div class={`card stack review ${full ? 'ok' : partial ? 'partial' : 'bad'}`} style={g(8)}>
      <div class="spread">
        <span class="qnum">{examNumber(set.part, r.n)}</span>
        <span class={`pill ${full ? 'ok' : partial ? 'warn' : 'bad'}`}>
          {r.marks}/{r.max}
        </span>
      </div>
      <div class="small">
        Tu respuesta: <strong class={full ? 'ok-text' : 'bad-text'}>{r.given || '—'}</strong>
        {!full && (
          <>
            {' · '}Correcta: <strong>{r.expected}</strong>
            {extra.label && <span class="muted"> ({extra.label})</span>}
          </>
        )}
      </div>
      {(() => {
        const others = (extra.accepted ?? []).filter((a) => normalize(a) !== normalize(r.given) && a !== r.expected);
        return others.length > 0 && <div class="muted small">También vale: {others.join(' · ')}</div>;
      })()}
      {(r.reason || props.aiReason) && <div class="muted small">{props.aiReason ?? r.reason}</div>}
      {extra.evidence && <blockquote class="evidence">«{extra.evidence}»</blockquote>}
      <Rich text={extra.explanation} />
      {es && (
        <div class="notice info">
          <Rich text={es} />
        </div>
      )}
      <div class="row wrap" style={g(14)}>
        <button class="linkbtn" onClick={explain} disabled={busy}>
          {busy ? 'Traduciendo…' : es ? 'Ocultar castellano' : 'Explícamelo en castellano'}
        </button>
        <button class="linkbtn" onClick={() => setReporting(!reporting)}>
          Reportar pregunta
        </button>
      </div>
      {reporting && (
        <div class="stack" style={g(6)}>
          {REASONS.map((x) => (
            <button key={x} class="btn quiet small" style={{ justifyContent: 'flex-start' }} onClick={() => report(x)}>
              {x}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Results(props: {
  set: RueSet;
  result: SetResult;
  aiReasons: Record<number, string>;
  reviewFailed: number;
  exam: boolean;
  elapsedMs: number;
  onNext: () => void;
  onBack: () => void;
}) {
  const { set, result } = props;
  const info = PARTS[set.part];
  const pct = result.max ? Math.round((result.marks / result.max) * 100) : 0;
  const mins = Math.floor(props.elapsedMs / 60000);
  const secs = Math.round((props.elapsedMs % 60000) / 1000);
  return (
    <div class="stack" style={g(14)}>
      <section class="card stack" style={g(8)}>
        <span class="kicker">{props.exam ? 'Modo examen' : 'Modo práctica'}</span>
        <div class="spread">
          <h2 class="tabular">
            {result.marks}/{result.max}
          </h2>
          <span class={`pill ${pct >= 75 ? 'ok' : pct >= 55 ? 'warn' : 'bad'}`}>{pct} %</span>
        </div>
        <p class="muted small">
          {info.skill === 'reading' ? 'En el examen, esta parte cuenta para la nota de Reading (50 puntos en total).' : 'En el examen, esta parte cuenta para la nota de Use of English (28 puntos en total).'}{' '}
          Tiempo: {mins} min {secs} s (orientativo: {info.minutes} min).
        </p>
        <p class="muted small">La conversión a la escala Cambridge se hace con papers completos (Fase 7); una parte suelta no da para estimarla con honestidad.</p>
        {props.reviewFailed > 0 && (
          <div class="notice">No se han podido revisar con IA {props.reviewFailed} respuesta(s) fuera de la clave: cuentan como incorrectas hasta que se pueda.</div>
        )}
      </section>
      {result.items.map((r) => (
        <ItemReview key={r.n} set={set} r={r} aiReason={props.aiReasons[r.n]} />
      ))}
      <div class="row">
        <button class="btn ghost" onClick={props.onBack}>
          Volver
        </button>
        <button class="btn signal" style={{ flex: 1 }} onClick={props.onNext}>
          Otro de esta parte
        </button>
      </div>
    </div>
  );
}
