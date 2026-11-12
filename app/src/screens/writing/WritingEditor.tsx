// Escribir un writing: enunciado, plan de párrafos (opcional), banco de lenguaje,
// cronómetro opcional y entrega escrita o con foto del papel.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { aiErrorMessage } from '../../ai/client';
import { goBack, navigate, route } from '../../router';
import { settings, store } from '../../state';
import { Band, Page, Segmented, Spinner, toast } from '../../ui/components';
import { Fold } from '../../ui/ExplainEs';
import { countWords, splitParagraphs } from '../../writing/analysis';
import { addVersion, createWriting, startCorrection, type WritingDoc } from '../../writing/data';
import { LANGUAGE } from '../../writing/language';
import { transcribePhoto } from '../../writing/photo';
import type { Ocr } from '../../writing/schema';
import { getTask, TYPE_LABEL, type WritingTask } from '../../writing/tasks';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;
const EXAM_MINUTES = 45; // 1 h 30 para las dos tareas

/** El enunciado, tal como saldría en el examen. */
export function TaskCard(props: { task: WritingTask }) {
  const t = props.task;
  return (
    <section class="card stack" style={g(10)}>
      <div class="spread">
        <span class="kicker">
          Part {t.part} · {TYPE_LABEL[t.type]}
        </span>
        <span class="pill">{t.register}</span>
      </div>
      <p class="read">{t.context}</p>
      {t.notes && (
        <div class="notes-box stack" style={g(6)}>
          <strong>{t.notes.heading}</strong>
          <ol class="read" style={{ margin: 0, paddingLeft: '22px' }}>
            {t.notes.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
          <span class="small muted">Some opinions expressed in the discussion:</span>
          {t.notes.opinions.map((o) => (
            <span key={o} class="read" style={{ fontStyle: 'italic' }}>
              {o}
            </span>
          ))}
        </div>
      )}
      <p class="read" style={{ fontWeight: 600 }}>
        {t.instruction}
      </p>
    </section>
  );
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* sin almacenamiento: el borrador no se guarda, pero se puede seguir */
  }
}

interface Draft {
  text: string;
  plan: Record<string, string>;
  source: 'typed' | 'photo';
  timerStart: number | null;
}

function Clock(props: { start: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = EXAM_MINUTES * 60 - Math.floor((now - props.start) / 1000);
  const a = Math.abs(left);
  return (
    <span class={`pill tabular ${left < 0 ? 'signal' : ''}`}>
      ⏱ {left < 0 ? '+' : ''}
      {Math.floor(a / 60)}:{String(a % 60).padStart(2, '0')}
    </span>
  );
}

export function wordState(n: number): 'ok' | 'warn' | 'bad' {
  if (n >= 220 && n <= 260) return 'ok';
  if (n >= 200 && n <= 280) return 'warn';
  return 'bad';
}

export function WritingEditor() {
  const rewriteId = route.value.query.get('rewrite');
  const diag = route.value.query.get('diag') === '1';
  const [doc, setDoc] = useState<WritingDoc | null>(null);
  const [loading, setLoading] = useState(!!rewriteId);
  const task = getTask(route.value.query.get('task') ?? doc?.taskId ?? '');
  const version = (doc?.versions.length ?? 0) + 1;
  const key = rewriteId ? `mtg.writing.draft.${rewriteId}.v${version}` : `mtg.writing.draft.${task?.id ?? 'x'}`;

  const [draft, setDraft] = useState<Draft>({ text: '', plan: {}, source: 'typed', timerStart: null });
  const [mode, setMode] = useState<'typed' | 'photo'>('typed');
  const [ocr, setOcr] = useState<Ocr | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const ready = useRef(false);

  // Reescritura: se carga el writing y se parte de la última versión.
  useEffect(() => {
    if (!rewriteId) return;
    store()
      .get<WritingDoc>(`writings/${rewriteId}`)
      .then((d) => {
        setDoc(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [rewriteId]);

  useEffect(() => {
    if (loading || !task) return;
    const last = doc?.versions[doc.versions.length - 1];
    const d = readJson<Draft | null>(key, null);
    setDraft(d ?? { text: last?.text ?? '', plan: {}, source: 'typed', timerStart: null });
    if (d?.source === 'photo') setMode('photo');
    ready.current = true;
  }, [key, loading]);

  useEffect(() => {
    if (ready.current) writeJson(key, draft);
  }, [draft]);

  if (loading) return <Spinner />;
  if (!task) {
    return (
      <>
        <Band back="/practicar/writing" kicker="Writing" title="No encuentro el enunciado" />
        <Page>
          <button class="btn" onClick={() => navigate('/practicar/writing', { replace: true })}>
            Volver al Writing
          </button>
        </Page>
      </>
    );
  }

  const lang = LANGUAGE[task.type];
  const words = countWords(draft.text);
  const paras = splitParagraphs(draft.text).length;
  const ws = wordState(words);
  const lastFb = doc?.versions[doc.versions.length - 1]?.feedback;
  const claude = settings.value.claudeEnabled;

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const insert = (phrase: string) => {
    const el = area.current;
    const piece = phrase.replace(/\s*…\s*$/, ' ').replace(/\s*\/\s*.*$/, ' ');
    const text = draft.text;
    const at = el ? el.selectionStart : text.length;
    const before = text.slice(0, at);
    const sep = before && !/\s$/.test(before) ? ' ' : '';
    const next = before + sep + piece + text.slice(at);
    set({ text: next });
    requestAnimationFrame(() => {
      if (!el) return;
      const pos = (before + sep + piece).length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const onPhoto = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = '';
    if (!file) return;
    if (draft.text.trim() && !confirm('La transcripción sustituirá el texto que hay ahora. ¿Seguir?')) return;
    setOcrBusy(true);
    setOcr(null);
    try {
      const o = await transcribePhoto(file);
      setOcr(o);
      set({ text: o.text, source: 'photo' });
    } catch (err) {
      toast(err instanceof Error && !('kind' in err) ? err.message : aiErrorMessage(err), 5000);
    } finally {
      setOcrBusy(false);
    }
  };

  const submit = async () => {
    const text = draft.text.trim();
    if (!text) return toast('Aún no has escrito nada.');
    if (words < 150 && !confirm(`Llevas ${words} palabras y el examen pide 220–260. ¿Entregar igualmente?`)) return;
    if (/\[\?\]/.test(text) && !confirm('Quedan palabras marcadas con [?] (la IA no las ha leído bien). ¿Entregar sin revisarlas?')) return;
    setSending(true);
    try {
      const plan = lang.structure
        .map((s) => (draft.plan[s.title]?.trim() ? `${s.title}: ${draft.plan[s.title].trim()}` : ''))
        .filter(Boolean)
        .join('\n');
      const minutes = draft.timerStart ? Math.max(1, Math.round((Date.now() - draft.timerStart) / 60000)) : undefined;
      let id: string;
      if (rewriteId) {
        await addVersion(rewriteId, text, draft.source);
        id = rewriteId;
      } else {
        id = await createWriting({ taskId: task.id, text, source: draft.source, plan, minutes, diag });
      }
      try {
        localStorage.removeItem(key);
      } catch {
        /* nada */
      }
      if (!claude || diag) startCorrection(id, false); // sin Claude (o en el diagnóstico) se corrige gratis
      navigate(`/practicar/writing/ver?id=${id}`, { replace: true });
    } catch (e) {
      toast((e as Error).message || 'No se ha podido guardar.', 4000);
      setSending(false);
    }
  };

  return (
    <>
      <Band
        back={rewriteId ? `/practicar/writing/ver?id=${rewriteId}` : '/practicar/writing'}
        kicker={`Writing · Part ${task.part} · ${TYPE_LABEL[task.type]}${rewriteId ? ` · versión ${version}` : ''}`}
        title={task.title}
        line="var(--line-writing)"
        right={draft.timerStart ? <Clock start={draft.timerStart} /> : undefined}
      />
      <Page>
        <TaskCard task={task} />

        {lastFb && (
          <section class="card card-line stack" style={{ ...g(8), '--card-line': 'var(--line-writing)' } as JSX.CSSProperties}>
            <span class="kicker">Para la versión {version}</span>
            {lastFb.rewrite.map((r) => (
              <div key={r.original} class="stack" style={g(2)}>
                <span class="read">«{r.original}»</span>
                <span class="small muted">{r.hint}</span>
              </div>
            ))}
            {lastFb.topErrors.length > 0 && (
              <p class="small">
                Y no repitas: {lastFb.topErrors.map((e) => `«${e.quote}» → «${e.correction}»`).join(' · ')}
              </p>
            )}
          </section>
        )}

        {!rewriteId && (
          <Fold title="Plan de párrafos (opcional)" sub="Unas palabras por párrafo antes de escribir. Theo lo tendrá en cuenta.">
            <div class="stack" style={g(10)}>
              {lang.structure.map((s) => (
                <label key={s.title} class="field">
                  <span>{s.title}</span>
                  <small>{s.note}</small>
                  <textarea
                    class="textarea"
                    rows={2}
                    style={{ minHeight: '60px' }}
                    value={draft.plan[s.title] ?? ''}
                    onInput={(e) => set({ plan: { ...draft.plan, [s.title]: (e.target as HTMLTextAreaElement).value } })}
                  />
                </label>
              ))}
            </div>
          </Fold>
        )}

        <Fold title="Banco de lenguaje" sub={`${TYPE_LABEL[task.type]}: toca una frase para añadirla donde estés escribiendo`}>
          <div class="stack" style={g(10)}>
            <p class="small">{lang.register}</p>
            {lang.phrases.map((grp) => (
              <div key={grp.group} class="stack" style={g(6)}>
                <span class="kicker">{grp.group}</span>
                <div class="chips">
                  {grp.items.map((p) => (
                    <button key={p} class="chip" onClick={() => insert(p)}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Fold>

        <div class="spread">
          <Segmented
            label="Cómo entregas"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'typed', label: 'Escribir aquí' },
              { value: 'photo', label: 'Foto del papel' },
            ]}
          />
        </div>
        {!draft.timerStart && (
          <button class="linkbtn" onClick={() => set({ timerStart: Date.now() })}>
            Poner el cronómetro ({EXAM_MINUTES} min, como en el examen)
          </button>
        )}

        {mode === 'photo' && (
          <section class="card stack" style={g(10)}>
            <p class="small">
              Escribe a mano en papel, como en el examen, y hazle una foto con buena luz y la hoja entera. La IA (Gemini, gratis) lo transcribe tal cual, con tus errores, y luego lo
              puedes revisar.
            </p>
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={onPhoto} />
            {ocrBusy ? (
              <Spinner label="Leyendo tu letra…" />
            ) : (
              <button class="btn quiet" onClick={() => fileInput.current?.click()}>
                {ocr ? 'Subir otra foto' : 'Hacer o subir la foto'}
              </button>
            )}
            {ocr && (
              <div class={`notice ${ocr.confidence === 'low' ? 'bad' : 'info'} small`}>
                <span>
                  He leído <strong>{countWords(ocr.text)} palabras</strong>. Confianza: {ocr.confidence === 'high' ? 'alta' : ocr.confidence === 'medium' ? 'media' : 'baja'}.
                  {ocr.illegible > 0 && ` ${ocr.illegible} palabra(s) marcadas con [?]: revísalas.`} {ocr.note}
                </span>
              </div>
            )}
          </section>
        )}

        {(mode === 'typed' || draft.text) && (
          <label class="field">
            <span>{mode === 'photo' ? 'Transcripción (revísala: debe decir exactamente lo que escribiste)' : 'Tu texto'}</span>
            <textarea
              ref={area}
              class="textarea read writing-area"
              value={draft.text}
              placeholder={task.type === 'essay' ? 'Introduce the topic…' : 'Start writing…'}
              spellcheck={false}
              {...({ autocorrect: 'off', autocapitalize: 'sentences', autocomplete: 'off' } as Record<string, string>)}
              onInput={(e) => set({ text: (e.target as HTMLTextAreaElement).value })}
            />
            <small>Sin corrector ortográfico, como en el examen: la ortografía cuenta. Deja una línea en blanco entre párrafos.</small>
          </label>
        )}

        <div class="submitbar">
          <span class="stack" style={{ ...g(0), whiteSpace: 'nowrap' }}>
            <strong class={`tabular wc-${ws}`}>{words} palabras</strong>
            <span class="small muted">
              220–260 · {paras} párrafo{paras === 1 ? '' : 's'}
            </span>
          </span>
          <button class="btn signal" onClick={submit} disabled={sending || !draft.text.trim()}>
            {sending ? 'Guardando…' : 'Entregar'}
          </button>
        </div>
        <button class="linkbtn" onClick={() => goBack('/practicar/writing')}>
          Seguir luego (el borrador se queda guardado en este dispositivo)
        </button>
      </Page>
    </>
  );
}
