// Corrección de las 8 partes. La ortografía cuenta, como en el examen.
import { PARTS, type PartId, type RueSet } from './schema';

export type Answers = Record<number, string>;

export interface ItemResult {
  n: number;
  marks: number;
  max: number;
  given: string;
  expected: string; // respuesta modelo para mostrar
  /** true si la clave no la cubre y conviene que la IA mire si es una alternativa válida */
  needsReview: boolean;
  reason?: string;
}

export interface SetResult {
  items: ItemResult[];
  marks: number;
  max: number;
}

/** Normaliza sin perdonar la ortografía: mayúsculas, espacios, apóstrofos tipográficos y punto final. */
export function normalize(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[.!?,;:]+$/, '')
    .trim();
}

/** Recuento de palabras al estilo Cambridge: las contracciones cuentan como dos (don't = do not). */
export function countWords(s: string): number {
  const tokens = normalize(s).split(' ').filter(Boolean);
  let n = 0;
  for (const t of tokens) n += /(n't|'re|'ve|'ll|'d|'m)$/.test(t) ? 2 : 1;
  return n;
}

const has = (hay: string, needle: string) => ` ${hay} `.includes(` ${needle} `);

export function markKeyWord(item: { keyword: string; answers: string[]; chunks: string[][] }, raw: string): Omit<ItemResult, 'n' | 'expected'> {
  const given = raw ?? '';
  const a = normalize(given);
  const base = { max: 2, given };
  if (!a) return { ...base, marks: 0, needsReview: false, reason: 'En blanco.' };
  const kw = normalize(item.keyword);
  if (!has(a, kw)) return { ...base, marks: 0, needsReview: false, reason: `Tienes que usar «${item.keyword}» sin cambiarla.` };
  const wc = countWords(a);
  if (wc < 3 || wc > 6) return { ...base, marks: 0, needsReview: false, reason: `Son ${wc} palabras: tienen que ser entre 3 y 6 (las contracciones cuentan como dos).` };
  if (item.answers.some((x) => normalize(x) === a)) return { ...base, marks: 2, needsReview: false };
  const halves = item.chunks.map((variants) => variants.some((v) => has(a, normalize(v))));
  const marks = halves.filter(Boolean).length;
  return { ...base, marks, needsReview: marks < 2, reason: marks === 1 ? 'Una de las dos mitades está bien (1 punto).' : undefined };
}

export function markOpen(answers: string[], raw: string): Omit<ItemResult, 'n' | 'expected'> {
  const given = raw ?? '';
  const a = normalize(given);
  if (!a) return { marks: 0, max: 1, given, needsReview: false, reason: 'En blanco.' };
  if (a.includes(' ')) return { marks: 0, max: 1, given, needsReview: false, reason: 'Solo se admite una palabra.' };
  const ok = answers.some((x) => normalize(x) === a);
  return { marks: ok ? 1 : 0, max: 1, given, needsReview: !ok };
}

function markChoice(answer: string, raw: string, marksPerItem: number): Omit<ItemResult, 'n' | 'expected'> {
  const given = (raw ?? '').trim().toUpperCase();
  return { marks: given && given === answer ? marksPerItem : 0, max: marksPerItem, given, needsReview: false, reason: given ? undefined : 'En blanco.' };
}

/** Corrige un ejercicio. `reviewed` son las notas que la IA ha dado a respuestas fuera de la clave. */
export function markSet(set: RueSet, answers: Answers, reviewed: Record<number, number> = {}): SetResult {
  const per = PARTS[set.part].marksPerItem;
  const items: ItemResult[] = set.items.map((it) => {
    const raw = answers[it.n] ?? '';
    let r: Omit<ItemResult, 'n' | 'expected'>;
    let expected: string;
    switch (set.part) {
      case 'p2':
      case 'p3': {
        const item = it as { answers: string[] };
        r = markOpen(item.answers, raw);
        expected = item.answers[0];
        break;
      }
      case 'p4': {
        const item = it as { keyword: string; answers: string[]; chunks: string[][] };
        r = markKeyWord(item, raw);
        expected = item.answers[0];
        break;
      }
      default: {
        const item = it as { answer: string };
        r = markChoice(item.answer, raw, per);
        expected = item.answer;
      }
    }
    if (reviewed[it.n] != null && reviewed[it.n] > r.marks) {
      r = { ...r, marks: Math.min(reviewed[it.n], r.max), needsReview: false, reason: 'Aceptada como alternativa válida.' };
    }
    return { n: it.n, expected, ...r };
  });
  return { items, marks: items.reduce((s, i) => s + i.marks, 0), max: items.reduce((s, i) => s + i.max, 0) };
}

export function maxMarks(part: PartId): number {
  return PARTS[part].items * PARTS[part].marksPerItem;
}

/** Número del examen real (P1 empieza en 1, P2 en 9…). */
export const examNumber = (part: PartId, n: number) => PARTS[part].firstNumber + n - 1;
