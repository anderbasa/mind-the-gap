// Reproductor de los listenings. Usa un único <audio> para toda la app: en iPhone,
// una vez «desbloqueado» con un toque, puede encadenar audios sin más toques (modo examen).
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import type { UnitAudio } from '../../listening/bank';
import { sharedAudio, unlockSharedAudio } from '../../voice/audio';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;

export const audioEl = sharedAudio;

/** Llamar dentro de un toque: deja el audio listo para sonar después sin otro toque (iOS). */
export function unlockAudioEl(): Promise<void> {
  return unlockSharedAudio();
}

export function stopAudio(): void {
  sharedAudio().pause();
}

/** Desde la transcripción: salta a un momento y reproduce. */
export function seekAndPlay(t: number): void {
  const el = audioEl();
  el.currentTime = Math.max(0, t);
  void el.play();
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const SPEEDS = [0.75, 0.9, 1, 1.1];

type ExamPhase = 'idle' | 'reading' | 'play1' | 'gap' | 'play2' | 'done';

export function AudioPlayer(props: { audio: UnitAudio; exam: boolean; readSec?: number; autoStart?: boolean; onExamDone?: () => void; label?: string }) {
  const { audio, exam } = props;
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [phase, setPhase] = useState<ExamPhase>('idle');
  const [countdown, setCountdown] = useState(0);
  const phaseRef = useRef<ExamPhase>('idle');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const go = (p: ExamPhase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  useEffect(() => {
    const el = audioEl();
    el.pause();
    el.src = audio.url;
    el.playbackRate = exam ? 1 : rate;
    setTime(0);
    go('idle');
    const onTime = () => setTime(el.currentTime);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      if (!exam) return;
      if (phaseRef.current === 'play1') {
        go('gap');
        countdownThen(5, () => {
          go('play2');
          el.currentTime = 0;
          void el.play();
        });
      } else if (phaseRef.current === 'play2') {
        go('done');
        props.onExamDone?.();
      }
    };
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    if (exam && props.autoStart) startExam();
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
      el.pause();
    };
  }, [audio.url, exam]);

  function countdownThen(sec: number, fn: () => void) {
    setCountdown(sec);
    for (let i = 1; i <= sec; i++) timers.current.push(setTimeout(() => setCountdown(sec - i), i * 1000));
    timers.current.push(setTimeout(fn, sec * 1000));
  }

  function startExam() {
    void unlockAudioEl();
    const el = audioEl();
    go('reading');
    countdownThen(props.readSec ?? 15, () => {
      go('play1');
      el.currentTime = 0;
      el.playbackRate = 1;
      void el.play();
    });
  }

  const toggle = async () => {
    const el = audioEl();
    if (el.paused) {
      await unlockAudioEl();
      await el.play().catch(() => undefined);
    } else el.pause();
  };

  const back = (s: number) => {
    const el = audioEl();
    el.currentTime = Math.max(0, el.currentTime - s);
  };

  const sentence = () => {
    const el = audioEl();
    const t = el.currentTime;
    const turns = audio.turns;
    let i = turns.findIndex(([a, b]) => t >= a && t <= b + 0.3);
    if (i < 0) i = turns.filter(([a]) => a <= t).length - 1;
    if (i > 0 && t - turns[i][0] < 1) i--; // si acaba de empezar, la anterior
    el.currentTime = turns[Math.max(0, i)]?.[0] ?? 0;
    if (el.paused) void el.play();
  };

  const setSpeed = (r: number) => {
    setRate(r);
    audioEl().playbackRate = r;
  };

  const pct = audio.duration ? Math.min(100, (time / audio.duration) * 100) : 0;

  if (exam) {
    const label =
      phase === 'idle'
        ? 'Listo para empezar'
        : phase === 'reading'
          ? `Lee las preguntas · ${fmt(countdown)}`
          : phase === 'play1'
            ? 'Primera escucha'
            : phase === 'gap'
              ? `Segunda escucha en ${countdown} s`
              : phase === 'play2'
                ? 'Segunda escucha'
                : 'Terminado';
    return (
      <div class="player stack" style={g(8)}>
        <div class="spread">
          <strong>{props.label ?? 'Audio'}</strong>
          <span class={`pill ${phase === 'play1' || phase === 'play2' ? 'signal' : ''}`}>{label}</span>
        </div>
        <div class="pbar">
          <span style={{ width: `${phase === 'done' ? 100 : pct}%` }} />
        </div>
        {phase === 'idle' && (
          <button class="btn signal" onClick={startExam}>
            Empezar (suena dos veces, sin pausa)
          </button>
        )}
      </div>
    );
  }

  return (
    <div class="player stack" style={g(10)}>
      <div class="spread">
        <strong>{props.label ?? 'Audio'}</strong>
        <span class="small muted tabular">
          {fmt(time)} / {fmt(audio.duration)}
          {audio.source === 'device' ? ' · generado aquí' : ''}
        </span>
      </div>
      <input
        type="range"
        class="seek"
        min={0}
        max={audio.duration || 1}
        step={0.1}
        value={time}
        aria-label="Posición"
        onInput={(e) => (audioEl().currentTime = Number((e.target as HTMLInputElement).value))}
      />
      <div class="row" style={{ ...g(8), flexWrap: 'wrap' }}>
        <button class="btn small" onClick={toggle} style={{ minWidth: '96px' }}>
          {playing ? 'Pausa' : time > 0 ? 'Seguir' : 'Escuchar'}
        </button>
        <button class="btn quiet small" onClick={() => back(5)}>
          −5 s
        </button>
        <button class="btn quiet small" onClick={sentence}>
          Repetir frase
        </button>
      </div>
      <div class="chips" role="group" aria-label="Velocidad">
        {SPEEDS.map((r) => (
          <button key={r} class={`chip ${rate === r ? 'on' : ''}`} aria-pressed={rate === r} onClick={() => setSpeed(r)}>
            {r === 1 ? 'Normal' : `${r}×`}
          </button>
        ))}
      </div>
    </div>
  );
}
