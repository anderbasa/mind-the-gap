// Índice del Reading and Use of English: las 8 partes, modo práctica/examen y el banco.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { allSets, countUnseen, getProgress, type Progress } from '../../rue/bank';
import { topUp } from '../../rue/generate';
import { maxMarks } from '../../rue/marking';
import { PART_IDS, PARTS, type PartId, type RueSet } from '../../rue/schema';
import { navigate } from '../../router';
import { Band, Page, Segmented, Spinner } from '../../ui/components';
import { IconChevron } from '../../ui/icons';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;
const MODE_KEY = 'mtg.rueMode';

function readMode(): 'practice' | 'exam' {
  try {
    return localStorage.getItem(MODE_KEY) === 'exam' ? 'exam' : 'practice';
  } catch {
    return 'practice';
  }
}

export function RueHub() {
  const [mode, setModeState] = useState<'practice' | 'exam'>(readMode());
  const [sets, setSets] = useState<RueSet[] | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [filling, setFilling] = useState<string | null>(null);
  const [fillResult, setFillResult] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const refresh = async () => {
    const [s, p] = await Promise.all([allSets(), getProgress()]);
    setSets(s);
    setProgress(p);
  };

  useEffect(() => {
    void refresh();
    return () => abort.current?.abort();
  }, []);

  const setMode = (m: 'practice' | 'exam') => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* nada */
    }
  };

  const fill = async () => {
    abort.current = new AbortController();
    setFillResult(null);
    setFilling('Empezando…');
    const r = await topUp(2, { signal: abort.current.signal, onProgress: (m) => setFilling(m) });
    setFilling(null);
    setFillResult(
      `${r.made} ejercicio(s) nuevo(s) en el banco${r.discarded ? `, ${r.discarded} descartado(s) por no pasar el control de calidad` : ''}.${r.stoppedBy ? ` Se ha parado: ${r.stoppedBy}` : ''}`,
    );
    await refresh();
  };

  const counts = sets && progress ? countUnseen(sets, progress) : null;
  const best = (p: PartId) => {
    if (!sets || !progress) return null;
    const vals = sets.filter((s) => s.part === p && progress.best[s.id] != null).map((s) => progress.best[s.id]);
    return vals.length ? Math.max(...vals) : null;
  };

  return (
    <>
      <Band back="/practicar" kicker="Practicar · Paper 1" title="Reading & Use of English" sub="1 h 30 · 8 partes · 56 preguntas" line="var(--line-reading)" />
      <Page>
        <Segmented
          label="Modo"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'practice', label: 'Práctica' },
            { value: 'exam', label: 'Examen' },
          ]}
        />
        <p class="muted small">
          {mode === 'practice'
            ? 'Práctica: con pistas y la explicación de cada respuesta al corregir.'
            : 'Examen: cronometrado con el tiempo orientativo de cada parte y sin ayudas.'}{' '}
          Reading = partes 1, 5, 6, 7 y 8 (50 puntos). Use of English = partes 2, 3 y 4 (28 puntos).
        </p>

        {!counts && <Spinner />}
        {counts && (
          <div class="list">
            {PART_IDS.map((p) => {
              const info = PARTS[p];
              const c = counts[p];
              const b = best(p);
              return (
                <button key={p} class="list-item" onClick={() => navigate(`/practicar/rue/${p}?mode=${mode}`)}>
                  <span class="line-dot" style={{ '--dot': info.skill === 'reading' ? 'var(--line-reading)' : 'var(--line-uoe)' } as JSX.CSSProperties} />
                  <span class="grow">
                    <span class="list-title" style={{ display: 'block' }}>
                      {info.name} {info.priority && <span class="pill signal" style={{ marginLeft: '4px' }}>Prioridad</span>}
                    </span>
                    <span class="list-sub" style={{ display: 'block' }}>
                      {info.short} · {maxMarks(p)} puntos · {info.minutes} min
                    </span>
                    <span class="list-sub">
                      {c.unseen} sin hacer de {c.total}
                      {b != null && ` · mejor: ${b} %`}
                    </span>
                  </span>
                  <IconChevron class="chev" width={20} height={20} />
                </button>
              );
            })}
          </div>
        )}

        <section class="card stack" style={g(10)}>
          <h3>Banco de ejercicios</h3>
          <p class="small">
            Los ejercicios los escribe la IA y otro modelo los resuelve a ciegas antes de guardarlos; lo que no pasa se descarta. Quedan guardados para cuando no haya IA (sin
            cuota o sin conexión).
          </p>
          {filling ? (
            <>
              <Spinner label={filling} />
              <button class="btn ghost small" onClick={() => abort.current?.abort()}>
                Parar
              </button>
            </>
          ) : (
            <button class="btn quiet" onClick={fill}>
              Preparar más (hasta 2 sin hacer por parte)
            </button>
          )}
          {fillResult && <div class="notice info small">{fillResult}</div>}
          <p class="muted small">Tarda alrededor de un minuto por ejercicio y usa la cuota gratuita de Gemini. Puedes seguir usando la app mientras tanto en otra pestaña.</p>
        </section>

        <section class="card flat stack" style={g(6)}>
          <span class="kicker">Material oficial</span>
          <p class="small">
            Para practicar con exámenes reales, usa los{' '}
            <a href="https://www.cambridgeenglish.org/exams-and-tests/qualifications/advanced/preparation/" target="_blank" rel="noopener">
              sample tests gratuitos de Cambridge
            </a>
            . Aquí todo es original.
          </p>
        </section>
      </Page>
    </>
  );
}
