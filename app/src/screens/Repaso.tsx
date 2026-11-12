// Repaso de vocabulario (FSRS): primero las tarjetas que vencen, después nuevas hasta el tope diario.
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { Rating, type Grade } from 'ts-fsrs';
import { navigate } from '../router';
import { checkTyped, listCards, RATINGS, review, saveCard, todaysQueue, type CardType, type VocabCard } from '../srs/srs';
import { sayText } from '../speaking/voice';
import { primeSpeech } from '../voice/audio';
import { Band, Page, Spinner } from '../ui/components';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;
const NO_AUTOCORRECT = { autocorrect: 'off', autocapitalize: 'none', autocomplete: 'off' } as Record<string, string>;

const TYPE_ES: Record<CardType, string> = {
  meaning: '¿Qué significa?',
  gap: 'Completa el hueco',
  wordform: 'Formación de palabras',
  collocation: 'Collocation',
  production: 'Dilo en inglés',
  fix: 'Corrige la frase',
};

export function Repaso() {
  const [queue, setQueue] = useState<VocabCard[] | null>(null);
  const [i, setI] = useState(0);
  const [given, setGiven] = useState('');
  const [shown, setShown] = useState<null | { ok: boolean; close: boolean }>(null);
  const [done, setDone] = useState(0);

  useEffect(() => {
    listCards()
      .then((cards) => {
        const q = todaysQueue(cards);
        setQueue([...q.due, ...q.fresh]);
      })
      .catch(() => setQueue([]));
  }, []);

  if (!queue) return <Spinner />;
  const card = queue[i];
  const typed = card && card.type !== 'meaning';

  const reveal = () => setShown(typed ? checkTyped(card, given) : { ok: true, close: false });

  const rate = async (grade: Grade) => {
    const next = review(card, grade);
    await saveCard(next).catch(() => undefined);
    // Si vuelve a tocar en pocos minutos (aprendiendo), se repite al final de esta sesión.
    const again = next.status !== 'mastered' && next.fsrs.due < Date.now() + 15 * 60_000;
    setQueue(again ? [...queue, next] : queue);
    setDone(done + 1);
    setI(i + 1);
    setGiven('');
    setShown(null);
  };

  const suggested: Grade | null = shown ? (typed ? (shown.ok ? Rating.Good : shown.close ? Rating.Hard : Rating.Again) : null) : null;

  return (
    <>
      <Band back="/vocabulario" kicker="Vocabulario · Repaso" title="Repaso de hoy" sub={card ? `${Math.min(i + 1, queue.length)} de ${queue.length}` : undefined} line="var(--line-vocab)" />
      <Page>
        {!card && (
          <section class="card stack" style={g(10)}>
            <span class="kicker">Hecho por hoy</span>
            <p class="small">{done ? `Has repasado ${done} tarjeta${done === 1 ? '' : 's'}. Vuelve mañana: el algoritmo te las traerá justo antes de que se te olviden.` : 'No tienes tarjetas pendientes ahora mismo.'}</p>
            <button class="btn" onClick={() => navigate('/vocabulario', { replace: true })}>
              Volver
            </button>
          </section>
        )}
        {card && (
          <section class="card stack srscard" style={g(12)}>
            <div class="spread">
              <span class="kicker">{TYPE_ES[card.type]}</span>
              {card.status === 'new' && <span class="pill">Nueva</span>}
            </div>
            <p class="read srs-front">{card.front}</p>
            {card.hint && !shown && (card.type === 'gap' || card.type === 'collocation') && <span class="small muted">Empieza por «{card.hint}»</span>}
            {typed && (
              <input
                class="input read"
                value={given}
                disabled={!!shown}
                placeholder="Tu respuesta"
                spellcheck={false}
                {...NO_AUTOCORRECT}
                onInput={(e) => setGiven((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => e.key === 'Enter' && !shown && reveal()}
              />
            )}
            {!shown ? (
              <button class="btn signal" onClick={reveal}>
                {typed ? 'Comprobar' : 'Mostrar respuesta'}
              </button>
            ) : (
              <>
                {typed && <span class={shown.ok ? 'ok-text' : 'bad-text'}>{shown.ok ? '✓ Bien' : shown.close ? '≈ Casi' : '✗ No'}</span>}
                <div class="stack" style={g(4)}>
                  <strong class="read">{card.back}</strong>
                  {card.es && <span class="small muted">{card.es}</span>}
                </div>
                <button
                  class="linkbtn"
                  onClick={() => {
                    primeSpeech();
                    void sayText(card.say ?? card.back);
                  }}
                >
                  🔊 Escuchar
                </button>
                <div class="rategrid">
                  {RATINGS.map((r) => (
                    <button key={r.grade} class={`btn small ${suggested === r.grade ? 'signal' : 'quiet'}`} onClick={() => rate(r.grade)}>
                      {r.es}
                    </button>
                  ))}
                </div>
                <span class="small muted">Elige con sinceridad: así el algoritmo calcula cuándo volver a enseñártela.</span>
              </>
            )}
          </section>
        )}
      </Page>
    </>
  );
}
