// Índice del Writing: tus writings (con su nota) y los enunciados de las dos partes.
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { correcting, listWritings, type WritingRow } from '../../writing/data';
import { scaleLabel } from '../../writing/schema';
import { TYPE_LABEL, WRITING_TASKS } from '../../writing/tasks';
import { Band, ListItem, Page, Spinner } from '../../ui/components';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;

const dateEs = (t: number) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(t);

export function WritingStatus(props: { w: WritingRow }) {
  const v = props.w.versions[props.w.versions.length - 1];
  const job = correcting.value[props.w.id];
  if (job && !job.error) return <span class="pill">Corrigiendo…</span>;
  if (v?.raw == null) return <span class="pill warn">Sin corregir</span>;
  return (
    <span class={`pill ${(v.scale ?? 0) >= 180 ? 'ok' : ''}`}>
      {v.raw}/20 · {scaleLabel(v.scale ?? 0)}
    </span>
  );
}

export function WritingHub() {
  const [rows, setRows] = useState<WritingRow[] | null>(null);
  useEffect(() => {
    listWritings()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  const done = new Set((rows ?? []).map((r) => r.taskId));
  const part1 = WRITING_TASKS.filter((t) => t.part === 1);
  const part2 = WRITING_TASKS.filter((t) => t.part === 2);

  return (
    <>
      <Band back="/practicar" kicker="Practicar · Paper 2" title="Writing" sub="1 h 30 · 2 partes · 220–260 palabras cada una" line="var(--line-writing)" />
      <Page>
        <p class="muted small">
          Parte 1: un essay obligatorio. Parte 2: eliges una entre letter/email, proposal, report o review. Puedes escribir aquí o a mano en papel y subir una foto.
        </p>

        {!rows && <Spinner />}
        {rows && rows.length > 0 && (
          <section class="stack" style={g(8)}>
            <span class="kicker">Tus writings</span>
            <div class="list">
              {rows.slice(0, 12).map((w) => (
                <ListItem
                  key={w.id}
                  dot="var(--line-writing)"
                  title={w.title}
                  sub={`${TYPE_LABEL[w.type]} · ${dateEs(w.createdAt)}${w.versions.length > 1 ? ` · ${w.versions.length} versiones` : ''}`}
                  right={<WritingStatus w={w} />}
                  to={`/practicar/writing/ver?id=${w.id}`}
                />
              ))}
            </div>
          </section>
        )}

        <section class="stack" style={g(8)}>
          <span class="kicker">Parte 1 · Essay (obligatoria)</span>
          <div class="list">
            {part1.map((t) => (
              <ListItem
                key={t.id}
                dot="var(--line-writing)"
                title={t.title}
                sub={t.notes ? t.notes.points.join(' · ') : ''}
                right={done.has(t.id) ? <span class="pill ok">Hecho</span> : undefined}
                to={`/practicar/writing/escribir?task=${t.id}`}
              />
            ))}
          </div>
        </section>

        <section class="stack" style={g(8)}>
          <span class="kicker">Parte 2 · Elige una</span>
          <div class="list">
            {part2.map((t) => (
              <ListItem
                key={t.id}
                dot="var(--line-writing)"
                title={t.title}
                sub={`${TYPE_LABEL[t.type]} · registro ${t.register}`}
                right={done.has(t.id) ? <span class="pill ok">Hecho</span> : undefined}
                to={`/practicar/writing/escribir?task=${t.id}`}
              />
            ))}
          </div>
        </section>

        <section class="stack" style={g(8)}>
          <span class="kicker">Antes de escribir</span>
          <div class="list">
            <ListItem dot="var(--line-grammar)" title="Banco de lenguaje" sub="Estructura, frases útiles y registro de cada tipo de texto" to="/practicar/writing/lenguaje" />
          </div>
        </section>
      </Page>
    </>
  );
}
