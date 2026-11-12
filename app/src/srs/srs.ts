// Vocabulario con repaso espaciado (FSRS, retención objetivo 0,90). Tarjetas en users/{uid}/cards.
// Una tarjeta solo pasa a «dominada» cuando usas la palabra bien 3 veces sin que te la pidan
// (en tus writings y speakings), no por acertarla en el repaso.
import { createEmptyCard, fsrs, Rating, State, type Card as FsrsCard, type Grade } from 'ts-fsrs';
import { z } from 'zod';
import { runAI } from '../ai/client';
import { fill, getPrompt } from '../ai/prompts';
import { diffWords } from '../listening/marking';
import { normalizeGap } from '../listening/marking';
import { settings, store } from '../state';

export type CardType = 'meaning' | 'gap' | 'wordform' | 'collocation' | 'production' | 'fix';

export interface StoredFsrs {
  due: number;
  stability: number;
  difficulty: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  learning_steps: number;
  state: number;
  last_review?: number;
}

export interface VocabCard {
  id: string;
  type: CardType;
  term: string;
  front: string;
  answer?: string;
  accepted?: string[];
  back: string;
  es?: string;
  hint?: string;
  /** Lo que se lee en voz alta. */
  say?: string;
  source: 'starter' | 'vocab' | 'error' | 'manual';
  status: 'new' | 'learning' | 'review' | 'mastered';
  uses: number;
  fsrs: StoredFsrs;
  createdAt: number;
  introducedAt?: number;
}

const scheduler = fsrs({ request_retention: 0.9, enable_fuzz: true });

const toStored = (c: FsrsCard): StoredFsrs => ({
  due: new Date(c.due).getTime(),
  stability: c.stability,
  difficulty: c.difficulty,
  scheduled_days: c.scheduled_days,
  reps: c.reps,
  lapses: c.lapses,
  learning_steps: (c as FsrsCard & { learning_steps?: number }).learning_steps ?? 0,
  state: c.state,
  ...(c.last_review ? { last_review: new Date(c.last_review).getTime() } : {}),
});

const fromStored = (s: StoredFsrs): FsrsCard =>
  ({
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: 0,
    scheduled_days: s.scheduled_days,
    reps: s.reps,
    lapses: s.lapses,
    learning_steps: s.learning_steps,
    state: s.state as State,
    ...(s.last_review ? { last_review: new Date(s.last_review) } : {}),
  }) as FsrsCard;

export function newFsrs(now = new Date()): StoredFsrs {
  return toStored(createEmptyCard(now));
}

export const RATINGS: { grade: Grade; label: string; es: string }[] = [
  { grade: Rating.Again, label: 'Again', es: 'Otra vez' },
  { grade: Rating.Hard, label: 'Hard', es: 'Difícil' },
  { grade: Rating.Good, label: 'Good', es: 'Bien' },
  { grade: Rating.Easy, label: 'Easy', es: 'Fácil' },
];

/** Aplica tu respuesta y devuelve la tarjeta reprogramada (sin guardar). */
export function review(card: VocabCard, grade: Grade, now = new Date()): VocabCard {
  const next = scheduler.next(fromStored(card.fsrs), now, grade).card;
  const status = card.status === 'mastered' ? 'mastered' : next.state === State.Review ? 'review' : 'learning';
  return { ...card, fsrs: toStored(next), status, ...(card.introducedAt ? {} : { introducedAt: now.getTime() }) };
}

/** ¿Está bien la respuesta escrita? (las de frase entera admiten pequeñas diferencias) */
export function checkTyped(card: VocabCard, given: string): { ok: boolean; close: boolean } {
  const answers = [card.answer ?? '', ...(card.accepted ?? [])].filter(Boolean);
  if (!given.trim()) return { ok: false, close: false };
  if (card.type === 'production' || card.type === 'fix') {
    const best = Math.max(...answers.map((a) => {
      const d = diffWords(a, given);
      return d.total ? d.correct / Math.max(d.total, d.ops.filter((o) => o.kind !== 'missing').length) : 0;
    }));
    return { ok: best >= 0.99, close: best >= 0.8 };
  }
  const g = normalizeGap(given);
  return { ok: answers.some((a) => normalizeGap(a) === g), close: false };
}

/* ── Almacén ─────────────────────────────────────────────────── */

export async function listCards(): Promise<VocabCard[]> {
  return store().list<Omit<VocabCard, 'id'>>('cards', { limit: 2000 });
}

export async function saveCard(c: VocabCard): Promise<void> {
  const { id, ...rest } = c;
  await store().set(`cards/${id}`, JSON.parse(JSON.stringify(rest)) as Record<string, unknown>);
}

export async function addCards(cards: Omit<VocabCard, 'id' | 'fsrs' | 'status' | 'uses' | 'createdAt'>[]): Promise<number> {
  const existing = new Set((await listCards()).map((c) => `${c.type}|${c.front}`));
  let n = 0;
  for (const c of cards) {
    if (existing.has(`${c.type}|${c.front}`)) continue;
    const id = `${c.source}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    await saveCard({ ...c, id, fsrs: newFsrs(), status: 'new', uses: 0, createdAt: Date.now() });
    n++;
  }
  return n;
}

const madridDay = (t: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(t);

/** Lo que toca hoy: primero las que vencen; después nuevas hasta el tope diario. */
export function todaysQueue(cards: VocabCard[], now = Date.now()): { due: VocabCard[]; fresh: VocabCard[]; newLeft: number } {
  const live = cards.filter((c) => c.status !== 'mastered');
  const due = live.filter((c) => c.status !== 'new' && c.fsrs.due <= now).sort((a, b) => a.fsrs.due - b.fsrs.due);
  const today = madridDay(now);
  const introducedToday = cards.filter((c) => c.introducedAt && madridDay(c.introducedAt) === today).length;
  const newLeft = Math.max(0, (settings.value.srsNewPerDay ?? 10) - introducedToday);
  const fresh = live.filter((c) => c.status === 'new').sort((a, b) => a.createdAt - b.createdAt).slice(0, newLeft);
  return { due, fresh, newLeft };
}

export function cardStats(cards: VocabCard[], now = Date.now()) {
  return {
    total: cards.length,
    fresh: cards.filter((c) => c.status === 'new').length,
    learning: cards.filter((c) => c.status === 'learning').length,
    review: cards.filter((c) => c.status === 'review').length,
    mastered: cards.filter((c) => c.status === 'mastered').length,
    dueNow: cards.filter((c) => c.status !== 'new' && c.status !== 'mastered' && c.fsrs.due <= now).length,
  };
}

/* ── Pack de inicio y palabras guardadas ───────────────────────── */

export async function importStarter(): Promise<number> {
  const r = await fetch(`${import.meta.env.BASE_URL}bank/srs/starter.json`);
  const list = (await r.json()) as Omit<VocabCard, 'id' | 'fsrs' | 'status' | 'uses' | 'createdAt'>[];
  return addCards(list.map((c) => ({ ...c, source: 'starter' as const })));
}

const Enriched = z.object({
  items: z.array(
    z.object({
      term: z.string(),
      es: z.string(),
      definition: z.string(),
      gapSentence: z.string().describe('A new natural C1 sentence with the term replaced by ___'),
      gapAnswer: z.string(),
      esSentence: z.string().describe('A short Spanish sentence whose natural translation uses the term'),
      enSentence: z.string(),
    }),
  ),
});

/** Convierte palabras (con su frase) en tarjetas: significado, hueco y del castellano al inglés. Gemini, gratis. */
export async function cardsFromWords(words: { term: string; context: string }[], source: 'vocab' | 'manual'): Promise<number> {
  let made = 0;
  for (let i = 0; i < words.length; i += 10) {
    const batch = words.slice(i, i + 10);
    const r = await runAI({
      task: 'rephrase',
      system: fill(getPrompt('cards-enrich').body, { words: batch.map((w) => `- ${w.term} | context: ${w.context || '(none)'}`).join('\n') }),
      messages: [{ role: 'user', parts: [{ text: 'Return only the JSON.' }] }],
      schema: Enriched,
      maxTokens: 4000,
      thinking: 'low',
      timeoutMs: 90_000,
      retries: 1,
    });
    const cards = r.data!.items.flatMap((it) => {
      const ctx = batch.find((w) => w.term.toLowerCase() === it.term.toLowerCase())?.context ?? '';
      return [
        { type: 'meaning' as const, term: it.term, front: ctx ? `${it.term}\n“${ctx}”` : it.term, back: it.definition, es: it.es, say: ctx || it.term, source },
        { type: 'gap' as const, term: it.term, front: it.gapSentence, answer: it.gapAnswer, back: it.gapSentence.replace('___', it.gapAnswer), es: it.es, hint: it.gapAnswer[0], say: it.gapSentence.replace('___', it.gapAnswer), source },
        { type: 'production' as const, term: it.term, front: it.esSentence, answer: it.enSentence, back: it.enSentence, es: it.es, say: it.enSentence, source },
      ];
    });
    made += await addCards(cards);
  }
  return made;
}

/* ── «Dominada»: 3 usos espontáneos y correctos ────────────────── */

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Cuenta los usos en un texto tuyo (si la palabra no aparece en ningún error) y marca las dominadas. */
export async function countSpontaneousUses(text: string, errorQuotes: string[]): Promise<string[]> {
  const cards = await listCards().catch(() => [] as VocabCard[]);
  const lowErr = errorQuotes.join(' ').toLowerCase();
  const seen = new Set<string>();
  const mastered: string[] = [];
  for (const c of cards) {
    if (c.status === 'new' || c.status === 'mastered') continue;
    const term = c.term.toLowerCase().trim();
    if (!term || seen.has(term)) continue;
    const re = new RegExp(`(^|[^a-z])${escape(term)}(s|es|ed|d|ing)?([^a-z]|$)`, 'i');
    if (!re.test(text) || lowErr.includes(term)) continue;
    seen.add(term);
    for (const same of cards.filter((x) => x.term.toLowerCase().trim() === term && x.status !== 'mastered')) {
      const uses = (same.uses ?? 0) + 1;
      const next: VocabCard = { ...same, uses, ...(uses >= 3 ? { status: 'mastered' as const } : {}) };
      await saveCard(next);
      if (uses >= 3) mastered.push(same.term);
    }
  }
  return [...new Set(mastered)];
}
