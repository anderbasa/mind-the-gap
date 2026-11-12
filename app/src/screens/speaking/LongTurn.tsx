// Entrenamiento del long turn: 30 → 45 → 60 → 90 s sin quedarte en blanco, con estrategias para
// rellenar y «dilo otra vez, pero mejor» (segundo intento y comparación).
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { navigate } from '../../router';
import { assessSpeaking, listenRecording, type Assessment, type HeardItem } from '../../speaking/ai';
import { keepRecording, saveSpeaking } from '../../speaking/data';
import { LONG_TURN_TIPS, LONG_TURN_TOPICS } from '../../speaking/scenarios';
import { loadSpeakingBank, paceLabel, speakingScale, type PhotoT } from '../../speaking/schema';
import type { Recording } from '../../voice/recorder';
import { Band, Page, Spinner, toast } from '../../ui/components';
import { Fold } from '../../ui/ExplainEs';
import { PhotoCard } from './Photos';
import { errorText, RecordPanel } from './SpeakingUI';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;
const LEVELS = [30, 45, 60, 90];
const LEVEL_KEY = 'mtg.longturn.level';

type Prompt = { kind: 'photos'; questions: string[]; photos: PhotoT[]; text: string } | { kind: 'topic'; text: string };

interface Attempt {
  heard: HeardItem;
  assessment: Assessment;
  scale: number;
  raw75: number;
  model: string;
  durationMs: number;
  recId?: string;
}

function readLevel(): number {
  try {
    const n = Number(localStorage.getItem(LEVEL_KEY));
    return LEVELS.includes(n) ? n : 30;
  } catch {
    return 30;
  }
}

export function LongTurn() {
  const [level, setLevelState] = useState(readLevel());
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [step, setStep] = useState<'ready' | 'rec' | 'busy' | 'result'>('ready');
  const [busy, setBusy] = useState('');
  const [attempts, setAttempts] = useState<Attempt[]>([]);

  useEffect(() => {
    loadSpeakingBank().then((b) => {
      const ps: Prompt[] = [];
      for (const t of b?.tests ?? []) {
        ps.push({ kind: 'photos', questions: t.p2.studentQuestions, photos: t.p2.studentPhotos, text: t.p2.studentIntro });
        ps.push({ kind: 'photos', questions: t.p2.partnerQuestions, photos: t.p2.partnerPhotos, text: t.p2.partnerIntro.replace(/^Now, \w+, here/, 'Here') });
      }
      for (const t of LONG_TURN_TOPICS) ps.push({ kind: 'topic', text: t });
      setPrompts(ps);
      setPrompt(ps[Math.floor(Math.random() * ps.length)] ?? null);
    });
  }, []);

  const setLevel = (n: number) => {
    setLevelState(n);
    try {
      localStorage.setItem(LEVEL_KEY, String(n));
    } catch {
      /* nada */
    }
  };

  const another = () => {
    const rest = prompts.filter((p) => p !== prompt);
    setPrompt(rest[Math.floor(Math.random() * rest.length)] ?? prompt);
    setAttempts([]);
    setStep('ready');
  };

  const onRecorded = async (r: Recording) => {
    if (!prompt) return;
    setStep('busy');
    try {
      setBusy('Escuchando…');
      const label = `Long turn ${level} s · intento ${attempts.length + 1}`;
      const recId = await keepRecording(r.blob, label, r.durationMs);
      const heard = await listenRecording(r.blob, r.durationMs, prompt.text);
      setBusy('Theo está evaluando…');
      const prev = attempts[attempts.length - 1];
      const mode = prev
        ? `long turn of ${level} seconds, SECOND attempt after feedback. Earlier attempt said: """${prev.heard.transcript}""". Comment on what improved.`
        : `long turn of ${level} seconds, no partner`;
      const res = await assessSpeaking(mode, [{ label, prompt: prompt.text, transcript: heard.transcript, metrics: heard.metrics, pronunciation: heard.pronunciation }], false);
      const scores = res.assessment.scores;
      const { raw75, scale } = speakingScale({ ...scores, interaction: undefined });
      const a: Attempt = { heard, assessment: res.assessment, scale, raw75, model: res.model, durationMs: r.durationMs, recId };
      const all = [...attempts, a];
      setAttempts(all);
      setStep('result');
      if (all.length === 2) {
        await saveSpeaking({
          mode: 'long-turn',
          title: `Long turn ${level} s`,
          items: all.map((x, i) => ({
            label: `Intento ${i + 1}`,
            prompt: prompt.text,
            transcript: x.heard.transcript,
            metrics: x.heard.metrics,
            pronunciation: x.heard.pronunciation,
            durationMs: x.durationMs,
            ...(x.recId ? { recId: x.recId } : {}),
          })),
          assessment: a.assessment,
          raw75,
          scale,
          model: a.model,
          at: Date.now(),
        }).catch(() => undefined);
      }
    } catch (e) {
      toast(errorText(e), 5000);
      setStep('ready');
    }
  };

  const last = attempts[attempts.length - 1];

  return (
    <>
      <Band back="/practicar/speaking" kicker="Speaking · Entrenamiento" title="Long turn" sub="Habla sin parar el tiempo que toque" line="var(--line-speaking)" />
      <Page>
        <div class="chips" role="group" aria-label="Duración">
          {LEVELS.map((n) => (
            <button key={n} class={`chip ${level === n ? 'on' : ''}`} aria-pressed={level === n} onClick={() => setLevel(n)} disabled={step === 'rec' || step === 'busy'}>
              {n} s
            </button>
          ))}
        </div>
        <p class="muted small">En el examen, la Parte 2 dura 1 minuto. Empieza por 30 s y sube cuando no te quedes en blanco.</p>

        {!prompt && <Spinner />}
        {prompt?.kind === 'photos' && <PhotoCard title="Compara dos fotos" questions={prompt.questions} photos={prompt.photos} mine />}
        {prompt?.kind === 'topic' && (
          <section class="card stack" style={g(6)}>
            <span class="kicker">Tema</span>
            <strong class="read">{prompt.text}</strong>
          </section>
        )}

        <Fold title="Estrategias para no quedarte en blanco" open={attempts.length === 0}>
          <div class="stack" style={g(8)}>
            {LONG_TURN_TIPS.map((t) => (
              <div key={t.es} class="stack" style={g(2)}>
                <strong class="small">{t.es}</strong>
                {t.en.map((x) => (
                  <span key={x} class="read small">
                    {x}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </Fold>

        {prompt && step === 'ready' && (
          <RecordPanel key={`${attempts.length}-${level}`} maxSec={level} exact label={attempts.length ? 'Segundo intento: dilo mejor' : `Habla ${level} segundos`} onDone={onRecorded} />
        )}
        {step === 'busy' && <Spinner label={busy} />}

        {step === 'result' && last && (
          <>
            {attempts.length === 2 && (
              <section class="card card-line stack" style={{ ...g(8), '--card-line': 'var(--line-speaking)' } as JSX.CSSProperties}>
                <span class="kicker">Intento 1 → intento 2</span>
                <table class="cmp small">
                  <tbody>
                    {[
                      ['Nota', `≈ ${attempts[0].scale}`, `≈ ${attempts[1].scale}`],
                      ['Palabras por minuto', attempts[0].heard.metrics.wpm, attempts[1].heard.metrics.wpm],
                      ['Muletillas', attempts[0].heard.metrics.fillerTotal, attempts[1].heard.metrics.fillerTotal],
                      ['Pausas largas', attempts[0].heard.metrics.pauses, attempts[1].heard.metrics.pauses],
                      ['Recursos C1', attempts[0].assessment.c1Resources.length, attempts[1].assessment.c1Resources.length],
                    ].map(([k, a, b]) => (
                      <tr key={String(k)}>
                        <td>{k}</td>
                        <td class="tabular">{a}</td>
                        <td class="tabular">
                          <strong>{b}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
            <section class="card stack" style={g(8)}>
              <div class="spread">
                <span class="kicker">Intento {attempts.length}</span>
                <span class="pill">≈ {last.scale}</span>
              </div>
              <span class="small">
                {last.heard.metrics.words} palabras · {last.heard.metrics.wpm} ppm ({paceLabel(last.heard.metrics.wpm)}) · {last.heard.metrics.fillerTotal} muletillas ·{' '}
                {last.heard.metrics.pauses} pausas largas
              </span>
              <p class="small">{last.assessment.summary}</p>
              {last.assessment.sayItBetter.slice(0, 3).map((s, i) => (
                <div key={i} class="stack" style={g(2)}>
                  <span class="read small muted">{s.original}</span>
                  <span class="read small">
                    → <strong>{s.better}</strong>
                  </span>
                </div>
              ))}
              {last.assessment.c1Resources.length > 0 && (
                <div class="chips">
                  {last.assessment.c1Resources.map((r, i) => (
                    <span key={i} class="chip on" title={r.quote}>
                      {r.resource}
                    </span>
                  ))}
                </div>
              )}
              {last.assessment.missedResources.length > 0 && <span class="small">Prueba a usar: {last.assessment.missedResources.join(' · ')}</span>}
              <Fold title="Lo que dijiste">
                <div class="read writing-text">{last.heard.transcript || '(no se oye nada)'}</div>
              </Fold>
            </section>
            <div class="row" style={{ ...g(8), flexWrap: 'wrap' }}>
              {attempts.length === 1 && (
                <button class="btn signal" onClick={() => setStep('ready')}>
                  Dilo otra vez, pero mejor
                </button>
              )}
              <button class="btn quiet" onClick={another}>
                Otro tema
              </button>
              {attempts.length === 2 && (
                <button class="btn ghost" onClick={() => navigate('/practicar/speaking')}>
                  Volver
                </button>
              )}
            </div>
          </>
        )}
      </Page>
    </>
  );
}
