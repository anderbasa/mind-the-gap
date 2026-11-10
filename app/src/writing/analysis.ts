// Análisis local del texto (sin IA, gratis e instantáneo): palabras, párrafos,
// conectores y vocabulario repetido. La IA recibe este análisis y propone alternativas.
import { CONNECTORS } from './language';

const STOP = new Set(
  `a an the and or but if then so of to in on at for from by with without about into over under than as is are was were be been being am
  i you he she it we they me him her us them my your his its our their this that these those there here what which who whom whose when where why how
  not no nor do does did done have has had will would can could shall should may might must also very more most much many some any all each
  other such own same just only too even still yet both either neither one two first second because while although though however
  get got make made take took thing things way ways lot lots really quite rather well`.split(/\s+/),
);

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function splitParagraphs(text: string): string[] {
  const t = text.replace(/\r/g, '').trim();
  if (!t) return [];
  let ps = t.split(/\n\s*\n/);
  if (ps.length === 1) ps = t.split(/\n/); // quien escribe en el móvil a veces separa con un solo salto
  return ps.map((p) => p.trim()).filter(Boolean);
}

export interface LocalAnalysis {
  words: number;
  paragraphs: number[];
  balance: string[];
  connectors: { connector: string; count: number }[];
  repeated: { word: string; count: number }[];
}

function countPhrase(text: string, phrase: string): number {
  const re = new RegExp(`(^|[^a-z'])${phrase.replace(/ /g, '\\s+')}(?=[^a-z']|$)`, 'gi');
  return (text.match(re) ?? []).length;
}

export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z'-]+/g) ?? []).map((w) => w.replace(/'s$/, ''));
}

export function analyse(text: string): LocalAnalysis {
  const paras = splitParagraphs(text);
  const lens = paras.map(countWords);
  const avg = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
  const balance: string[] = [];
  if (paras.length < 3) balance.push(`Solo hay ${paras.length} párrafo(s): un texto de C1 suele tener 4–5.`);
  lens.forEach((n, i) => {
    if (avg && n < avg * 0.4) balance.push(`El párrafo ${i + 1} es muy corto (${n} palabras) comparado con los demás.`);
    if (avg && lens.length > 2 && n > avg * 1.9) balance.push(`El párrafo ${i + 1} es muy largo (${n} palabras): quizá mezcla dos ideas.`);
  });

  const connectors = CONNECTORS.map((c) => ({ connector: c, count: countPhrase(text, c) }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);

  const freq = new Map<string, number>();
  for (const w of tokens(text)) if (w.length > 3 && !STOP.has(w)) freq.set(w, (freq.get(w) ?? 0) + 1);
  const repeated = [...freq.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, count]) => ({ word, count }));

  return { words: countWords(text), paragraphs: lens, balance, connectors, repeated };
}

/** Palabras que repites a menudo en tus writings (aparecen 2+ veces en al menos 3 textos). */
export function habitualWords(previous: string[], current: string, minTexts = 3): { word: string; texts: number }[] {
  const all = [...previous, current];
  const perText = all.map((t) => {
    const f = new Map<string, number>();
    for (const w of tokens(t)) if (w.length > 3 && !STOP.has(w)) f.set(w, (f.get(w) ?? 0) + 1);
    return f;
  });
  const inCurrent = perText[perText.length - 1];
  const out: { word: string; texts: number }[] = [];
  for (const [word, n] of inCurrent) {
    if (n < 2) continue;
    const texts = perText.filter((f) => (f.get(word) ?? 0) >= 2).length;
    if (texts >= minTexts) out.push({ word, texts });
  }
  return out.sort((a, b) => b.texts - a.texts).slice(0, 8);
}

/** Resumen del análisis para enviárselo a la IA. */
export function analysisForPrompt(a: LocalAnalysis, habitual: { word: string; texts: number }[]): string {
  return [
    `Word count: ${a.words} (target 220–260).`,
    `Paragraph lengths: ${a.paragraphs.join(', ') || 'none'}.`,
    a.balance.length ? `Balance issues: ${a.balance.join(' ')}` : 'Paragraph balance: fine.',
    `Linking words used: ${a.connectors.map((c) => `${c.connector} ×${c.count}`).join(', ') || 'none detected'}.`,
    `Words repeated 3+ times in this text: ${a.repeated.map((r) => `${r.word} ×${r.count}`).join(', ') || 'none'}.`,
    `Words this student habitually overuses across recent writings: ${habitual.map((h) => h.word).join(', ') || 'none detected yet'}.`,
  ].join('\n');
}
