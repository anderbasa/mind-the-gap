// Comprobaciones deterministas de formato (primera pasada del validador).
// Devuelven la lista de problemas; vacía = formato correcto.
import { countWords, hasKeyword, normalize } from './marking';
import type { RueSet } from './schema';

export const wordsIn = (t: string) => t.replace(/\{\d+\}/g, ' ').split(/\s+/).filter(Boolean).length;

function gapOrder(text: string, count: number): string[] {
  const found = [...text.matchAll(/\{(\d+)\}/g)].map((m) => Number(m[1]));
  const want = Array.from({ length: count }, (_, i) => i + 1);
  return JSON.stringify(found) === JSON.stringify(want) ? [] : [`Los huecos deben ser {1}…{${count}} en orden y una vez cada uno (hay: ${found.join(',') || 'ninguno'}).`];
}

function sequential(items: { n: number }[]): string[] {
  return items.every((it, i) => it.n === i + 1) ? [] : ['Los ítems deben numerarse 1, 2, 3… en orden.'];
}

function range(label: string, n: number, min: number, max: number): string[] {
  return n < min || n > max ? [`${label}: ${n} palabras (debe estar entre ${min} y ${max}).`] : [];
}

function distinctOptions(opts: Record<string, string>, n: number): string[] {
  const v = Object.values(opts).map(normalize);
  return new Set(v).size === v.length ? [] : [`Ítem ${n}: hay opciones repetidas.`];
}

const oneWord = (w: string) => /^[a-z'-]+$/i.test(w.trim());

export function checkSet(set: RueSet): string[] {
  const p: string[] = [...sequential(set.items)];
  switch (set.part) {
    case 'p1':
      p.push(...gapOrder(set.text, 8), ...range('Texto', wordsIn(set.text), 150, 330));
      for (const it of set.items) p.push(...distinctOptions(it.options, it.n));
      break;
    case 'p2':
      p.push(...gapOrder(set.text, 8), ...range('Texto', wordsIn(set.text), 150, 330));
      for (const it of set.items) if (!it.answers.every(oneWord)) p.push(`Ítem ${it.n}: todas las respuestas deben ser una sola palabra.`);
      break;
    case 'p3':
      p.push(...gapOrder(set.text, 8), ...range('Texto', wordsIn(set.text), 150, 330));
      for (const it of set.items) {
        if (!/^[A-Z]+$/.test(it.base)) p.push(`Ítem ${it.n}: la palabra base debe ir en MAYÚSCULAS y ser una sola palabra.`);
        if (!it.answers.every(oneWord)) p.push(`Ítem ${it.n}: la respuesta debe ser una sola palabra.`);
        if (it.answers.some((a) => normalize(a) === normalize(it.base))) p.push(`Ítem ${it.n}: la respuesta no puede ser la palabra base sin cambios.`);
      }
      break;
    case 'p4':
      for (const it of set.items) {
        if (!/^[A-Z]+$/.test(it.keyword)) p.push(`Ítem ${it.n}: la palabra clave debe ir en MAYÚSCULAS y ser una sola palabra.`);
        for (const a of it.answers) {
          const wc = countWords(a);
          if (wc < 3 || wc > 6) p.push(`Ítem ${it.n}: «${a}» tiene ${wc} palabras (3–6).`);
          if (!hasKeyword(a, it.keyword)) p.push(`Ítem ${it.n}: «${a}» no contiene la palabra clave.`);
        }
        if (normalize(it.first) === normalize(`${it.before} ${it.answers[0]} ${it.after}`)) p.push(`Ítem ${it.n}: la segunda frase es idéntica a la primera.`);
      }
      break;
    case 'p5': {
      p.push(...range('Texto', wordsIn(set.text), 550, 900));
      const flat = normalize(set.text.replace(/\n+/g, ' '));
      for (const it of set.items) {
        p.push(...distinctOptions(it.options, it.n));
        if (!flat.includes(normalize(it.evidence).replace(/^["“]|["”]$/g, ''))) p.push(`Ítem ${it.n}: la cita de apoyo no aparece literalmente en el texto.`);
      }
      break;
    }
    case 'p6': {
      const letters = set.texts.map((t) => t.letter).join('');
      if (letters !== 'ABCD') p.push('Los textos deben ser A, B, C y D en orden.');
      for (const t of set.texts) p.push(...range(`Texto ${t.letter}`, wordsIn(t.text), 90, 230));
      break;
    }
    case 'p7': {
      p.push(...gapOrder(set.text, 6), ...range('Texto principal', wordsIn(set.text), 400, 800));
      const letters = set.paragraphs.map((x) => x.letter);
      if (new Set(letters).size !== 7) p.push('Los párrafos deben ser A–G sin repetir.');
      const used = set.items.map((i) => i.answer);
      if (new Set(used).size !== 6) p.push('Cada párrafo solo puede usarse una vez.');
      if (!used.every((l) => letters.includes(l))) p.push('Alguna respuesta no corresponde a ningún párrafo.');
      for (const x of set.paragraphs) p.push(...range(`Párrafo ${x.letter}`, wordsIn(x.text), 40, 140));
      break;
    }
    case 'p8': {
      const letters = set.sections.map((x) => x.letter);
      if (letters.join('') !== 'ABCDEF'.slice(0, letters.length)) p.push('Las secciones deben ser A, B, C… en orden.');
      for (const x of set.sections) p.push(...range(`Sección ${x.letter}`, wordsIn(x.text), 100, 240));
      for (const l of letters) if (!set.items.some((i) => i.answer === l)) p.push(`La sección ${l} no es respuesta de ninguna pregunta.`);
      if (!set.items.every((i) => letters.includes(i.answer))) p.push('Alguna respuesta no corresponde a ninguna sección.');
      break;
    }
  }
  return p;
}
