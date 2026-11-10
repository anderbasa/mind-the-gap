// Un writing entregado: corregir (gratis o con Claude), nota con los 4 criterios,
// errores línea a línea, Upgrade to C1, cohesión, palabras repetidas, versión modelo y reescritura.
import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren, JSX } from 'preact';
import { navigate, route } from '../../router';
import { settings, store } from '../../state';
import { gradeFor } from '../../domain/skills';
import { Band, Page, Segmented, Spinner, toast } from '../../ui/components';
import { ExplainEs, Fold } from '../../ui/ExplainEs';
import { Rich } from '../../ui/rich';
import { analyse } from '../../writing/analysis';
import {
  adoptWord,
  clearCorrectionError,
  confirmPaidCorrection,
  correcting,
  EST_CLAUDE_CORRECTION_USD,
  startCorrection,
  type WritingDoc,
  type WritingVersion,
} from '../../writing/data';
import { CRITERIA, scaleLabel, type Feedback, type FeedbackCorrection } from '../../writing/schema';
import { getTask, TYPE_LABEL } from '../../writing/tasks';
import { TaskCard } from './WritingEditor';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;

const CATEGORY_ES: Record<FeedbackCorrection['category'], string> = {
  grammar: 'Gramática',
  vocabulary: 'Vocabulario',
  collocation: 'Collocation',
  preposition: 'Preposición',
  article: 'Artículo',
  tense: 'Tiempo verbal',
  'word order': 'Orden de palabras',
  register: 'Registro',
  spelling: 'Ortografía',
  punctuation: 'Puntuación',
  cohesion: 'Cohesión',
};

function modelLabel(v: WritingVersion): string {
  if (!v.model) return '';
  if (v.model.startsWith('claude')) return 'Corregido con Claude';
  return 'Corregido con Gemini (gratis)';
}

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

/* ── Texto con los errores marcados ─────────────────────────────── */

function findRanges(text: string, quotes: string[]): { start: number; end: number; n: number }[] {
  const lower = text.toLowerCase();
  const out: { start: number; end: number; n: number }[] = [];
  quotes.forEach((q, i) => {
    const needle = q.trim();
    if (needle.length < 2) return;
    let at = text.indexOf(needle);
    if (at < 0) at = lower.indexOf(needle.toLowerCase());
    if (at < 0) return;
    const end = at + needle.length;
    if (out.some((r) => at < r.end && end > r.start)) return; // se solapa con otro
    out.push({ start: at, end, n: i + 1 });
  });
  return out.sort((a, b) => a.start - b.start);
}

function MarkedText(props: { text: string; quotes: string[] }) {
  const ranges = findRanges(props.text, props.quotes);
  const parts: ComponentChildren[] = [];
  let last = 0;
  for (const r of ranges) {
    if (r.start > last) parts.push(props.text.slice(last, r.start));
    parts.push(
      <mark key={r.n} class="err">
        {props.text.slice(r.start, r.end)}
        <sup>{r.n}</sup>
      </mark>,
    );
    last = r.end;
  }
  parts.push(props.text.slice(last));
  return <div class="read writing-text">{parts}</div>;
}

/* ── Piezas de la corrección ─────────────────────────────────────── */

function CorrectionCard(props: { e: FeedbackCorrection; n: number }) {
  const { e } = props;
  return (
    <div class="card stack review bad" style={g(6)}>
      <div class="spread">
        <span class="qnum">{props.n}</span>
        <span class="pill">{CATEGORY_ES[e.category] ?? e.category}</span>
      </div>
      <span class="read">
        <s class="bad-text">{e.quote}</s>
      </span>
      <span class="read">
        → <strong class="ok-text">{e.correction}</strong>
      </span>
      <span class="small">{e.why}</span>
      <span class="small muted">
        Otro ejemplo: <em class="read">{e.example}</em>
      </span>
      <ExplainEs message={`Correction in the student's writing: "${e.quote}" → "${e.correction}". Why: ${e.why} Another example: ${e.example}`} />
    </div>
  );
}

function Chips(props: { items: string[]; context: string; writingId: string }) {
  const [adopted, setAdopted] = useState<Set<string>>(new Set());
  const adopt = async (term: string) => {
    if (adopted.has(term)) return;
    try {
      await adoptWord(term, props.context, props.writingId);
      setAdopted(new Set([...adopted, term]));
      toast(`«${term}» guardada en tu vocabulario`);
    } catch {
      toast('No se ha podido guardar.');
    }
  };
  return (
    <div class="chips">
      {props.items.map((t) => (
        <button key={t} class={`chip ${adopted.has(t) ? 'on' : ''}`} onClick={() => adopt(t)} aria-pressed={adopted.has(t)}>
          {t} {adopted.has(t) ? '✓' : '+'}
        </button>
      ))}
    </div>
  );
}

function ScoreCard(props: { v: WritingVersion; f: Feedback; n: number }) {
  const { v, f } = props;
  return (
    <section class="card stack" style={g(12)}>
      <div class="spread">
        <span class="kicker">Nota · versión {props.n}</span>
        <span class="small muted">{modelLabel(v)}</span>
      </div>
      <div class="row" style={{ ...g(14), alignItems: 'baseline' }}>
        <span class="bigscore tabular">
          {v.raw}
          <small>/20</small>
        </span>
        <span class="stack" style={g(0)}>
          <strong>Escala {scaleLabel(v.scale ?? 0)}</strong>
          <span class="small muted">{gradeFor(v.scale ?? 0)}</span>
        </span>
      </div>
      <div class="stack" style={g(10)}>
        {CRITERIA.map((c) => (
          <div key={c.key} class="stack" style={g(4)}>
            <div class="spread">
              <span style={{ fontWeight: 600 }}>{c.label}</span>
              <span class="tabular" style={{ fontWeight: 700 }}>
                {f.scores[c.key]}/5
              </span>
            </div>
            <div class="critbar">
              {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} class={i <= f.scores[c.key] ? 'on' : ''} />
              ))}
            </div>
            <span class="small muted">{c.es}</span>
          </div>
        ))}
      </div>
      <p class="muted small">
        La nota en la escala es orientativa: cada tarea es la mitad del paper y la conversión exacta se calibrará con las tablas oficiales en la Fase 7.
      </p>
    </section>
  );
}

function Compare(props: { a: WritingVersion; b: WritingVersion; na: number; nb: number }) {
  const { a, b } = props;
  if (a.raw == null || b.raw == null || !a.feedback || !b.feedback) return null;
  const d = b.raw - a.raw;
  return (
    <section class="card card-line stack" style={{ ...g(8), '--card-line': d >= 0 ? 'var(--ok)' : 'var(--bad)' } as JSX.CSSProperties}>
      <span class="kicker">
        Versión {props.na} → versión {props.nb}
      </span>
      <div class="spread">
        <span class="tabular">
          {a.raw}/20 ({scaleLabel(a.scale ?? 0)}) → <strong>{b.raw}/20</strong> ({scaleLabel(b.scale ?? 0)})
        </span>
        <span class={`pill ${d > 0 ? 'ok' : d < 0 ? 'bad' : ''}`}>{d > 0 ? `+${d}` : d}</span>
      </div>
      <div class="small">
        {CRITERIA.map((c) => {
          const x = b.feedback!.scores[c.key] - a.feedback!.scores[c.key];
          return (
            <span key={c.key} style={{ marginRight: '12px' }}>
              {c.label.split(' ')[0]} {x > 0 ? `+${x}` : x}
            </span>
          );
        })}
      </div>
    </section>
  );
}

function FeedbackView(props: { id: string; doc: WritingDoc; v: WritingVersion; f: Feedback; n: number; latest: boolean }) {
  const { id, doc, v, f, n } = props;
  const local = analyse(v.text);
  const allErrors = [...f.topErrors, ...f.otherErrors];
  const maxPara = Math.max(1, ...local.paragraphs);
  const ctx = `From your ${TYPE_LABEL[doc.type].toLowerCase()} “${doc.title}”`;

  return (
    <>
      <ScoreCard v={v} f={f} n={n} />

      <section class="card card-line stack" style={{ ...g(8), '--card-line': 'var(--signal)' } as JSX.CSSProperties}>
        <span class="kicker">Theo</span>
        <Rich text={f.summary} />
        <ExplainEs message={f.summary} />
      </section>

      <Fold title="Tu texto, con los errores marcados" sub={`${v.words} palabras · ${local.paragraphs.length} párrafos · los números son los de la lista`} open>
        <MarkedText text={v.text} quotes={allErrors.map((e) => e.quote)} />
      </Fold>

      {f.topErrors.length > 0 && (
        <section class="stack" style={g(8)}>
          <span class="kicker">Los {f.topErrors.length} errores que más te restan</span>
          {f.topErrors.map((e, i) => (
            <CorrectionCard key={i} e={e} n={i + 1} />
          ))}
        </section>
      )}

      <section class="card stack" style={g(8)}>
        <span class="kicker">Lo que haces bien</span>
        <ul class="tight">
          {f.strengths.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        {f.patterns.length > 0 && (
          <>
            <span class="kicker">Lo que hay detrás de tus errores</span>
            <ul class="tight">
              {f.patterns.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      {f.otherErrors.length > 0 && (
        <Fold title={`Otros errores (${f.otherErrors.length})`} sub="Línea a línea: lo que pusiste → la versión correcta → por qué → otro ejemplo">
          <div class="stack" style={g(8)}>
            {f.otherErrors.map((e, i) => (
              <CorrectionCard key={i} e={e} n={f.topErrors.length + i + 1} />
            ))}
          </div>
        </Fold>
      )}

      {f.upgrades.length > 0 && (
        <section class="stack" style={g(8)}>
          <span class="kicker">Upgrade to C1</span>
          {f.upgrades.map((u, i) => (
            <div key={i} class="card stack" style={g(6)}>
              <span class="read muted">{u.original}</span>
              <span class="read">
                → <strong>{u.c1}</strong>
              </span>
              <span class="small">{u.note}</span>
              <Chips items={[u.c1]} context={`C1 version of: “${u.original}”`} writingId={id} />
            </div>
          ))}
        </section>
      )}

      <section class="card stack" style={g(10)}>
        <span class="kicker">Estructura y conectores</span>
        <div class="stack" style={g(4)}>
          {local.paragraphs.map((w, i) => (
            <div key={i} class="parabar">
              <span class="small tabular">P{i + 1}</span>
              <span class="bar">
                <span style={{ width: `${(w / maxPara) * 100}%` }} />
              </span>
              <span class="small tabular">{w}</span>
            </div>
          ))}
        </div>
        {local.balance.map((b) => (
          <span key={b} class="small">
            ⚠ {b}
          </span>
        ))}
        <p class="small">{f.cohesion.comment}</p>
        {f.cohesion.jumps.length > 0 && (
          <>
            <span class="small" style={{ fontWeight: 700 }}>
              Saltos de idea
            </span>
            <ul class="tight small">
              {f.cohesion.jumps.map((j) => (
                <li key={j}>{j}</li>
              ))}
            </ul>
          </>
        )}
        {local.connectors.length > 0 && (
          <p class="small muted">Conectores que usas: {local.connectors.map((c) => `${c.connector} ×${c.count}`).join(', ')}</p>
        )}
        {f.cohesion.connectors.map((c) => (
          <div key={c.connector} class="stack" style={g(4)}>
            <span class="small">
              <strong>{c.connector}</strong>: {c.problem}
            </span>
            <Chips items={c.alternatives} context={`Instead of “${c.connector}”. ${ctx}`} writingId={id} />
          </div>
        ))}
      </section>

      {(f.repetition.length > 0 || local.repeated.length > 0) && (
        <section class="card stack" style={g(10)}>
          <span class="kicker">Palabras que repites</span>
          {local.repeated.length > 0 && (
            <div class="chips">
              {local.repeated.map((r) => (
                <span key={r.word} class="pill">
                  {r.word} ×{r.count}
                </span>
              ))}
            </div>
          )}
          {f.repetition.map((r) => (
            <div key={r.word} class="stack" style={g(4)}>
              <span class="small">
                En vez de <strong>{r.word}</strong>:
              </span>
              <Chips items={[...r.alternatives, ...r.collocations]} context={`Instead of “${r.word}”. ${ctx}`} writingId={id} />
            </div>
          ))}
          <p class="muted small">Toca las que quieras adoptar: pasan a tu vocabulario para repasarlas.</p>
        </section>
      )}

      <Fold title="Versión modelo C1" sub="Tus ideas, reescritas a nivel C1">
        <div class="read writing-text">{f.modelVersion}</div>
      </Fold>

      {props.latest && (
        <section class="card card-line stack" style={{ ...g(10), '--card-line': 'var(--line-writing)' } as JSX.CSSProperties}>
          <span class="kicker">Reescríbelo</span>
          {f.rewrite.map((r) => (
            <div key={r.original} class="stack" style={g(2)}>
              <span class="read">«{r.original}»</span>
              <span class="small muted">{r.hint}</span>
            </div>
          ))}
          <button class="btn" onClick={() => navigate(`/practicar/writing/escribir?rewrite=${id}`)}>
            Escribir la versión {n + 1}
          </button>
          <p class="muted small">Al corregirla verás cómo cambia la nota frente a esta versión.</p>
        </section>
      )}
    </>
  );
}

/* ── Pantalla ───────────────────────────────────────────────────── */

export function WritingView() {
  const id = route.value.query.get('id') ?? '';
  const [doc, setDoc] = useState<WritingDoc | null | undefined>(undefined);
  const [sel, setSel] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return setDoc(null);
    return store().watch<WritingDoc>(`writings/${id}`, (d) => setDoc(d), () => setDoc(null));
  }, [id]);

  if (doc === undefined) return <Spinner />;
  if (!doc) {
    return (
      <>
        <Band back="/practicar/writing" kicker="Writing" title="No encuentro ese writing" />
        <Page>
          <button class="btn" onClick={() => navigate('/practicar/writing', { replace: true })}>
            Volver al Writing
          </button>
        </Page>
      </>
    );
  }

  const task = getTask(doc.taskId);
  const lastIdx = doc.versions.length - 1;
  const idx = sel == null || sel > lastIdx ? lastIdx : sel;
  const v = doc.versions[idx];
  const job = correcting.value[id];
  const claude = settings.value.claudeEnabled;

  const free = () => {
    clearCorrectionError(id);
    startCorrection(id, false);
  };
  const paid = async () => {
    if (!(await confirmPaidCorrection())) return;
    clearCorrectionError(id);
    startCorrection(id, true);
  };

  return (
    <>
      <Band
        back="/practicar/writing"
        kicker={`Writing · Part ${doc.part} · ${TYPE_LABEL[doc.type]}`}
        title={doc.title}
        line="var(--line-writing)"
      />
      <Page>
        {doc.versions.length > 1 && (
          <Segmented
            label="Versión"
            value={String(idx)}
            onChange={(x) => setSel(Number(x))}
            options={doc.versions.map((_, i) => ({ value: String(i), label: `Versión ${i + 1}` }))}
          />
        )}
        {idx > 0 && <Compare a={doc.versions[idx - 1]} b={v} na={idx} nb={idx + 1} />}

        {!v.feedback && idx === lastIdx && (
          <section class="card card-line stack" style={{ ...g(10), '--card-line': 'var(--signal)' } as JSX.CSSProperties}>
            <span class="kicker">Corrección</span>
            {job && !job.error ? (
              <>
                <div class="row" style={g(10)}>
                  <div class="spinner" />
                  <span>
                    Theo está corrigiendo{job.paid ? ' (con Claude)' : ''}… <Elapsed since={job.startedAt} />
                  </span>
                </div>
                <p class="muted small">Suele tardar entre 1 y 3 minutos. Puedes salir de esta pantalla: te aviso cuando esté.</p>
              </>
            ) : (
              <>
                {job?.error && <div class="notice bad small">{job.error}</div>}
                <p class="small">
                  {v.words} palabras{v.source === 'photo' ? ' (transcritas de tu foto)' : ''}. Elige cómo corregirlo:
                </p>
                <button class="btn signal" onClick={free}>
                  Corregir gratis (Gemini)
                </button>
                {claude ? (
                  <>
                    <button class="btn ghost" onClick={paid}>
                      Corregir con Claude (≈ {EST_CLAUDE_CORRECTION_USD.toFixed(2).replace('.', ',')} $)
                    </button>
                    <p class="muted small">Claude es más fino corrigiendo. Antes de gastar nada te pide confirmación.</p>
                  </>
                ) : (
                  <p class="muted small">Claude está apagado (Ajustes → IA). Con Gemini la corrección no cuesta nada.</p>
                )}
              </>
            )}
          </section>
        )}

        {!v.feedback && (
          <Fold title="Tu texto" sub={`${v.words} palabras`} open>
            <div class="read writing-text">{v.text}</div>
          </Fold>
        )}

        {v.feedback && <FeedbackView id={id} doc={doc} v={v} f={v.feedback} n={idx + 1} latest={idx === lastIdx} />}

        {task && (
          <Fold title="El enunciado" sub={`Part ${task.part} · ${TYPE_LABEL[task.type]}`}>
            <TaskCard task={task} />
          </Fold>
        )}
      </Page>
    </>
  );
}
