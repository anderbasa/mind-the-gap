// Texto con palabras tocables: tocas una palabra y puedes guardarla en tu vocabulario.
import { signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { hasStore, store } from '../../state';
import { toast } from '../../ui/components';

interface Picked {
  word: string;
  context: string;
  source: Record<string, unknown>;
}

export const picked = signal<Picked | null>(null);

const TOKEN = /(\{\d+\}|[A-Za-zÀ-ÿ’'-]+|[^A-Za-zÀ-ÿ’'{}-]+|[{}])/g;

/** Frase que contiene la palabra, para guardarla siempre en contexto. */
function sentenceOf(paragraph: string, index: number): string {
  const flat = paragraph.replace(/\{\d+\}/g, '___');
  const start = Math.max(flat.lastIndexOf('. ', index), flat.lastIndexOf('? ', index), flat.lastIndexOf('! ', index)) + 1;
  const endM = /[.?!](\s|$)/.exec(flat.slice(index));
  const end = endM ? index + endM.index + 1 : flat.length;
  return flat.slice(start, end).trim();
}

/** Un párrafo con palabras tocables y, opcionalmente, huecos {n} que pinta `renderGap`. */
export function TapParagraph(props: { text: string; source: Record<string, unknown>; renderGap?: (n: number) => ComponentChildren; class?: string }) {
  const tokens = props.text.match(TOKEN) ?? [];
  let offset = 0;
  return (
    <p class={props.class ?? 'read'}>
      {tokens.map((t, i) => {
        const at = offset;
        offset += t.length;
        const gap = /^\{(\d+)\}$/.exec(t);
        if (gap) return props.renderGap ? <span key={i}>{props.renderGap(Number(gap[1]))}</span> : <span key={i}>___</span>;
        if (/^[A-Za-zÀ-ÿ’'-]+$/.test(t) && t.length > 1) {
          return (
            <span
              key={i}
              class="tapword"
              onClick={() => (picked.value = { word: t.replace(/^['’-]+|['’-]+$/g, ''), context: sentenceOf(props.text, at), source: props.source })}
            >
              {t}
            </span>
          );
        }
        return t;
      })}
    </p>
  );
}

/** Barra inferior que aparece al tocar una palabra. */
export function SaveWordBar() {
  const [saving, setSaving] = useState(false);
  const p = picked.value;
  if (!p) return null;
  const save = async () => {
    if (!hasStore()) return;
    setSaving(true);
    try {
      await store().add('vocab', { term: p.word, context: p.context, source: p.source, state: 'new', createdAt: Date.now() });
      toast(`«${p.word}» guardada en tu vocabulario`);
      picked.value = null;
    } catch {
      toast('No se ha podido guardar.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div class="wordbar" role="dialog" aria-label="Guardar palabra">
      <div class="wordbar-inner">
        <div class="grow" style={{ minWidth: 0 }}>
          <strong style={{ fontSize: '18px' }}>{p.word}</strong>
          <div class="muted small" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {p.context}
          </div>
        </div>
        <button class="btn small" onClick={save} disabled={saving}>
          Guardar
        </button>
        <button class="btn quiet small" aria-label="Cerrar" onClick={() => (picked.value = null)}>
          ✕
        </button>
      </div>
    </div>
  );
}
