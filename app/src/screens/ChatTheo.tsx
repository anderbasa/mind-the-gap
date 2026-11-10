// «Habla con Theo»: chat de texto. Demuestra la capa de IA de punta a punta.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { profile, store } from '../state';
import { aiErrorMessage, runAI } from '../ai/client';
import { buildSystem, fill, getPrompt } from '../ai/prompts';
import { Band, toast } from '../ui/components';
import { IconSend } from '../ui/icons';
import { Rich } from '../ui/rich';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  at: number;
  es?: string; // explicación en castellano (si se pidió)
}

const DOC = 'chats/theo';
const KEEP = 40;
const CONTEXT = 20;

export function ChatTheo() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [explaining, setExplaining] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    store()
      .get<{ messages?: Msg[] }>(DOC)
      .then((d) => setMsgs(d?.messages ?? []))
      .catch(() => setMsgs([]))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs.length, busy]);

  const persist = (list: Msg[]) => store().set(DOC, { messages: list.slice(-KEEP), updatedAt: Date.now() }).catch((e) => console.warn(e));

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const mine: Msg = { role: 'user', text, at: Date.now() };
    const list = [...msgs, mine];
    setMsgs(list);
    setInput('');
    setBusy(true);
    try {
      const system = buildSystem({ profile: profile.value! }, 'chat');
      const r = await runAI({
        task: 'chat',
        system,
        messages: list.slice(-CONTEXT).map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
        maxTokens: 1200,
      });
      const next = [...list, { role: 'assistant' as const, text: r.text.trim(), at: Date.now() }];
      setMsgs(next);
      await persist(next);
    } catch (e) {
      toast(aiErrorMessage(e), 4200);
      await persist(list);
    } finally {
      setBusy(false);
    }
  };

  const explain = async (i: number) => {
    const m = msgs[i];
    if (m.es) {
      setMsgs(msgs.map((x, j) => (j === i ? { ...x, es: undefined } : x)));
      return;
    }
    setExplaining(i);
    try {
      const r = await runAI({
        task: 'explain-es',
        messages: [{ role: 'user', parts: [{ text: fill(getPrompt('explain-es').body, { message: m.text }) }] }],
        maxTokens: 600,
        cache: true,
      });
      const next = msgs.map((x, j) => (j === i ? { ...x, es: r.text.trim() } : x));
      setMsgs(next);
      await persist(next);
    } catch (e) {
      toast(aiErrorMessage(e), 4200);
    } finally {
      setExplaining(null);
    }
  };

  return (
    <>
      <Band back="/" kicker="Theo · chat" title="Talk to Theo" line="var(--signal)" />
      <main class="page" style={{ paddingBottom: '120px', gap: '14px' }}>
        {loaded && msgs.length === 0 && (
          <div class="card stack" style={{ '--gap': '8px' } as JSX.CSSProperties}>
            <p class="read">Go on then — tell me about your week, ask me anything about English, or pick a fight about football. I'll fix the odd mistake as we go.</p>
            <p class="muted small">Escríbele en inglés. Si escribes en castellano, te contestará en inglés con una aclaración breve.</p>
          </div>
        )}
        {msgs.map((m, i) =>
          m.role === 'user' ? (
            <div key={m.at} style={{ alignSelf: 'flex-end', maxWidth: '86%', background: 'var(--ink)', color: 'var(--paper)', padding: '10px 14px', borderRadius: '16px 16px 4px 16px', whiteSpace: 'pre-wrap' }}>
              {m.text}
            </div>
          ) : (
            <div key={m.at} class="stack" style={{ '--gap': '6px', maxWidth: '94%' } as JSX.CSSProperties}>
              <div class="card" style={{ borderLeft: '4px solid var(--signal)', padding: '12px 14px' }}>
                <Rich text={m.text} class="read" />
              </div>
              {m.es && (
                <div class="notice info" style={{ fontSize: '15px' }}>
                  <Rich text={m.es} />
                </div>
              )}
              <button class="linkbtn" style={{ alignSelf: 'flex-start' }} onClick={() => explain(i)} disabled={explaining === i}>
                {explaining === i ? 'Traduciendo…' : m.es ? 'Ocultar explicación' : 'Explícamelo en castellano'}
              </button>
            </div>
          ),
        )}
        {busy && (
          <div class="row muted small" role="status">
            <div class="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} /> Theo está escribiendo…
          </div>
        )}
        <div ref={endRef} />
      </main>

      <form
        class="composer"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '10px var(--page-pad) calc(10px + var(--safe-bottom))',
          background: 'color-mix(in srgb, var(--paper) 90%, transparent)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderTop: '1px solid var(--rule)',
        }}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div class="row" style={{ maxWidth: 'var(--maxw)', margin: '0 auto', alignItems: 'flex-end' }}>
          <textarea
            class="textarea"
            rows={1}
            style={{ minHeight: '48px', maxHeight: '140px', flex: 1 }}
            placeholder="Write to Theo…"
            value={input}
            onInput={(e) => setInput((e.currentTarget as HTMLTextAreaElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button class="btn signal" type="submit" aria-label="Enviar" disabled={busy || !input.trim()} style={{ width: '50px', padding: 0 }}>
            <IconSend width={22} height={22} />
          </button>
        </div>
      </form>
    </>
  );
}
