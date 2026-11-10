// Banco de lenguaje por tipo de texto, con una explicación del registro (formal, neutro, informal).
import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { route } from '../../router';
import { Band, Page } from '../../ui/components';
import { LANGUAGE, REGISTER_EXAMPLES } from '../../writing/language';
import { TYPE_LABEL, type WritingType } from '../../writing/tasks';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;
const TYPES = Object.keys(LANGUAGE) as WritingType[];

export function WritingLanguage() {
  const initial = route.value.query.get('type') as WritingType | null;
  const [type, setType] = useState<WritingType>(initial && TYPES.includes(initial) ? initial : 'essay');
  const lang = LANGUAGE[type];

  return (
    <>
      <Band back="/practicar/writing" kicker="Writing · Antes de escribir" title="Banco de lenguaje" line="var(--line-grammar)" />
      <Page>
        <section class="card stack" style={g(10)}>
          <span class="kicker">Formal, neutro e informal</span>
          <p class="small">
            Equivocarte de registro resta en Communicative Achievement (Writing Parte 2) y en el Speaking. La misma idea, en los tres registros:
          </p>
          {REGISTER_EXAMPLES.map((r) => (
            <div key={r.idea} class="stack" style={g(4)}>
              <span class="small muted">{r.idea}</span>
              <span class="read small">
                <span class="pill">Formal</span> {r.formal}
              </span>
              <span class="read small">
                <span class="pill">Neutro</span> {r.neutral}
              </span>
              <span class="read small">
                <span class="pill">Informal</span> {r.informal}
              </span>
            </div>
          ))}
          <p class="small muted">
            Formal: sin contracciones ni phrasal verbs coloquiales, frases impersonales y pasivas. Informal: contracciones, preguntas directas y expresiones coloquiales, pero bien
            organizado.
          </p>
        </section>

        <div class="chips" role="group" aria-label="Tipo de texto">
          {TYPES.map((t) => (
            <button key={t} class={`chip ${t === type ? 'on' : ''}`} aria-pressed={t === type} onClick={() => setType(t)}>
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>

        <section class="card stack" style={g(10)}>
          <span class="kicker">Registro</span>
          <p class="small">{lang.register}</p>
          <span class="kicker">Estructura</span>
          <ol class="tight small">
            {lang.structure.map((s) => (
              <li key={s.title}>
                <strong>{s.title}</strong>: {s.note}
              </li>
            ))}
          </ol>
        </section>

        {lang.phrases.map((grp) => (
          <section key={grp.group} class="card flat stack" style={g(6)}>
            <span class="kicker">{grp.group}</span>
            {grp.items.map((p) => (
              <span key={p} class="read">
                {p}
              </span>
            ))}
          </section>
        ))}
      </Page>
    </>
  );
}
