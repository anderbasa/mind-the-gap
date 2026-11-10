// Cómo se ve y se contesta cada parte del Reading and Use of English.
import { useState } from 'preact/hooks';
import type { ComponentChildren, JSX } from 'preact';
import { countWords, examNumber, hasKeyword, type Answers } from '../../rue/marking';
import type { RueSet, SetOf } from '../../rue/schema';
import { TapParagraph } from './WordTap';

export interface PartProps<P extends RueSet['part'] = RueSet['part']> {
  set: SetOf<P>;
  answers: Answers;
  setAnswer: (n: number, v: string) => void;
  practice: boolean;
}

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;
const paragraphs = (t: string) => t.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ── Piezas comunes ────────────────────────────────────────────── */

function Hint(props: { text: string }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <p class="hint small">💡 {props.text}</p>
  ) : (
    <button class="linkbtn" onClick={() => setOpen(true)}>
      Pista
    </button>
  );
}

function GapChip(props: { set: RueSet; n: number; value: string }) {
  const num = examNumber(props.set.part, props.n);
  return (
    <button id={`gap-${num}`} class={`gapchip${props.value ? ' filled' : ''}`} onClick={() => scrollToId(`row-${num}`)}>
      <span class="gapnum">{num}</span>
      {props.value || '      '}
    </button>
  );
}

function Letters(props: { letters: string[]; value: string; onPick: (l: string) => void; labels?: Record<string, string>; dim?: string[] }) {
  return (
    <div class={props.labels ? 'choices' : 'letters'}>
      {props.letters.map((l) => (
        <button
          key={l}
          class={`choice${props.value === l ? ' on' : ''}${props.dim?.includes(l) && props.value !== l ? ' dim' : ''}`}
          aria-pressed={props.value === l}
          onClick={() => props.onPick(props.value === l ? '' : l)}
        >
          <strong>{l}</strong>
          {props.labels && <span>{props.labels[l]}</span>}
        </button>
      ))}
    </div>
  );
}

function GappedText(props: PartProps<'p1' | 'p2' | 'p3'>) {
  const { set } = props;
  return (
    <section class="card textcard stack" style={g(12)}>
      <h3>{set.title}</h3>
      {paragraphs(set.text).map((p, i) => (
        <TapParagraph
          key={i}
          text={p}
          source={{ kind: 'rue', exerciseId: set.id, part: set.part }}
          renderGap={(n) => <GapChip set={set} n={n} value={props.answers[n] ?? ''} />}
        />
      ))}
    </section>
  );
}

const RowHead = (props: { set: RueSet; n: number; children?: ComponentChildren }) => {
  const num = examNumber(props.set.part, props.n);
  return (
    <div class="spread" id={`row-${num}`}>
      <span class="qnum">{num}</span>
      {props.children}
      <button class="linkbtn" onClick={() => scrollToId(`gap-${num}`)}>
        ver en el texto
      </button>
    </div>
  );
};

/* ── Parte 1 ───────────────────────────────────────────────────── */

export function P1(props: PartProps<'p1'>) {
  return (
    <>
      <GappedText {...props} />
      <section class="stack" style={g(10)}>
        {props.set.items.map((it) => (
          <div key={it.n} class="card qcard stack" style={g(8)}>
            <RowHead set={props.set} n={it.n} />
            <Letters letters={['A', 'B', 'C', 'D']} labels={it.options} value={props.answers[it.n] ?? ''} onPick={(l) => props.setAnswer(it.n, l)} />
            {props.practice && <Hint text={it.hint} />}
          </div>
        ))}
      </section>
    </>
  );
}

/* ── Partes 2 y 3 ──────────────────────────────────────────────── */

export function P2P3(props: PartProps<'p2' | 'p3'>) {
  const { set } = props;
  return (
    <>
      <GappedText {...props} />
      <section class="card stack" style={g(14)}>
        {set.items.map((it) => (
          <div key={it.n} class="stack" style={g(6)}>
            <RowHead set={set} n={it.n}>
              {'base' in it ? <span class="stem">{(it as { base: string }).base}</span> : false}
            </RowHead>
            <input
              class="input answer"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellcheck={false}
              value={props.answers[it.n] ?? ''}
              placeholder={set.part === 'p2' ? 'Una palabra' : 'Palabra formada'}
              onInput={(e) => props.setAnswer(it.n, (e.currentTarget as HTMLInputElement).value)}
            />
            {props.practice && <Hint text={it.hint} />}
          </div>
        ))}
      </section>
    </>
  );
}

/* ── Parte 4 ───────────────────────────────────────────────────── */

export function P4(props: PartProps<'p4'>) {
  return (
    <section class="stack" style={g(12)}>
      {props.set.items.map((it) => {
        const v = props.answers[it.n] ?? '';
        const wc = v.trim() ? countWords(v) : 0;
        const hasKw = hasKeyword(v, it.keyword);
        return (
          <div key={it.n} class="card qcard stack" style={g(8)} id={`row-${examNumber('p4', it.n)}`}>
            <span class="qnum">{examNumber('p4', it.n)}</span>
            <p class="read">{it.first}</p>
            <p class="keyword">{it.keyword}</p>
            <p class="read">
              {it.before} <span class="muted">______</span> {it.after}
            </p>
            <input
              class="input answer"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellcheck={false}
              placeholder="Entre 3 y 6 palabras"
              value={v}
              onInput={(e) => props.setAnswer(it.n, (e.currentTarget as HTMLInputElement).value)}
            />
            <div class="spread small">
              <span class={wc && (wc < 3 || wc > 6) ? 'bad-text' : 'muted'}>
                {wc} {wc === 1 ? 'palabra' : 'palabras'} (contracciones = 2)
              </span>
              {v.trim() && !hasKw && <span class="bad-text">Falta «{it.keyword}»</span>}
            </div>
            {props.practice && <Hint text={it.hint} />}
          </div>
        );
      })}
    </section>
  );
}

/* ── Parte 5 ───────────────────────────────────────────────────── */

export function P5(props: PartProps<'p5'>) {
  const { set } = props;
  return (
    <>
      <section class="card textcard stack" style={g(12)}>
        <h3>{set.title}</h3>
        {paragraphs(set.text).map((p, i) => (
          <TapParagraph key={i} text={p} source={{ kind: 'rue', exerciseId: set.id, part: set.part }} />
        ))}
      </section>
      <section class="stack" style={g(10)}>
        {set.items.map((it) => (
          <div key={it.n} class="card qcard stack" style={g(8)}>
            <span class="qnum">{examNumber('p5', it.n)}</span>
            <p style={{ fontWeight: 600 }}>{it.question}</p>
            <Letters letters={['A', 'B', 'C', 'D']} labels={it.options} value={props.answers[it.n] ?? ''} onPick={(l) => props.setAnswer(it.n, l)} />
            {props.practice && <Hint text={it.hint} />}
          </div>
        ))}
      </section>
    </>
  );
}

/* ── Parte 6 ───────────────────────────────────────────────────── */

export function P6(props: PartProps<'p6'>) {
  const { set } = props;
  return (
    <>
      <section class="stack" style={g(10)}>
        <h3>{set.title}</h3>
        <p class="muted">{set.intro}</p>
        {set.texts.map((t) => (
          <div key={t.letter} class="card textcard stack" style={g(6)}>
            <span class="kicker">
              {t.letter} · {t.author}
            </span>
            <TapParagraph text={t.text} source={{ kind: 'rue', exerciseId: set.id, part: set.part }} />
          </div>
        ))}
      </section>
      <section class="card stack" style={g(14)}>
        <span class="kicker">Which writer…</span>
        {set.items.map((it) => (
          <div key={it.n} class="stack" style={g(6)}>
            <p>
              <span class="qnum">{examNumber('p6', it.n)}</span> {it.question}
            </p>
            <Letters letters={['A', 'B', 'C', 'D']} value={props.answers[it.n] ?? ''} onPick={(l) => props.setAnswer(it.n, l)} />
            {props.practice && <Hint text={it.hint} />}
          </div>
        ))}
      </section>
    </>
  );
}

/* ── Parte 7 ───────────────────────────────────────────────────── */

export function P7(props: PartProps<'p7'>) {
  const { set } = props;
  const letters = set.paragraphs.map((p) => p.letter);
  const used = Object.values(props.answers).filter(Boolean);
  return (
    <>
      <section class="card textcard stack" style={g(12)}>
        <h3>{set.title}</h3>
        {paragraphs(set.text).map((p, i) => {
          const gap = /^\{(\d+)\}$/.exec(p);
          if (gap) {
            const n = Number(gap[1]);
            const it = set.items.find((x) => x.n === n)!;
            return (
              <div key={i} class="gapblock stack" style={g(6)} id={`row-${examNumber('p7', n)}`}>
                <span class="qnum">{examNumber('p7', n)}</span>
                <Letters letters={letters} value={props.answers[n] ?? ''} dim={used} onPick={(l) => props.setAnswer(n, l)} />
                {props.practice && <Hint text={it.hint} />}
              </div>
            );
          }
          return <TapParagraph key={i} text={p} source={{ kind: 'rue', exerciseId: set.id, part: set.part }} />;
        })}
      </section>
      <section class="stack" style={g(10)}>
        <span class="kicker">Párrafos que faltan (sobra uno)</span>
        {set.paragraphs.map((p) => (
          <div key={p.letter} class={`card qcard stack${used.includes(p.letter) ? ' usedcard' : ''}`} style={g(6)}>
            <span class="kicker">{p.letter}</span>
            <TapParagraph text={p.text} source={{ kind: 'rue', exerciseId: set.id, part: set.part }} />
          </div>
        ))}
      </section>
    </>
  );
}

/* ── Parte 8 ───────────────────────────────────────────────────── */

export function P8(props: PartProps<'p8'>) {
  const { set } = props;
  const letters = set.sections.map((s) => s.letter);
  return (
    <>
      <section class="stack" style={g(10)}>
        <h3>{set.title}</h3>
        <p class="muted">{set.intro}</p>
        {set.sections.map((s) => (
          <div key={s.letter} class="card textcard stack" style={g(6)}>
            <span class="kicker">
              {s.letter} · {s.heading}
            </span>
            <TapParagraph text={s.text} source={{ kind: 'rue', exerciseId: set.id, part: set.part }} />
          </div>
        ))}
      </section>
      <section class="card stack" style={g(14)}>
        <span class="kicker">In which section…</span>
        {set.items.map((it) => (
          <div key={it.n} class="stack" style={g(6)}>
            <p>
              <span class="qnum">{examNumber('p8', it.n)}</span> {it.statement}
            </p>
            <Letters letters={letters} value={props.answers[it.n] ?? ''} onPick={(l) => props.setAnswer(it.n, l)} />
            {props.practice && <Hint text={it.hint} />}
          </div>
        ))}
      </section>
    </>
  );
}

export function PartView(props: PartProps) {
  switch (props.set.part) {
    case 'p1':
      return <P1 {...(props as PartProps<'p1'>)} />;
    case 'p2':
    case 'p3':
      return <P2P3 {...(props as PartProps<'p2' | 'p3'>)} />;
    case 'p4':
      return <P4 {...(props as PartProps<'p4'>)} />;
    case 'p5':
      return <P5 {...(props as PartProps<'p5'>)} />;
    case 'p6':
      return <P6 {...(props as PartProps<'p6'>)} />;
    case 'p7':
      return <P7 {...(props as PartProps<'p7'>)} />;
    case 'p8':
      return <P8 {...(props as PartProps<'p8'>)} />;
  }
}
