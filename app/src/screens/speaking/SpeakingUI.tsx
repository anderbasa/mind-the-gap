// Piezas comunes del Speaking: grabar con cuenta atrás, elegir cómo evaluar y mostrar el feedback.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { aiErrorMessage } from '../../ai/client';
import { gradeFor } from '../../domain/skills';
import { settings } from '../../state';
import { beep } from '../../voice/audio';
import { listRecordings } from '../../voice/idb';
import { micErrorMessage, type Recording } from '../../voice/recorder';
import { confirmPaidSpeaking, EST_CLAUDE_SPEAKING_USD, SPEAKING_CRITERIA } from '../../speaking/ai';
import { cancelRecording, startRecording, stopRecording, type SpeakingDoc } from '../../speaking/data';
import { paceLabel } from '../../speaking/schema';
import { Spinner, toast } from '../../ui/components';
import { ExplainEs, Fold } from '../../ui/ExplainEs';
import { Rich } from '../../ui/rich';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`;

/* ── Grabar ───────────────────────────────────────────────────── */

export function RecordPanel(props: { maxSec: number; exact?: boolean; label: string; onDone: (r: Recording) => void; autoStart?: boolean }) {
  const [state, setState] = useState<'idle' | 'rec' | 'saving'>('idle');
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [mode, setMode] = useState<'mic' | 'fake'>('mic');
  const t0 = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopping = useRef(false);

  const stop = async () => {
    if (stopping.current) return;
    stopping.current = true;
    if (timer.current) clearInterval(timer.current);
    setState('saving');
    try {
      const r = await stopRecording();
      props.onDone(r);
    } catch (e) {
      toast(micErrorMessage(e), 5000);
      setState('idle');
    }
  };

  const start = async (auto = false) => {
    stopping.current = false;
    try {
      await beep(880, 120);
      const m = await startRecording((v) => setLevel(v));
      setMode(m);
      t0.current = performance.now();
      setElapsed(0);
      setState('rec');
      timer.current = setInterval(() => {
        const s = (performance.now() - t0.current) / 1000;
        setElapsed(s);
        if (s >= props.maxSec) void stop();
      }, 200);
    } catch (e) {
      // Arranque automático rechazado (p. ej. iPhone sin toque): queda el botón «Hablar».
      if (!auto) toast(micErrorMessage(e), 6000);
    }
  };

  useEffect(() => {
    if (props.autoStart) void start(true);
    return () => {
      if (timer.current) clearInterval(timer.current);
      if (!stopping.current) cancelRecording();
    };
  }, []);

  const left = props.maxSec - elapsed;
  return (
    <div class="recpanel stack" style={g(10)}>
      <div class="spread">
        <strong>{props.label}</strong>
        {state === 'rec' && <span class={`pill tabular ${left < 10 ? 'signal' : ''}`}>{props.exact ? fmt(left) : fmt(elapsed)}</span>}
      </div>
      {state === 'idle' && (
        <button class="btn signal" onClick={() => start()}>
          🎙 Hablar
        </button>
      )}
      {state === 'rec' && (
        <>
          <div class="level">
            <span style={{ width: `${Math.round(level * 100)}%` }} />
          </div>
          <span class="small muted">
            {mode === 'fake' ? 'Modo demo: grabación simulada.' : props.exact ? `Habla hasta que acabe el tiempo (${props.maxSec} s).` : `Te escucho. Máximo ${props.maxSec} s.`}
          </span>
          <button class="btn" onClick={stop} disabled={elapsed < 2}>
            He terminado
          </button>
        </>
      )}
      {state === 'saving' && <Spinner label="Guardando…" />}
    </div>
  );
}

/* ── Elegir cómo evaluar ───────────────────────────────────────── */

export function AssessChoice(props: { busy: string | null; onFree: () => void; onPaid: () => void }) {
  const claude = settings.value.claudeEnabled;
  if (props.busy) return <Spinner label={props.busy} />;
  return (
    <div class="stack" style={g(8)}>
      <button class="btn signal" onClick={props.onFree}>
        Evaluar gratis (Gemini)
      </button>
      {claude ? (
        <button
          class="btn ghost"
          onClick={async () => {
            if (await confirmPaidSpeaking()) props.onPaid();
          }}
        >
          Evaluar con Claude (≈ {EST_CLAUDE_SPEAKING_USD.toFixed(2).replace('.', ',')} $)
        </button>
      ) : (
        <p class="muted small">Claude está apagado (Ajustes → IA). Con Gemini la evaluación no cuesta nada.</p>
      )}
    </div>
  );
}

export function errorText(e: unknown): string {
  return e instanceof Error && !('kind' in e) ? e.message : aiErrorMessage(e);
}

/* ── Reescuchar una grabación guardada en este dispositivo ─────── */

function Replay(props: { recId?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!props.recId) return;
    let u: string | null = null;
    listRecordings()
      .then((all) => {
        const r = all.find((x) => x.id === props.recId);
        if (r) {
          u = URL.createObjectURL(r.blob);
          setUrl(u);
        }
      })
      .catch(() => undefined);
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [props.recId]);
  if (!props.recId) return null;
  if (!url) return <span class="small muted">La grabación no está en este dispositivo (solo se guardan las 20 últimas, y nunca se suben).</span>;
  return <audio controls src={url} preload="none" style={{ width: '100%' }} />;
}

/* ── Feedback ─────────────────────────────────────────────────── */

export function SpeakingFeedbackBody(props: { doc: SpeakingDoc }) {
  const { doc } = props;
  const a = doc.assessment;
  const isClaude = doc.model.startsWith('claude');
  return (
    <>
      <section class="card stack" style={g(12)}>
        <div class="spread">
          <span class="kicker">Nota orientativa</span>
          <span class="small muted">{isClaude ? 'Evaluado con Claude' : 'Evaluado con Gemini (gratis)'}</span>
        </div>
        <div class="row" style={{ ...g(14), alignItems: 'baseline' }}>
          <span class="bigscore tabular">
            {doc.raw75}
            <small>/75</small>
          </span>
          <span class="stack" style={g(0)}>
            <strong>Escala ≈ {doc.scale}</strong>
            <span class="small muted">{gradeFor(doc.scale)}</span>
          </span>
        </div>
        {SPEAKING_CRITERIA.map((c) => (
          <div key={c.key} class="stack" style={g(4)}>
            <div class="spread">
              <span style={{ fontWeight: 600 }}>{c.label}</span>
              <span class="tabular" style={{ fontWeight: 700 }}>
                {a.scores[c.key]}/5
              </span>
            </div>
            <div class="critbar sp">
              {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} class={i <= a.scores[c.key] ? 'on' : ''} />
              ))}
            </div>
            <span class="small muted">{c.es}</span>
          </div>
        ))}
        <p class="muted small">Orientativa: se basa en la transcripción y en notas de pronunciación, y se calibrará con las tablas oficiales en la Fase 7.</p>
      </section>

      <section class="card card-line stack" style={{ ...g(8), '--card-line': 'var(--signal)' } as JSX.CSSProperties}>
        <span class="kicker">Theo</span>
        <Rich text={a.summary} />
        <p class="small">
          <strong>Lo siguiente:</strong> {a.nextFocus}
        </p>
        <ExplainEs message={`${a.summary}\nNext focus: ${a.nextFocus}`} />
      </section>

      <section class="card stack" style={g(10)}>
        <span class="kicker">Fluidez</span>
        {doc.items.map((it, i) => (
          <div key={i} class="stack" style={g(2)}>
            <strong class="small">{it.label}</strong>
            <span class="small">
              {it.metrics.words} palabras · {it.metrics.wpm} ppm ({paceLabel(it.metrics.wpm)}) · {it.metrics.fillerTotal} muletillas
              {it.metrics.fillers.length ? ` (${it.metrics.fillers.map((f) => `${f.word} ×${f.count}`).join(', ')})` : ''} · {it.metrics.pauses} pausas largas
            </span>
          </div>
        ))}
        <p class="small">{a.fluency}</p>
        {a.interaction && a.interaction !== 'n/a' && (
          <p class="small">
            <strong>Interacción:</strong> {a.interaction}
          </p>
        )}
      </section>

      {doc.items.some((it) => it.pronunciation) && (
        <section class="card stack" style={g(8)}>
          <span class="kicker">Pronunciación</span>
          {doc.items
            .filter((it) => it.pronunciation)
            .map((it, i) => (
              <div key={i} class="stack" style={g(4)}>
                <span class="small">{it.pronunciation!.comment}</span>
                {it.pronunciation!.issues.map((x) => (
                  <span key={x.word} class="small">
                    <strong>{x.word}</strong> <span class="muted">sonó «{x.heard}»</span> · {x.tip}
                  </span>
                ))}
              </div>
            ))}
        </section>
      )}

      {a.errors.length > 0 && (
        <section class="stack" style={g(8)}>
          <span class="kicker">Errores</span>
          {a.errors.map((e, i) => (
            <div key={i} class="card stack review bad" style={g(4)}>
              <span class="read">
                <s class="bad-text">{e.quote}</s> → <strong class="ok-text">{e.correction}</strong>
              </span>
              <span class="small">{e.why}</span>
              <span class="small muted">
                Otro ejemplo: <em class="read">{e.example}</em>
              </span>
            </div>
          ))}
        </section>
      )}

      {a.sayItBetter.length > 0 && (
        <section class="stack" style={g(8)}>
          <span class="kicker">Say it better</span>
          {a.sayItBetter.map((s, i) => (
            <div key={i} class="card stack" style={g(4)}>
              <span class="read muted">{s.original}</span>
              <span class="read">
                → <strong>{s.better}</strong>
              </span>
              <span class="small">{s.note}</span>
            </div>
          ))}
        </section>
      )}

      <section class="card stack" style={g(8)}>
        <span class="kicker">Recursos C1 que has usado</span>
        {a.c1Resources.length ? (
          <div class="chips">
            {a.c1Resources.map((r, i) => (
              <span key={i} class="chip on" title={r.quote}>
                {r.resource}
              </span>
            ))}
          </div>
        ) : (
          <span class="small muted">Ninguno esta vez.</span>
        )}
        {a.missedResources.length > 0 && (
          <>
            <span class="small" style={{ fontWeight: 700 }}>
              Podrías haber usado
            </span>
            <div class="chips">
              {a.missedResources.map((r) => (
                <span key={r} class="chip">
                  {r}
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      {doc.items.map((it, i) => (
        <Fold key={i} title={`Lo que dijiste · ${it.label}`} sub={it.prompt}>
          <div class="stack" style={g(8)}>
            <Replay recId={it.recId} />
            <div class="read writing-text">{it.transcript || '(no se oye nada en la grabación)'}</div>
          </div>
        </Fold>
      ))}
    </>
  );
}
