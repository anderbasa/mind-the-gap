// Guion del simulacro del Speaking: qué se dice, cuándo grabas y con qué tiempo (sin pantalla, se puede probar).
import type { PhotoT, SpeakingBankT, SpeakingTest } from './schema';

export type Card =
  | { kind: 'photos'; title: string; questions: string[]; photos: PhotoT[]; mine: boolean }
  | { kind: 'mindmap'; question: string; prompts: string[] }
  | { kind: 'text'; title: string; text: string };

export type Step =
  | { k: 'say'; id: string }
  | { k: 'record'; part: number; label: string; prompt: string; maxSec: number; exact?: boolean }
  | { k: 'think'; sec: number; label: string }
  | { k: 'card'; card: Card | null };

export const PART_NAMES = ['', 'Part 1 · Interview', 'Part 2 · Long turn', 'Part 3 · Collaborative task', 'Part 4 · Discussion'];

export function pickP1(bank: SpeakingBankT): { id: string; text: string }[] {
  const topics = [...bank.p1].sort(() => Math.random() - 0.5).slice(0, 2);
  return topics.flatMap((t) => [...t.questions].sort(() => Math.random() - 0.5).slice(0, 2));
}

export function buildSteps(bank: SpeakingBankT, t: SpeakingTest, parts: number[], p1: { id: string; text: string }[]): Step[] {
  const s: Step[] = [];
  const has = (n: number) => parts.includes(n);
  if (has(1)) {
    s.push({ k: 'say', id: `${t.id}-intro` }, { k: 'say', id: 'frame-p1Start' });
    for (const q of p1) {
      s.push({ k: 'card', card: { kind: 'text', title: 'Part 1', text: q.text } }, { k: 'say', id: `p1-${q.id}` });
      s.push({ k: 'record', part: 1, label: 'Tu respuesta', prompt: q.text, maxSec: 40 });
    }
    s.push({ k: 'card', card: null }, { k: 'say', id: 'frame-thanks' });
  }
  if (has(2)) {
    const p = t.p2;
    s.push({ k: 'say', id: 'frame-p2Start' });
    s.push({ k: 'card', card: { kind: 'photos', title: 'Part 2', questions: p.studentQuestions, photos: p.studentPhotos, mine: true } });
    s.push({ k: 'say', id: `${t.id}-p2-sa` });
    s.push({ k: 'record', part: 2, label: 'Tu long turn (1 minuto)', prompt: `Compare two of the pictures. ${p.studentQuestions.join(' ')}`, maxSec: 60, exact: true });
    s.push({ k: 'say', id: 'frame-thanks' }, { k: 'say', id: `${t.id}-p2-pq` }, { k: 'say', id: `${t.id}-p2-pa` }, { k: 'say', id: 'frame-thanks' });
    s.push({ k: 'card', card: { kind: 'photos', title: 'Part 2', questions: p.partnerQuestions, photos: p.partnerPhotos, mine: false } });
    s.push({ k: 'say', id: `${t.id}-p2-pi` }, { k: 'say', id: `${t.id}-p2-pl` }, { k: 'say', id: 'frame-thanks' }, { k: 'say', id: `${t.id}-p2-sq` });
    s.push({ k: 'record', part: 2, label: 'Tu respuesta (30 segundos)', prompt: p.studentQuestion, maxSec: 30, exact: true });
    s.push({ k: 'card', card: null }, { k: 'say', id: 'frame-thanks' });
  }
  if (has(3)) {
    const p = t.p3;
    s.push({ k: 'card', card: { kind: 'mindmap', question: p.question, prompts: p.prompts } });
    s.push({ k: 'say', id: `${t.id}-p3-in` }, { k: 'think', sec: 15, label: 'Mira la tarea' }, { k: 'say', id: 'frame-p3Go' });
    p.partnerLines.forEach((_, i) => {
      s.push({ k: 'say', id: `${t.id}-p3-l${i}` });
      s.push({ k: 'record', part: 3, label: 'Tu turno', prompt: `Discussion with partner: ${p.question}`, maxSec: 30 });
    });
    s.push({ k: 'say', id: `${t.id}-p3-de` });
    p.decisionLines.forEach((_, i) => {
      s.push({ k: 'say', id: `${t.id}-p3-d${i}` });
      s.push({ k: 'record', part: 3, label: 'Tu turno (decidir)', prompt: `Reach a decision with your partner: ${p.decision}`, maxSec: 25 });
    });
    s.push({ k: 'say', id: 'frame-thanks' });
  }
  if (has(4)) {
    s.push({ k: 'card', card: has(3) ? { kind: 'text', title: 'Part 4', text: t.p3.question } : null }, { k: 'say', id: 'frame-p4Start' });
    t.p4.forEach((x, i) => {
      s.push({ k: 'say', id: `${t.id}-p4-q${i}` });
      s.push({ k: 'record', part: 4, label: 'Tu respuesta', prompt: x.q, maxSec: 45 });
      if (x.partner) {
        s.push({ k: 'say', id: `${t.id}-p4-a${i}` });
        s.push({ k: 'record', part: 4, label: 'Responde a tu compañero', prompt: `React to your partner, who said: "${x.partner}"`, maxSec: 20 });
      }
    });
    s.push({ k: 'card', card: null }, { k: 'say', id: 'frame-end' });
  }
  return s;
}

