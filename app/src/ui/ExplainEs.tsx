// Botón «Explícamelo en castellano» para cualquier explicación o corrección de Theo.
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { aiErrorMessage, runAI } from '../ai/client';
import { fill, getPrompt } from '../ai/prompts';
import { toast } from './components';
import { Rich } from './rich';

export function ExplainEs(props: { message: string; label?: string }) {
  const [es, setEs] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    if (es) return setOpen(!open);
    setBusy(true);
    try {
      const out = await runAI({
        task: 'explain-es',
        messages: [{ role: 'user', parts: [{ text: fill(getPrompt('explain-es').body, { message: props.message }) }] }],
        maxTokens: 700,
        cache: true,
      });
      setEs(out.text.trim());
      setOpen(true);
    } catch (e) {
      toast(aiErrorMessage(e), 4000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button class="linkbtn" onClick={go} disabled={busy}>
        {busy ? 'Traduciendo…' : open ? 'Ocultar castellano' : (props.label ?? 'Explícamelo en castellano')}
      </button>
      {open && es && (
        <div class="hint small">
          <Rich text={es} />
        </div>
      )}
    </>
  );
}

/** Bloque plegable sencillo. */
export function Fold(props: { title: string; sub?: string; open?: boolean; children: ComponentChildren }) {
  return (
    <details class="fold" open={props.open}>
      <summary>
        <span class="grow">
          <span class="list-title">{props.title}</span>
          {props.sub && <span class="list-sub" style={{ display: 'block' }}>{props.sub}</span>}
        </span>
      </summary>
      <div class="fold-body">{props.children}</div>
    </details>
  );
}
