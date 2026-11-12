// Simulacro del Speaking por turnos: Theo (examinador) y tu compañero hablan con voz pregrabada
// (o la del sistema si aún no está), tú grabas con los tiempos del examen y al final se evalúa.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { navigate, route } from '../../router';
import { assessSpeaking, listenRecording, type AssessItem, type HeardItem } from '../../speaking/ai';
import { joinRecordings, keepRecording, saveSpeaking, type SpeakingItem } from '../../speaking/data';
import { buildSteps, PART_NAMES, pickP1, type Card, type Step } from '../../speaking/mock';
import { linesById, loadSpeakingBank, type SpeakingBankT, type SpeakingLine, type SpeakingTest } from '../../speaking/schema';
import { sayLine, stopSpeaking } from '../../speaking/voice';
import { primeSpeech, unlockSharedAudio } from '../../voice/audio';
import type { Recording } from '../../voice/recorder';
import { Band, Page, Spinner, toast } from '../../ui/components';
import { PhotoCard } from './Photos';
import { AssessChoice, errorText, RecordPanel } from './SpeakingUI';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;

interface Taken {
  part: number;
  prompt: string;
  rec: Recording;
}

function CardView(props: { card: Card }) {
  const c = props.card;
  if (c.kind === 'photos') return <PhotoCard title={c.title} questions={c.questions} photos={c.photos} mine={c.mine} />;
  if (c.kind === 'mindmap')
    return (
      <section class="card stack mindmap" style={g(10)}>
        <span class="kicker">Part 3</span>
        <strong class="read mm-q">{c.question}</strong>
        <div class="mm-prompts">
          {c.prompts.map((p) => (
            <span key={p} class="mm-p read">
              {p}
            </span>
          ))}
        </div>
      </section>
    );
  return (
    <section class="card stack" style={g(6)}>
      <span class="kicker">{c.title}</span>
      <strong class="read">{c.text}</strong>
    </section>
  );
}

export function MockExam() {
  const q = route.value.query;
  const partParam = q.get('part');
  const parts = partParam && /^p[1-4]$/.test(partParam) ? [Number(partParam[1])] : [1, 2, 3, 4];
  const [bank, setBank] = useState<SpeakingBankT | null | undefined>(undefined);
  const [test, setTest] = useState<SpeakingTest | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [idx, setIdx] = useState(-1);
  const [card, setCard] = useState<Card | null>(null);
  const [speaking, setSpeaking] = useState<SpeakingLine | null>(null);
  const [showText, setShowText] = useState(parts.length === 1);
  const [count, setCount] = useState(0);
  const [phase, setPhase] = useState<'ready' | 'running' | 'analyse'>('ready');
  const [busy, setBusy] = useState<string | null>(null);
  const [heard, setHeard] = useState<(HeardItem & { label: string; prompt: string; durationMs: number; recId?: string })[] | null>(null);
  const taken = useRef<Taken[]>([]);
  const lines = useRef<Map<string, SpeakingLine>>(new Map());
  const alive = useRef(true);

  useEffect(() => {
    loadSpeakingBank().then((b) => {
      setBank(b);
      if (!b) return;
      const t = b.tests.find((x) => x.id === q.get('test')) ?? b.tests[Math.floor(Math.random() * b.tests.length)];
      setTest(t);
      lines.current = linesById(b);
      setSteps(buildSteps(b, t, parts, pickP1(b)));
    });
    return () => {
      alive.current = false;
      stopSpeaking();
    };
  }, []);

  const next = () => setIdx((i) => i + 1);

  // Ejecuta cada paso automático (hablar, pensar, mostrar tarjeta). Grabar espera a que termines.
  useEffect(() => {
    if (phase !== 'running' || idx < 0) return;
    if (idx >= steps.length) {
      setPhase('analyse');
      return;
    }
    const st = steps[idx];
    if (st.k === 'card') {
      setCard(st.card);
      next();
    } else if (st.k === 'say') {
      const line = lines.current.get(st.id);
      if (!line) return next();
      setSpeaking(line);
      void sayLine(line).then(() => {
        if (!alive.current) return;
        setSpeaking(null);
        next();
      });
    } else if (st.k === 'think') {
      setCount(st.sec);
      let left = st.sec;
      const t = setInterval(() => {
        left--;
        setCount(left);
        if (left <= 0) {
          clearInterval(t);
          next();
        }
      }, 1000);
      return () => clearInterval(t);
    }
  }, [idx, phase]);

  const begin = () => {
    // Dentro del toque: audio compartido y voz del sistema listos para sonar sin más toques.
    void unlockSharedAudio();
    primeSpeech();
    taken.current = [];
    setPhase('running');
    setIdx(0);
  };

  const onRecorded = (r: Recording) => {
    const st = steps[idx];
    if (st?.k === 'record') taken.current.push({ part: st.part, prompt: st.prompt, rec: r });
    next();
  };

  // Al terminar: una grabación por parte (las intervenciones unidas) → transcripción y pronunciación.
  useEffect(() => {
    if (phase !== 'analyse' || heard) return;
    (async () => {
      const out: (HeardItem & { label: string; prompt: string; durationMs: number; recId?: string })[] = [];
      for (const p of parts) {
        const mine = taken.current.filter((x) => x.part === p);
        if (!mine.length) continue;
        setBusy(`Escuchando ${PART_NAMES[p]}…`);
        try {
          const blob = await joinRecordings(mine.map((x) => x.rec));
          const durationMs = mine.reduce((a, x) => a + x.rec.durationMs, 0);
          const prompt = [...new Set(mine.map((x) => x.prompt))].join(' | ');
          const recId = await keepRecording(blob, `Speaking · ${PART_NAMES[p]}`, durationMs);
          const h = await listenRecording(blob, durationMs, prompt);
          out.push({ ...h, label: PART_NAMES[p], prompt, durationMs, recId });
        } catch (e) {
          toast(errorText(e), 5000);
        }
      }
      setBusy(null);
      setHeard(out);
    })();
  }, [phase]);

  const assess = async (paid: boolean) => {
    if (!heard?.length || !test) return;
    setBusy('Theo está evaluando…');
    try {
      const items: AssessItem[] = heard.map((h) => ({ label: h.label, prompt: h.prompt, transcript: h.transcript, metrics: h.metrics, pronunciation: h.pronunciation }));
      const mode = parts.length > 1 ? 'full mock exam, four parts' : `practice of ${PART_NAMES[parts[0]]}`;
      const r = await assessSpeaking(mode, items, paid);
      const docItems: SpeakingItem[] = heard.map((h, i) => ({ ...items[i], durationMs: h.durationMs, ...(h.recId ? { recId: h.recId } : {}) }));
      const id = await saveSpeaking({
        mode: parts.length > 1 ? 'mock' : 'part',
        title: parts.length > 1 ? `Simulacro · ${test.title}` : `${PART_NAMES[parts[0]]} · ${test.title}`,
        testId: test.id,
        items: docItems,
        assessment: r.assessment,
        raw75: r.raw75,
        scale: r.scale,
        model: r.model,
        at: Date.now(),
      });
      navigate(`/practicar/speaking/ver?id=${id}`, { replace: true });
    } catch (e) {
      toast(errorText(e), 5000);
      setBusy(null);
    }
  };

  if (bank === undefined) return <Spinner />;
  if (!bank || !test) {
    return (
      <>
        <Band back="/practicar/speaking" kicker="Speaking" title="No se ha podido cargar el examen" />
        <Page>
          <button class="btn" onClick={() => navigate('/practicar/speaking', { replace: true })}>
            Volver
          </button>
        </Page>
      </>
    );
  }

  const st = phase === 'running' ? steps[idx] : undefined;
  const totalRec = steps.filter((x) => x.k === 'record').length;
  const doneRec = taken.current.length;
  const partNow = st && st.k === 'record' ? st.part : null;

  return (
    <>
      <Band
        back="/practicar/speaking"
        kicker={`Speaking · ${parts.length > 1 ? 'Simulacro completo' : PART_NAMES[parts[0]]}`}
        title={test.title}
        sub={`Compañero: ${test.partner.name} · ${test.partner.accent}`}
        line="var(--line-speaking)"
      />
      <Page>
        {phase === 'ready' && (
          <section class="card stack" style={g(10)}>
            <p class="small">
              {parts.length > 1 ? 'Unos 15 minutos, las 4 partes seguidas, con los tiempos del examen.' : 'Esta parte con los tiempos del examen.'} Theo es el examinador y{' '}
              {test.partner.name} tu compañero. Cuando te toque, la grabación empieza sola con un pitido; pulsa «He terminado» si acabas antes.
            </p>
            <p class="small">
              <strong>Usa auriculares</strong> y busca un sitio tranquilo. Tus grabaciones se quedan en este dispositivo; a la nube solo va el texto.
            </p>
            <button class="btn signal" onClick={begin}>
              Empezar
            </button>
          </section>
        )}

        {phase === 'running' && (
          <>
            <div class="spread">
              <span class="small muted">
                Tu turno {Math.min(doneRec + 1, totalRec)} de {totalRec}
              </span>
              <button class="linkbtn" onClick={() => setShowText(!showText)}>
                {showText ? 'Ocultar texto' : 'Ver texto'}
              </button>
            </div>
            {card && <CardView card={card} />}
            {speaking && (
              <section class={`card stack speaker ${speaking.who}`} style={g(6)}>
                <span class="kicker">{speaking.who === 'examiner' ? 'Theo (examinador)' : `${speaking.speaker.name} (compañero)`} · hablando…</span>
                {showText && <span class="read">{speaking.text}</span>}
              </section>
            )}
            {st?.k === 'think' && (
              <section class="card stack" style={g(6)}>
                <span class="kicker">{st.label}</span>
                <span class="bigscore tabular">{count}</span>
              </section>
            )}
            {st?.k === 'record' && (
              <RecordPanel key={idx} maxSec={st.maxSec} exact={st.exact} label={`${PART_NAMES[st.part]} · ${st.label}`} onDone={onRecorded} autoStart />
            )}
            {partNow && <span class="small muted">{PART_NAMES[partNow]}</span>}
            <button
              class="linkbtn"
              onClick={() => {
                stopSpeaking();
                setPhase('analyse');
              }}
            >
              Terminar aquí y evaluar lo grabado
            </button>
          </>
        )}

        {phase === 'analyse' && (
          <section class="card stack" style={g(10)}>
            <span class="kicker">Evaluación</span>
            {busy && !heard && <Spinner label={busy} />}
            {heard && heard.length === 0 && <p class="small">No hay grabaciones que evaluar.</p>}
            {heard && heard.length > 0 && (
              <>
                <p class="small">
                  He transcrito {heard.length} parte{heard.length === 1 ? '' : 's'} ({heard.reduce((a, h) => a + h.metrics.words, 0)} palabras). ¿Cómo lo evalúo?
                </p>
                <AssessChoice busy={busy} onFree={() => assess(false)} onPaid={() => assess(true)} />
              </>
            )}
          </section>
        )}
      </Page>
    </>
  );
}
