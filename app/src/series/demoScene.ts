// Solo para el modo demo: un fragmento inventado (no es de ninguna serie real) y la lección/corrección de ejemplo.

export const DEMO_SCENE = `- I can't believe you told Mum about the flat.
- I didn't tell her, she figured it out. She's not stupid.
- Right, so now she thinks we're moving out because of her.
- Well, aren't we? Be honest.
- That's not the point. You should have run it by me first.
- Fine. I'll sort it out tomorrow, I promise.
- You always say that, and then you bottle it.
- I won't this time. Anyway, it's not like we've signed anything yet.
- We're meant to sign on Friday!
- Then I've got until Friday to come clean, haven't I?`;

export const SERIES_LESSON = {
  title: 'The flat conversation',
  summary:
    'Two siblings argue because their mum has found out they are planning to move into a flat. One of them promises to talk to her before they sign the contract on Friday.',
  summaryEs: 'Dos hermanos discuten porque su madre se ha enterado de que piensan irse a un piso; uno promete hablar con ella antes de firmar el viernes.',
  register: 'Inglés británico muy coloquial (Mum, flat, bottle it), con frases cortas y bastante ironía.',
  vocab: [
    { term: 'figure something out', type: 'phrasal verb', level: 'B2', meaning: 'to understand or discover something by thinking', es: 'darse cuenta, deducir', quote: "I didn't tell her, she figured it out." },
    { term: 'move out', type: 'phrasal verb', level: 'B2', meaning: 'to leave the home where you live', es: 'irse de casa', quote: "Right, so now she thinks we're moving out because of her." },
    { term: 'run something by someone', type: 'idiom', level: 'C1', meaning: 'to tell someone about a plan to get their opinion', es: 'consultar algo con alguien', quote: 'You should have run it by me first.' },
    { term: 'sort something out', type: 'phrasal verb', level: 'B2', meaning: 'to solve a problem', es: 'arreglar, solucionar', quote: "Fine. I'll sort it out tomorrow, I promise." },
    { term: 'bottle it', type: 'slang', level: 'C2', meaning: 'to lose your courage at the last moment (British, informal)', es: 'rajarse, echarse atrás', quote: 'You always say that, and then you bottle it.' },
    { term: 'come clean', type: 'idiom', level: 'C1', meaning: 'to tell the truth about something you have hidden', es: 'confesar, decir la verdad', quote: "Then I've got until Friday to come clean, haven't I?" },
    { term: 'be meant to', type: 'expression', level: 'C1', meaning: 'to be supposed to', es: 'se supone que', quote: "We're meant to sign on Friday!" },
  ],
  grammar: [
    { point: 'should have + past participle (criticism)', quote: 'You should have run it by me first.', es: 'Critica algo que no se hizo en el pasado: «deberías habérmelo consultado».' },
    { point: 'Question tags', quote: "Then I've got until Friday to come clean, haven't I?", es: 'La coletilla repite el auxiliar en negativo; aquí suena irónica.' },
    { point: "it's not like + clause", quote: "it's not like we've signed anything yet.", es: 'Para quitar importancia: «tampoco es que hayamos firmado nada».' },
  ],
  gaps: [
    { word: 'believe', occurrence: 1, level: 1, hint: 'think something is true (verb)' },
    { word: 'figured', occurrence: 1, level: 2, hint: '___ it out = understood' },
    { word: 'moving', occurrence: 1, level: 1, hint: 'going to live somewhere else' },
    { word: 'honest', occurrence: 1, level: 1, hint: 'telling the truth (adjective)' },
    { word: 'point', occurrence: 1, level: 2, hint: "that's not the ___ = that's not what matters" },
    { word: 'run', occurrence: 1, level: 3, hint: '___ it by me = ask my opinion' },
    { word: 'sort', occurrence: 1, level: 2, hint: '___ it out = solve it' },
    { word: 'bottle', occurrence: 1, level: 3, hint: 'lose your nerve (British slang)' },
    { word: 'signed', occurrence: 1, level: 1, hint: 'put your name on a contract' },
    { word: 'meant', occurrence: 1, level: 3, hint: "we're ___ to = we're supposed to" },
    { word: 'clean', occurrence: 1, level: 3, hint: 'come ___ = tell the truth' },
  ],
  rephrase: [
    { quote: 'You should have run it by me first.', instruction: 'Say it in neutral, exam-appropriate English.', model: ['You ought to have consulted me first.', 'You should have asked for my opinion before doing it.'] },
    { quote: 'You always say that, and then you bottle it.', instruction: 'Rephrase it without slang.', model: ['You always say that and then lose your nerve.'] },
  ],
  questions: [
    { q: 'Why is one of the siblings annoyed?', answer: 'Because their mum found out about the flat before they had discussed how to tell her.' },
    { q: 'What deadline do they have, and why does it matter?', answer: 'They are supposed to sign on Friday, so they have to talk to their mum before then.' },
  ],
};

export const SERIES_CHECK = {
  rephrase: [
    { ok: true, corrected: 'You ought to have consulted me first.', comment: 'Correct and neutral: "ought to have consulted" keeps the criticism.' },
    { ok: false, corrected: 'You always say that and then you lose your nerve.', comment: '"Lose the courage" is not natural; we say "lose your nerve".' },
  ],
  questions: [
    { ok: true, comment: 'Clear and accurate.' },
    { ok: false, comment: '"They must to sign" → "they have to sign": modal verbs are not followed by "to".' },
  ],
};
