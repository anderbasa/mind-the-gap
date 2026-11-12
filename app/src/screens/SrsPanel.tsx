// Panel del repaso espaciado en la pestaña Vocabulario: hoy, pack de inicio, tus palabras → tarjetas,
// alta manual y buscador.
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { aiErrorMessage } from '../ai/client';
import { navigate } from '../router';
import { cardsFromWords, cardStats, importStarter, listCards, todaysQueue, type VocabCard } from '../srs/srs';
import { settings, store } from '../state';
import { Spinner, toast } from '../ui/components';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;

const STATUS_ES = { new: 'nueva', learning: 'aprendiendo', review: 'repaso', mastered: 'dominada' } as const;

export function SrsPanel() {
  const [cards, setCards] = useState<VocabCard[] | null>(null);
  const [pending, setPending] = useState<{ id: string; term: string; context: string }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [ctx, setCtx] = useState('');

  const load = async () => {
    const [c, v] = await Promise.all([
      listCards().catch(() => [] as VocabCard[]),
      store()
        .list<{ term: string; context: string; carded?: boolean }>('vocab', { limit: 300 })
        .catch(() => []),
    ]);
    setCards(c);
    setPending(v.filter((x) => !x.carded));
  };
  useEffect(() => {
    void load();
  }, []);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
      await load();
    } catch (e) {
      toast(aiErrorMessage(e), 5000);
    } finally {
      setBusy(null);
    }
  };

  const starter = () => run('Añadiendo el pack…', async () => toast(`${await importStarter()} tarjetas añadidas`));
  const convert = () =>
    run('Creando tarjetas con tus palabras…', async () => {
      const n = await cardsFromWords(pending.slice(0, 30), 'vocab');
      for (const w of pending.slice(0, 30)) await store().set(`vocab/${w.id}`, { carded: true }, { merge: true });
      toast(`${n} tarjetas nuevas`);
    });
  const addManual = () =>
    run('Creando tarjetas…', async () => {
      const n = await cardsFromWords([{ term: term.trim(), context: ctx.trim() }], 'manual');
      setTerm('');
      setCtx('');
      toast(`${n} tarjetas nuevas para «${term.trim()}»`);
    });

  if (!cards) return <Spinner />;
  const st = cardStats(cards);
  const today = todaysQueue(cards);
  const toDo = today.due.length + today.fresh.length;
  const found = q.trim().length >= 2 ? cards.filter((c) => `${c.term} ${c.front} ${c.back}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 30) : [];

  return (
    <>
      <section class="card card-line stack" style={{ ...g(10), '--card-line': 'var(--line-vocab)' } as JSX.CSSProperties}>
        <div class="spread">
          <span class="kicker">Repaso espaciado</span>
          <span class="small muted">{st.total} tarjetas</span>
        </div>
        {st.total === 0 ? (
          <p class="small">Aún no tienes tarjetas. Empieza con el pack de inicio: 60 tarjetas de nivel C1 (collocations, word formation, phrasal verbs, conectores y expresiones de finanzas).</p>
        ) : (
          <div class="statrow small">
            <span>
              <strong class="tabular">{today.due.length}</strong> para repasar
            </span>
            <span>
              <strong class="tabular">{today.fresh.length}</strong> nuevas hoy
            </span>
            <span>
              <strong class="tabular">{st.learning + st.review}</strong> en marcha
            </span>
            <span>
              <strong class="tabular">{st.mastered}</strong> dominadas
            </span>
          </div>
        )}
        {busy && <Spinner label={busy} />}
        {!busy && toDo > 0 && (
          <button class="btn signal" onClick={() => navigate('/vocabulario/repaso')}>
            Repasar ({toDo})
          </button>
        )}
        {!busy && st.total === 0 && (
          <button class="btn signal" onClick={starter}>
            Añadir el pack de inicio (60)
          </button>
        )}
        {!busy && pending.length > 0 && (
          <button class="btn quiet" onClick={convert}>
            Convertir {Math.min(pending.length, 30)} palabra{pending.length === 1 ? '' : 's'} guardada{pending.length === 1 ? '' : 's'} en tarjetas (gratis)
          </button>
        )}
        <p class="muted small">
          Una palabra solo pasa a «dominada» cuando la usas bien 3 veces sin que te la pidan, en un writing o un speaking. Acertar tarjetas no basta. Entran como máximo {settings.value.srsNewPerDay ?? 10} tarjetas nuevas al día.
        </p>
      </section>

      <section class="card stack" style={g(8)}>
        <span class="kicker">Añadir una palabra</span>
        <input class="input read" value={term} placeholder="Palabra o expresión (p. ej. «cut corners»)" spellcheck={false} onInput={(e) => setTerm((e.target as HTMLInputElement).value)} />
        <input class="input read" value={ctx} placeholder="Frase donde la viste (opcional)" spellcheck={false} onInput={(e) => setCtx((e.target as HTMLInputElement).value)} />
        <button class="btn quiet small" style={{ alignSelf: 'flex-start' }} disabled={!term.trim() || !!busy} onClick={addManual}>
          Crear tarjetas (gratis)
        </button>
      </section>

      {st.total > 0 && (
        <section class="stack" style={g(8)}>
          <input class="input" value={q} placeholder="Buscar en tus tarjetas…" onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
          {found.length > 0 && (
            <div class="list">
              {found.map((c) => (
                <div key={c.id} class="list-item" style={{ cursor: 'default', alignItems: 'flex-start' }}>
                  <span class="grow">
                    <span class="list-title" style={{ display: 'block' }}>
                      {c.term}
                    </span>
                    <span class="list-sub read">{c.back}</span>
                  </span>
                  <span class={`pill ${c.status === 'mastered' ? 'ok' : ''}`}>
                    {STATUS_ES[c.status]}
                    {c.uses ? ` · ${c.uses}/3` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
