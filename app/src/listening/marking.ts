// Corrección del Listening (1 punto por pregunta) y comparación palabra a palabra de los dictados.
import type { ListeningSetT } from './schema';

export type LAnswers = Record<number, string>;

export interface LItemResult {
  n: number;
  given: string;
  expected: string;
  ok: boolean;
  explanation: string;
  evidence: string;
}

export interface LResult {
  marks: number;
  max: number;
  items: LItemResult[];
}

const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Para los huecos de la Parte 2: mayúsculas, apóstrofos, guiones, tildes y un artículo inicial no cuentan. */
export function normalizeGap(s: string): string {
  return stripAccents(s)
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[-–—]/g, ' ')
    .replace(/[.,;:!?"“”()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(a|an|the) /, '');
}

export function gapCorrect(given: string, answers: string[]): boolean {
  const g = normalizeGap(given);
  return !!g && answers.some((a) => normalizeGap(a) === g);
}

export function markListening(set: ListeningSetT, answers: LAnswers): LResult {
  const items: LItemResult[] = [];
  const mcq = (q: { n: number; answer: string; explanation: string; evidence: string; options: Record<string, string> }) => {
    const given = (answers[q.n] ?? '').trim();
    items.push({ n: q.n, given, expected: q.answer, ok: given === q.answer, explanation: q.explanation, evidence: q.evidence });
  };
  switch (set.part) {
    case 'l1':
      set.extracts.forEach((x) => x.questions.forEach(mcq));
      break;
    case 'l3':
      set.questions.forEach(mcq);
      break;
    case 'l2':
      for (const it of set.items) {
        const given = (answers[it.n] ?? '').trim();
        items.push({ n: it.n, given, expected: it.answers[0], ok: gapCorrect(given, it.answers), explanation: it.explanation, evidence: it.evidence });
      }
      break;
    case 'l4':
      set.answers1.forEach((a, i) => {
        const n = 21 + i;
        const given = (answers[n] ?? '').trim();
        items.push({ n, given, expected: a, ok: given === a, explanation: set.notes[i].explanation, evidence: set.notes[i].evidence1 });
      });
      set.answers2.forEach((a, i) => {
        const n = 26 + i;
        const given = (answers[n] ?? '').trim();
        items.push({ n, given, expected: a, ok: given === a, explanation: set.notes[i].explanation, evidence: set.notes[i].evidence2 });
      });
      break;
  }
  return { marks: items.filter((i) => i.ok).length, max: items.length, items };
}

/* ── Dictados: palabra a palabra ────────────────────────────────── */

const CONTRACTIONS: Record<string, string> = {
  "i'm": 'i am',
  "you're": 'you are',
  "we're": 'we are',
  "they're": 'they are',
  "it's": 'it is',
  "he's": 'he is',
  "she's": 'she is',
  "that's": 'that is',
  "there's": 'there is',
  "what's": 'what is',
  "i've": 'i have',
  "you've": 'you have',
  "we've": 'we have',
  "they've": 'they have',
  "i'll": 'i will',
  "you'll": 'you will',
  "we'll": 'we will',
  "they'll": 'they will',
  "it'll": 'it will',
  "i'd": 'i would',
  "you'd": 'you would',
  "we'd": 'we would',
  "they'd": 'they would',
  "it'd": 'it would',
  "don't": 'do not',
  "doesn't": 'does not',
  "didn't": 'did not',
  "isn't": 'is not',
  "aren't": 'are not',
  "wasn't": 'was not',
  "weren't": 'were not',
  "haven't": 'have not',
  "hasn't": 'has not',
  "hadn't": 'had not',
  "won't": 'will not',
  "wouldn't": 'would not',
  "can't": 'cannot',
  "couldn't": 'could not',
  "shouldn't": 'should not',
  "would've": 'would have',
  "could've": 'could have',
  "should've": 'should have',
  "let's": 'let us',
};

const NUMBERS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19',
  twenty: '20', thirty: '30', forty: '40', fifty: '50', sixty: '60', seventy: '70', eighty: '80', ninety: '90', hundred: '100',
};

/** Palabras comparables: sin puntuación, con contracciones y números en una sola forma. */
export function wordsOf(text: string): string[] {
  const t = stripAccents(text)
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/%/g, ' per cent')
    .replace(/\bpercent\b/g, 'per cent')
    .replace(/[^a-z0-9' ]+/g, ' ');
  const out: string[] = [];
  for (const w of t.split(/\s+/).filter(Boolean)) {
    const x = w.replace(/^'+|'+$/g, '');
    if (!x) continue;
    const exp = CONTRACTIONS[x];
    if (exp) out.push(...exp.split(' '));
    else out.push(NUMBERS[x] ?? x);
  }
  return out;
}

export type DiffOp = { kind: 'ok' | 'missing' | 'extra'; word: string } | { kind: 'wrong'; word: string; given: string };

/** Compara lo que has escrito con el original (LCS): bien, falta, sobra o mal escrita. */
export function diffWords(expected: string, given: string): { ops: DiffOp[]; correct: number; total: number } {
  const a = wordsOf(expected);
  const b = wordsOf(given);
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const raw: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      raw.push({ kind: 'ok', word: a[i] });
      i++;
      j++;
    } else if (j < b.length && (i >= a.length || dp[i][j + 1] >= dp[i + 1][j])) {
      raw.push({ kind: 'extra', word: b[j++] });
    } else {
      raw.push({ kind: 'missing', word: a[i++] });
    }
  }
  // Una palabra que falta junto a una que sobra = palabra mal escrita.
  const ops: DiffOp[] = [];
  for (let k = 0; k < raw.length; k++) {
    const x = raw[k];
    const y = raw[k + 1];
    if (y && ((x.kind === 'missing' && y.kind === 'extra') || (x.kind === 'extra' && y.kind === 'missing'))) {
      const word = x.kind === 'missing' ? x.word : y.word;
      const given2 = x.kind === 'extra' ? x.word : y.word;
      ops.push({ kind: 'wrong', word, given: given2 });
      k++;
    } else ops.push(x);
  }
  return { ops, correct: ops.filter((o) => o.kind === 'ok').length, total: a.length };
}
