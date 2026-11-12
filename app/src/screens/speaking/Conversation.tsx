// Role-plays y conversación libre. Primero con Gemini Live (tiempo real); si no está disponible,
// por turnos: grabas, se transcribe, el personaje contesta (texto + voz del sistema).
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { buildSystem } from '../../ai/prompts';
import { navigate, route } from '../../router';
import { profile } from '../../state';
import { assessSpeaking, characterReply, helpPhrase, listenRecording, type Help } from '../../speaking/ai';
import { joinRecordings, keepRecording, saveSpeaking } from '../../speaking/data';
import { getScenario, SCENARIOS, type Scenario } from '../../speaking/scenarios';
import { speechMetrics } from '../../speaking/schema';
import { sayText, stopSpeaking } from '../../speaking/voice';
import { primeSpeech, unlockSharedAudio } from '../../voice/audio';
import { LiveSession, type LiveState } from '../../voice/liveSession';
import type { Recording } from '../../voice/recorder';
import { Band, ListItem, Page, Spinner, toast } from '../../ui/components';
import { AssessChoice, errorText, RecordPanel } from './SpeakingUI';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;

interface Line {
  who: 'you' | 'theo';
  text: string;
}

function appendLine(lines: Line[], who: Line['who'], text: string, newTurn: boolean): Line[] {
  const last = lines[lines.length - 1];
  if (last && last.who === who && !newTurn) return [...lines.slice(0, -1), { who, text: `${last.text}${text}` }];
  return [...lines, { who, text: text.trimStart() }];
}

function liveSystem(s: Scenario): string {
  return buildSystem({ profile: profile.value! }, 'speaking-live', { scenario: s.title, role: s.role, goal: s.goal, twist: s.twist, minutes: String(s.minutes) });
}

export function Conversation() {
  const s = getScenario(route.value.query.get('s'));
  if (!s) return <ScenarioList />;
  return <Talk key={s.id} s={s} />;
}

function ScenarioList() {
  return (
    <>
      <Band back="/practicar/speaking" kicker="Speaking · Conversación" title="Role-plays" sub="Situaciones C1 con giros inesperados" line="var(--line-speaking)" />
      <Page>
        <p class="small">
          Hablas con Theo en tiempo real (Gemini Live, gratis). Usa auriculares: si no, el micro puede captar su voz. Las correcciones llegan al final, nunca en medio.
        </p>
        <div class="list">
          {SCENARIOS.map((x) => (
            <ListItem key={x.id} dot="var(--line-speaking)" title={x.title} sub={`${x.es} · ~${x.minutes} min`} to={`/practicar/speaking/conversacion?s=${x.id}`} />
          ))}
        </div>
      </Page>
    </>
  );
}

function Talk(props: { s: Scenario }) {
  const { s } = props;
  const [mode, setMode] = useState<'intro' | 'live' | 'turns' | 'end'>('intro');
  const [state, setState] = useState<LiveState | 'thinking' | 'your-turn' | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [level, setLevel] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [help, setHelp] = useState<Help | null>(null);
  const [hint, setHint] = useState('');
  const [helping, setHelping] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [started, setStarted] = useState(0);
  const live = useRef<LiveSession | null>(null);
  const newTurn = useRef<{ you: boolean; theo: boolean }>({ you: true, theo: true });
  const recs = useRef<Recording[]>([]);
  const speakingMs = useRef(0);

  useEffect(
    () => () => {
      live.current?.stop();
      stopSpeaking();
    },
    [],
  );

  // Fin automático al pasar el tiempo del escenario (y antes del límite de sesión de Live).
  useEffect(() => {
    if (mode !== 'live') return;
    const t = setTimeout(() => finish(), Math.min(9, s.minutes + 1) * 60_000);
    return () => clearTimeout(t);
  }, [mode]);

  const startLive = async () => {
    void unlockSharedAudio(); // dentro del toque
    primeSpeech();
    setNote(null);
    const session = new LiveSession({
      onState: (st, detail) => {
        setState(st);
        if (st === 'error' && detail) setNote(detail);
      },
      onText: (who, text) => {
        setLines((ls) => appendLine(ls, who, text, newTurn.current[who]));
        newTurn.current[who] = false;
        newTurn.current[who === 'you' ? 'theo' : 'you'] = true;
      },
      onTurnEnd: () => {
        newTurn.current = { you: true, theo: true };
      },
      onLevel: setLevel,
    });
    live.current = session;
    try {
      await session.start(liveSystem(s));
      setMode('live');
      setStarted(Date.now());
      session.sendText('Start the conversation now, in role, with a short greeting and a first question.');
    } catch (e) {
      live.current = null;
      setNote(`Gemini Live no está disponible ahora (${(e as Error).message}). Seguimos por turnos: grabas tu respuesta y Theo contesta.`);
      await startTurns();
    }
  };

  const vars = () => ({ scenario: s.title, role: s.role, goal: s.goal, twist: s.twist, turns: String(Math.max(6, s.minutes * 2)) });

  const theoSays = async (history: Line[]) => {
    setState('thinking');
    const text = await characterReply(vars(), history);
    const next = [...history, { who: 'theo' as const, text }];
    setLines(next);
    setState('speaking');
    await sayText(text);
    setState('your-turn');
  };

  const startTurns = async () => {
    setMode('turns');
    setStarted(Date.now());
    try {
      await theoSays([]);
    } catch (e) {
      toast(errorText(e), 5000);
      setState('your-turn');
    }
  };

  const onRecorded = async (r: Recording) => {
    recs.current.push(r);
    speakingMs.current += r.durationMs;
    setState('thinking');
    try {
      const h = await listenRecording(r.blob, r.durationMs, `${s.title}: ${s.goal}`);
      const history = [...lines, { who: 'you' as const, text: h.transcript || '…' }];
      setLines(history);
      await theoSays(history);
    } catch (e) {
      toast(errorText(e), 5000);
      setState('your-turn');
    }
  };

  const askHelp = async () => {
    setHelping(true);
    try {
      const said = [...lines].reverse().find((l) => l.who === 'you')?.text ?? '';
      setHelp(await helpPhrase(`${s.title} — ${s.goal}`, said, hint));
    } catch (e) {
      toast(errorText(e), 4000);
    } finally {
      setHelping(false);
    }
  };

  const finish = () => {
    if (live.current) speakingMs.current = live.current.speakingMs;
    live.current?.stop();
    live.current = null;
    stopSpeaking();
    setMode('end');
  };

  const assess = async (paid: boolean) => {
    const yours = lines.filter((l) => l.who === 'you').map((l) => l.text.trim());
    const transcript = yours.join('\n');
    if (!transcript.trim()) return toast('No hay nada tuyo que evaluar todavía.');
    setBusy('Theo está evaluando…');
    try {
      const ms = speakingMs.current || Math.round((transcript.split(/\s+/).length / 130) * 60_000);
      const metrics = speechMetrics(transcript, ms);
      const convo = lines.map((l) => `${l.who === 'you' ? 'STUDENT' : 'THEO'}: ${l.text}`).join('\n');
      const item = { label: s.title, prompt: `${s.goal} (Role-play; full conversation for context:\n${convo})`, transcript, metrics };
      const r = await assessSpeaking('role-play conversation with an interlocutor (score interaction on how the student handles the conversation)', [item], paid);
      let recId: string | undefined;
      if (recs.current.length) {
        const blob = await joinRecordings(recs.current);
        recId = await keepRecording(blob, `Conversación · ${s.title}`, speakingMs.current);
      }
      const id = await saveSpeaking({
        mode: 'conversation',
        title: s.title,
        scenario: s.id,
        items: [{ label: s.title, prompt: s.goal, transcript, metrics, durationMs: ms, ...(recId ? { recId } : {}) }],
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

  const stateLabel =
    state === 'connecting'
      ? 'Conectando…'
      : state === 'speaking'
        ? 'Theo está hablando…'
        : state === 'listening'
          ? 'Te escucho: habla cuando quieras'
          : state === 'thinking'
            ? 'Theo está pensando…'
            : state === 'your-turn'
              ? 'Tu turno'
              : '';

  return (
    <>
      <Band back="/practicar/speaking/conversacion" kicker="Speaking · Conversación" title={s.title} sub={s.es} line="var(--line-speaking)" />
      <Page>
        {mode === 'intro' && (
          <section class="card stack" style={g(10)}>
            <p class="small">
              <strong>Tu papel:</strong> {s.goal}
            </p>
            <p class="small">Unos {s.minutes} minutos. Si te atascas, pulsa «Help» y te doy la palabra que te falta. Usa auriculares.</p>
            <button class="btn signal" onClick={startLive}>
              Empezar
            </button>
          </section>
        )}

        {note && <div class="notice info small">{note}</div>}

        {(mode === 'live' || mode === 'turns') && (
          <>
            <div class="spread">
              <span class={`pill ${state === 'listening' || state === 'your-turn' ? 'ok' : ''}`}>{stateLabel}</span>
              <span class="small muted tabular">{started ? `${Math.floor((Date.now() - started) / 60000)} min` : ''}</span>
            </div>
            {mode === 'live' && (
              <div class="level">
                <span style={{ width: `${Math.round(level * 100)}%` }} />
              </div>
            )}
            <section class="chat stack" style={g(8)}>
              {lines.map((l, i) => (
                <div key={i} class={`bubble ${l.who}`}>
                  <span class="read">{l.text}</span>
                </div>
              ))}
              {!lines.length && <span class="small muted">La transcripción aparecerá aquí.</span>}
            </section>
            {mode === 'turns' && state === 'your-turn' && <RecordPanel key={lines.length} maxSec={90} label="Tu respuesta" onDone={onRecorded} />}
            {mode === 'turns' && (state === 'thinking' || state === 'speaking') && <Spinner label={stateLabel} />}

            <section class="card flat stack" style={g(8)}>
              <div class="row" style={{ ...g(8), flexWrap: 'wrap' }}>
                <input class="input" style={{ flex: 1, minWidth: '160px' }} value={hint} placeholder="(opcional) lo que quieres decir, en castellano" onInput={(e) => setHint((e.target as HTMLInputElement).value)} />
                <button class="btn quiet small" onClick={askHelp} disabled={helping}>
                  {helping ? '…' : 'Help'}
                </button>
              </div>
              {help && (
                <div class="hint small">
                  <strong>{help.phrase}</strong> — {help.es}
                  <br />
                  <em class="read">{help.example}</em>
                </div>
              )}
            </section>
            <button class="btn" onClick={finish}>
              Terminar y ver el feedback
            </button>
          </>
        )}

        {mode === 'end' && (
          <section class="card stack" style={g(10)}>
            <span class="kicker">Feedback</span>
            <p class="small">
              {lines.filter((l) => l.who === 'you').length} intervenciones tuyas. ¿Cómo lo evalúo?
            </p>
            <AssessChoice busy={busy} onFree={() => assess(false)} onPaid={() => assess(true)} />
          </section>
        )}
      </Page>
    </>
  );
}

