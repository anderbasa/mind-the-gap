// Representación en texto plano de un ejercicio (para el validador y, más adelante, para imprimir).
import { examNumber } from './marking';
import { PARTS, type RueSet } from './schema';

const gapsAsExam = (text: string, part: RueSet['part']) => text.replace(/\{(\d+)\}/g, (_, n) => `(${examNumber(part, Number(n))}) ______`);

/** `withKey`: incluye la clave (para revisar partes abiertas). */
export function renderSet(set: RueSet, withKey = false): string {
  const head = `${PARTS[set.part].name}\n${PARTS[set.part].instructions}\n\n${set.title}\n`;
  const num = (n: number) => examNumber(set.part, n);
  switch (set.part) {
    case 'p1':
      return (
        head +
        `\n${gapsAsExam(set.text, set.part)}\n\n` +
        set.items.map((it) => `${num(it.n)}  A ${it.options.A}   B ${it.options.B}   C ${it.options.C}   D ${it.options.D}${withKey ? `   [key: ${it.answer}]` : ''}`).join('\n')
      );
    case 'p2':
      return head + `\n${gapsAsExam(set.text, set.part)}` + (withKey ? '\n\nKEY\n' + set.items.map((it) => `${num(it.n)}: ${it.answers.join(' / ')}`).join('\n') : '');
    case 'p3':
      return (
        head +
        `\n${gapsAsExam(set.text, set.part)}\n\nSTEM WORDS\n` +
        set.items.map((it) => `${num(it.n)}: ${it.base}${withKey ? `   [key: ${it.answers.join(' / ')}]` : ''}`).join('\n')
      );
    case 'p4':
      return (
        head +
        '\n' +
        set.items
          .map(
            (it) =>
              `${num(it.n)}  ${it.first}\n    ${it.keyword}\n    ${it.before} ______ ${it.after}` +
              (withKey ? `\n    [key: ${it.answers.join(' / ')} | marking halves: ${it.chunks.map((c) => c.join(' / ')).join(' + ')}]` : ''),
          )
          .join('\n\n')
      );
    case 'p5':
      return (
        head +
        `\n${set.text}\n\n` +
        set.items.map((it) => `${num(it.n)}  ${it.question}\n  A ${it.options.A}\n  B ${it.options.B}\n  C ${it.options.C}\n  D ${it.options.D}${withKey ? `\n  [key: ${it.answer}]` : ''}`).join('\n\n')
      );
    case 'p6':
      return (
        head +
        `\n${set.intro}\n\n` +
        set.texts.map((t) => `${t.letter} — ${t.author}\n${t.text}`).join('\n\n') +
        '\n\nWhich writer…\n' +
        set.items.map((it) => `${num(it.n)}  ${it.question}${withKey ? `   [key: ${it.answer}]` : ''}`).join('\n')
      );
    case 'p7':
      return (
        head +
        `\n${set.text.replace(/\{(\d+)\}/g, (_, n) => `[GAP ${examNumber(set.part, Number(n))}]`)}\n\nREMOVED PARAGRAPHS\n` +
        set.paragraphs.map((x) => `${x.letter}  ${x.text}`).join('\n\n') +
        (withKey ? '\n\nKEY\n' + set.items.map((it) => `${num(it.n)}: ${it.answer}`).join('\n') : '')
      );
    case 'p8':
      return (
        head +
        `\n${set.intro}\n\n` +
        set.sections.map((x) => `${x.letter} — ${x.heading}\n${x.text}`).join('\n\n') +
        '\n\nIn which section…\n' +
        set.items.map((it) => `${num(it.n)}  ${it.statement}${withKey ? `   [key: ${it.answer}]` : ''}`).join('\n')
      );
  }
}
