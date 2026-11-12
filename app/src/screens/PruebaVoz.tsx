// «Prueba de voz»: comprueba en ESTE dispositivo (Safari o app instalada) todo lo que
// necesitan el Listening y el Speaking. Los resultados se guardan en Firestore para
// poder revisarlos desde el ordenador.
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { signal } from '@preact/signals';
import { hasStore, store } from '../state';
import { aiErrorMessage, runAI } from '../ai/client';
import { getPrompt } from '../ai/prompts';
import { AiError } from '../ai/types';
import { beep, blobToBase64, blobToWav16k, playBlob, primeSpeech, unlockAudio, unlockSharedAudio } from '../voice/audio';
import { listRecordings, saveRecording } from '../voice/idb';
import { testLiveConnection } from '../voice/live';
import { micErrorMessage, pickMime, Recorder, type Recording } from '../voice/recorder';
import { englishVoices, speakSystem, systemVoices, voiceFor } from '../voice/speech';
import { geminiSpeak } from '../voice/tts';
import { Band, Page } from '../ui/components';

type Status = 'idle' | 'running' | 'ok' | 'fail' | 'ask';
interface TestState {
  status: Status;
  detail?: string;
  question?: string;
}

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const results = signal<Record<string, TestState>>({});
const level = signal(0);
const countdown = signal(0);
let lastRecording: Recording | null = null;

function setResult(id: string, s: TestState) {
  results.value = { ...results.value, [id]: s };
  void persist();
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!hasStore()) return;
    const key = `voice-${isIOS() ? 'ios' : 'other'}-${isStandalone() ? 'app' : 'web'}`;
    const clean = Object.fromEntries(Object.entries(results.value).map(([k, v]) => [k, { status: v.status, detail: v.detail ?? '' }]));
    void store()
      .set(`diagnostics/${key}`, { at: Date.now(), ua: navigator.userAgent, standalone: isStandalone(), results: clean })
      .catch(() => undefined);
  }, 800);
}

async function recordFor(seconds: number, forceWav: boolean): Promise<Recording> {
  const rec = new Recorder();
  await rec.start({ forceWav, onLevel: (v) => (level.value = v) });
  for (let s = seconds; s > 0; s--) {
    countdown.value = s;
    await new Promise((r) => setTimeout(r, 1000));
  }
  countdown.value = 0;
  level.value = 0;
  return rec.stop();
}

interface TestDef {
  id: string;
  title: string;
  desc: string;
  run: () => Promise<TestState>;
}

const TESTS: TestDef[] = [
  {
    id: 'sound',
    title: '1 · ¿Se oye?',
    desc: 'Suena un pitido corto. Comprueba que el iPhone no está en silencio.',
    run: async () => {
      await beep();
      return { status: 'ask', question: '¿Has oído el pitido?' };
    },
  },
  {
    id: 'mic',
    title: '2 · Micrófono',
    desc: 'Pide permiso y mide el nivel 3 segundos. Di algo en voz alta.',
    run: async () => {
      let max = 0;
      const rec = new Recorder();
      try {
        await rec.start({
          onLevel: (v) => {
            level.value = v;
            max = Math.max(max, v);
          },
        });
      } catch (e) {
        return { status: 'fail', detail: micErrorMessage(e) };
      }
      for (let s = 3; s > 0; s--) {
        countdown.value = s;
        await new Promise((r) => setTimeout(r, 1000));
      }
      countdown.value = 0;
      level.value = 0;
      rec.cancel();
      return max > 0.04 ? { status: 'ok', detail: `Nivel máximo ${(max * 100).toFixed(0)} %` } : { status: 'fail', detail: 'No ha llegado sonido. ¿Has hablado? ¿Micro tapado?' };
    },
  },
  {
    id: 'record',
    title: '3 · Grabar y escucharte',
    desc: 'Graba 5 segundos (método principal) y lo reproduce. Di: “The early bird catches the worm.”',
    run: async () => {
      try {
        const r = await recordFor(5, false);
        lastRecording = r;
        await saveRecording({ label: 'Prueba de voz', blob: r.blob, mimeType: r.mimeType, durationMs: r.durationMs });
        await playBlob(r.blob);
        return { status: 'ask', question: '¿Te has oído bien?', detail: `${r.method} · ${r.mimeType} · ${(r.blob.size / 1024).toFixed(0)} KB` };
      } catch (e) {
        return { status: 'fail', detail: (e as Error).name === 'PlaybackBlockedError' ? (e as Error).message : (e as Error).name ? micErrorMessage(e) : String(e) };
      }
    },
  },
  {
    id: 'record-wav',
    title: '4 · Grabación de respaldo',
    desc: 'Lo mismo con el método alternativo (WAV), por si el principal falla al reabrir la app.',
    run: async () => {
      try {
        const r = await recordFor(4, true);
        lastRecording = lastRecording ?? r;
        await playBlob(r.blob);
        return { status: 'ask', question: '¿Te has oído bien?', detail: `${r.method} · ${(r.blob.size / 1024).toFixed(0)} KB` };
      } catch (e) {
        return { status: 'fail', detail: (e as Error).name === 'PlaybackBlockedError' ? (e as Error).message : micErrorMessage(e) };
      }
    },
  },
  {
    id: 'slow',
    title: '5 · «Más despacio»',
    desc: 'Reproduce tu última grabación al 75 % sin cambiar el tono.',
    run: async () => {
      if (!lastRecording) return { status: 'fail', detail: 'Haz antes la prueba 3.' };
      await playBlob(lastRecording.blob, { rate: 0.75 });
      return { status: 'ask', question: '¿Ha sonado más lento y con tu voz normal (no grave)?' };
    },
  },
  {
    id: 'system-voices',
    title: '6 · Voces del sistema',
    desc: 'Lee una frase con una voz británica del propio dispositivo (gratis y sin conexión).',
    run: async () => {
      await unlockAudio();
      const voices = englishVoices(await systemVoices());
      if (!voices.length) return { status: 'fail', detail: 'No hay voces en inglés instaladas.' };
      const v = voiceFor(voices, 'en-GB') ?? voices[0];
      await speakSystem('Please mind the gap between the train and the platform.', { voice: v });
      const accents = [...new Set(voices.map((x) => x.lang))].join(', ');
      return { status: 'ask', question: '¿Has oído la frase?', detail: `${voices.length} voces en inglés (${accents}). Usada: ${v.name}` };
    },
  },
  {
    id: 'gemini-tts',
    title: '7 · Voz de Theo (Gemini)',
    desc: 'Genera audio con Gemini TTS a través del Worker. Necesita conexión.',
    run: async () => {
      try {
        const wav = await geminiSpeak("Right then. Mind the gap — between B2 and C1, that is. Let's close it.", {
          style: 'Say it in a warm, slightly dry London accent',
        });
        await playBlob(wav);
        return { status: 'ask', question: '¿Ha sonado la voz de Theo?', detail: `${(wav.size / 1024).toFixed(0)} KB` };
      } catch (e) {
        return { status: 'fail', detail: aiErrorMessage(e) };
      }
    },
  },
  {
    id: 'transcribe',
    title: '8 · Transcripción literal',
    desc: 'Envía tu última grabación a Gemini, que la transcribe tal cual (con tus «ehm»).',
    run: async () => {
      if (!lastRecording) return { status: 'fail', detail: 'Haz antes la prueba 3.' };
      try {
        const wav = await blobToWav16k(lastRecording.blob);
        const r = await runAI({
          task: 'transcribe',
          system: getPrompt('transcribe-verbatim').body,
          messages: [{ role: 'user', parts: [{ inline: { mimeType: 'audio/wav', data: await blobToBase64(wav) } }, { text: 'Transcribe this recording.' }] }],
          maxTokens: 600,
        });
        return { status: 'ok', detail: `«${r.text.trim()}» (${r.model.model})` };
      } catch (e) {
        return { status: 'fail', detail: aiErrorMessage(e) };
      }
    },
  },
  {
    id: 'live',
    title: '9 · Conversación en tiempo real',
    desc: 'Abre y cierra una sesión de Gemini Live (la usarán los role-plays).',
    run: async () => {
      try {
        const ms = await testLiveConnection();
        return { status: 'ok', detail: `Sesión abierta en ${ms} ms` };
      } catch (e) {
        return { status: 'fail', detail: e instanceof AiError ? aiErrorMessage(e) : (e as Error).message };
      }
    },
  },
  {
    id: 'idb',
    title: '10 · Guardado en el dispositivo',
    desc: 'Comprueba que tus grabaciones se guardan aquí (nunca se suben).',
    run: async () => {
      try {
        const all = await listRecordings();
        return all.length ? { status: 'ok', detail: `${all.length} grabación(es) guardada(s)` } : { status: 'fail', detail: 'No hay grabaciones: haz la prueba 3.' };
      } catch (e) {
        return { status: 'fail', detail: `IndexedDB no disponible (${(e as Error).message})` };
      }
    },
  },
];

const PILL: Record<Status, { cls: string; text: string }> = {
  idle: { cls: '', text: 'Pendiente' },
  running: { cls: 'warn', text: 'Probando…' },
  ask: { cls: 'warn', text: 'Confirma' },
  ok: { cls: 'ok', text: 'OK' },
  fail: { cls: 'bad', text: 'Falla' },
};

function TestCard(props: { def: TestDef; busy: boolean; setBusy: (b: boolean) => void }) {
  const st = results.value[props.def.id] ?? { status: 'idle' };
  const run = async () => {
    // Dentro del toque, antes de cualquier await: el iPhone deja sonar audio y voz después.
    void unlockSharedAudio();
    primeSpeech();
    props.setBusy(true);
    setResult(props.def.id, { status: 'running' });
    try {
      setResult(props.def.id, await props.def.run());
    } catch (e) {
      setResult(props.def.id, { status: 'fail', detail: (e as Error).message });
    } finally {
      props.setBusy(false);
    }
  };
  const p = PILL[st.status];
  return (
    <section class="card stack" style={g(8)}>
      <div class="spread">
        <h3>{props.def.title}</h3>
        <span class={`pill ${p.cls}`}>{p.text}</span>
      </div>
      <p class="muted small">{props.def.desc}</p>
      {st.status === 'running' && countdown.value > 0 && (
        <div class="stack" style={g(6)}>
          <span class="small" style={{ fontWeight: 700 }}>
            Grabando… {countdown.value}
          </span>
          <div style={{ height: '8px', borderRadius: '4px', background: 'var(--paper-sunk)', overflow: 'hidden' }}>
            <div style={{ width: `${level.value * 100}%`, height: '100%', background: 'var(--signal)', transition: 'width .08s' }} />
          </div>
        </div>
      )}
      {st.detail && <p class="small" style={{ wordBreak: 'break-word' }}>{st.detail}</p>}
      {st.status === 'ask' ? (
        <div class="stack" style={g(8)}>
          <strong class="small">{st.question}</strong>
          <div class="row">
            <button class="btn small" onClick={() => setResult(props.def.id, { status: 'ok', detail: st.detail })}>
              Sí
            </button>
            <button class="btn ghost small" onClick={() => setResult(props.def.id, { status: 'fail', detail: `${st.detail ? st.detail + ' · ' : ''}No se oyó` })}>
              No
            </button>
            <button class="linkbtn" onClick={run} disabled={props.busy}>
              Repetir
            </button>
          </div>
        </div>
      ) : (
        <button class="btn quiet small" style={{ alignSelf: 'flex-start' }} onClick={run} disabled={props.busy}>
          {st.status === 'idle' ? 'Probar' : 'Repetir'}
        </button>
      )}
    </section>
  );
}

export function PruebaVoz() {
  const [busy, setBusy] = useState(false);
  const [env, setEnv] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const voices = englishVoices(await systemVoices());
      const sr = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
      setEnv([
        `${isIOS() ? 'iPhone/iPad' : 'Otro dispositivo'} · ${isStandalone() ? 'app instalada' : 'navegador'}`,
        `Micrófono: ${typeof navigator.mediaDevices?.getUserMedia === 'function' ? 'disponible' : 'NO disponible'}`,
        `MediaRecorder: ${typeof MediaRecorder !== 'undefined' ? pickMime() ?? 'sin formato compatible' : 'no'}`,
        `AudioWorklet: ${typeof AudioWorkletNode !== 'undefined' ? 'sí' : 'no'}`,
        `Voces del sistema en inglés: ${voices.length}`,
        `Reconocimiento del navegador: ${sr ? 'existe (no se usa: poco fiable y «limpia» errores)' : 'no'}`,
      ]);
    })();
  }, []);

  const done = Object.values(results.value).filter((r) => r.status === 'ok').length;

  return (
    <>
      <Band back="/ajustes" kicker="Ajustes · Prueba de voz" title="Voice check" sub={`${done}/${TESTS.length} pruebas OK en este dispositivo`} line="var(--line-speaking)" />
      <Page>
        <div class="notice info">
          Hazla dos veces en el iPhone: una en Safari y otra desde el icono de la pantalla de inicio. Mejor en casa: hay que hablar.
        </div>
        <section class="card flat stack" style={g(4)}>
          <span class="kicker">Este dispositivo</span>
          {env.map((l) => (
            <span key={l} class="small">
              {l}
            </span>
          ))}
        </section>
        {TESTS.map((t) => (
          <TestCard key={t.id} def={t} busy={busy} setBusy={setBusy} />
        ))}
      </Page>
    </>
  );
}
