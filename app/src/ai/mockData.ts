// Respuestas JSON de ejemplo para el modo demo (localhost?demo): permiten ver las pantallas
// de corrección sin gastar cuota. No se usan nunca con la IA real.
import type { AiRequest } from './types';

const FEEDBACK = {
  scores: { content: 4, communicative: 3, organisation: 3, language: 3 },
  summary:
    'Right then: you answer the question and pick a winner, which is exactly what the task asks. What holds you back is range — the same few linking words and some Spanish-flavoured prepositions. Fix those and you are knocking on the door of 180.',
  topErrors: [
    {
      quote: 'depends of',
      correction: 'depends on',
      why: '“Depend” always takes “on”, never “of”.',
      example: 'Whether we go out depends on the weather.',
      category: 'preposition',
    },
    {
      quote: 'people is',
      correction: 'people are',
      why: '“People” is plural in English, unlike “la gente”.',
      example: 'Most people are aware of the problem.',
      category: 'grammar',
    },
    {
      quote: 'In conclusion',
      correction: 'On balance',
      why: 'Not wrong, but it is the B2 default; “On balance” signals that you have weighed both points.',
      example: 'On balance, tax incentives would have a greater impact.',
      category: 'cohesion',
    },
  ],
  otherErrors: [
    {
      quote: 'make a decision about save',
      correction: 'make a decision about saving',
      why: 'After a preposition, use the -ing form.',
      example: 'She is thinking about changing jobs.',
      category: 'grammar',
    },
  ],
  patterns: ['Prepositions copied from Spanish (depend of, interested on).', 'You rely on “However” and “Also” to link every idea.'],
  strengths: ['Clear paragraphing with one idea per paragraph.', 'You answer the question directly in the conclusion.'],
  upgrades: [
    {
      original: 'This is a very important thing for young people.',
      c1: 'This is of paramount importance to young people.',
      note: '“Of + abstract noun” sounds more formal and precise.',
    },
    {
      original: 'Schools do not teach this and it is a problem.',
      c1: 'What schools fail to teach is precisely what young people need most.',
      note: 'A cleft sentence puts the focus where you want it.',
    },
  ],
  cohesion: {
    comment: 'Four well-balanced paragraphs, but the second one jumps from education to rents without a link.',
    jumps: ['Paragraph 2: from financial education straight to rents — add a sentence that connects them.'],
    connectors: [{ connector: 'however', problem: 'Used three times, always at the start of a sentence.', alternatives: ['That said,', 'Even so,', 'Nonetheless,'] }],
  },
  repetition: [{ word: 'important', alternatives: ['crucial', 'vital', 'essential'], collocations: ['play a key role in', 'be of paramount importance'] }],
  modelVersion:
    'In recent years, there has been growing concern about how little young people manage to save.\n\nFinancial education at school is often proposed as the answer. While the curriculum is admittedly overloaded, learning to budget is arguably as essential as any other subject.\n\nTax advantages for savings accounts would offer a more immediate incentive. Young people tend to respond to rewards rather than lectures, and seeing their money grow could change their habits.\n\nOn balance, I would argue that tax incentives would have the greater impact, since they reward the behaviour we want to encourage.',
  rewrite: [
    { original: 'This is a very important thing for young people.', hint: 'Try a structure with “of + noun”.' },
    { original: 'However, schools do not teach it.', hint: 'Avoid starting with “However” again.' },
    { original: 'In conclusion I think taxes is better.', hint: 'Agreement + a C1 way to conclude.' },
  ],
};

const OCR = {
  text: 'In recent years, saving money has became very difficult for young people.\n\nFirstly, financial education at school could help them to understand [?] how to manage they money.',
  illegible: 1,
  confidence: 'medium',
  note: 'La segunda línea del párrafo 2 estaba algo borrosa.',
};

const CHECK = {
  verdict: 'minor',
  sameMeaning: true,
  followsInstruction: true,
  differentFromOthers: true,
  corrected: 'Never before had I seen such a crowded beach.',
  comment: 'The inversion is spot on; just watch the spelling of “crowded”.',
};

const SAY = {
  hadErrors: true,
  corrected: "Dear teacher, I am writing to you because I can't attend tomorrow's class.",
  errors: [
    { quote: 'I write you', correction: 'I am writing to you', why: 'Use the present continuous for the purpose of a letter, and “write to” someone.', category: 'tense' },
    { quote: 'assist to', correction: 'attend', why: '“Assist” means “help”; “asistir a clase” is “attend a class”.', category: 'vocabulary' },
  ],
  register: 'neutral',
  neutral: "Hello, I'm writing to let you know that I won't be able to come to tomorrow's class.",
  formal: "Dear Professor García, I am writing to inform you that I will be unable to attend tomorrow's class.",
  natural: "Hi! Just a quick note to say I can't make it to class tomorrow.",
  tip: '“Attend” is the verb for classes and meetings; “assist” is a false friend.',
};

const GENERATED = {
  items: [
    { topic: 'inversion', sentence: 'I have rarely eaten such a delicious meal.', instruction: 'Start with “Rarely…”.', models: ['Rarely have I eaten such a delicious meal.'] },
    { topic: 'passive', sentence: 'People think the company lost a lot of money last year.', instruction: 'Start with “The company…”.', models: ['The company is thought to have lost a lot of money last year.'] },
  ],
};

const LISTEN = {
  transcript: "Well, um, I think the main thing is that, er, both pictures show people who are, like, trying something new. [pause] In the first one the woman is learning guitar, whereas the man is at a computer class, and I'd imagine he finds it quite frustrating at first.",
  pronunciation: {
    comment: 'Generally easy to follow; a few vowel sounds and word stress patterns are influenced by Spanish.',
    issues: [
      { word: 'comfortable', heard: 'com-for-TA-ble', tip: 'Stress the first syllable: COMF-tə-bl.' },
      { word: 'think', heard: 'tink', tip: 'Put your tongue between your teeth for /θ/.' },
    ],
    strengths: ['Clear sentence rhythm', 'Good use of linking'],
  },
};

const ASSESS = {
  scores: { grammar: 3, vocabulary: 3, discourse: 3, pronunciation: 3, interaction: 4, global: 3 },
  summary: 'You kept going and compared the pictures, which is exactly the task. The fillers at the start cost you some fluency, and your vocabulary plays it safe: aim for more precise words.',
  errors: [
    { quote: 'people who are trying something new', correction: 'people trying something new', why: 'A reduced relative clause sounds more natural and concise.', example: 'People living abroad often feel homesick.', category: 'grammar' },
  ],
  sayItBetter: [{ original: 'he finds it quite frustrating', better: "he's probably finding it a real uphill struggle", note: 'Idiomatic and more vivid.' }],
  c1Resources: [{ resource: 'whereas (contrast)', quote: 'whereas the man is at a computer class' }, { resource: 'speculation: I\'d imagine', quote: "I'd imagine he finds it" }],
  missedResources: ['It looks as if…', 'What strikes me is…', 'They might well be…'],
  fluency: 'About 120 words per minute with several fillers at the start: once you get going, your pace is natural.',
  interaction: 'You responded to your partner but rarely asked for their opinion.',
  nextFocus: 'Start your long turn with a ready-made opener instead of "um, I think".',
};

const HELP = { phrase: 'a steep learning curve', example: "Learning to code has been a steep learning curve for me.", es: 'algo que cuesta mucho aprender al principio' };

export function mockJson(req: AiRequest): unknown | undefined {
  const sys = req.system ?? '';
  if (req.task === 'transcribe' && sys.includes('pronunciation')) return LISTEN;
  if (req.task === 'assess-speaking') return ASSESS;
  if (req.task === 'chat' && sys.includes('They got stuck')) return HELP;
  if (req.task === 'correct-writing') return FEEDBACK;
  if (req.task === 'ocr-writing') return OCR;
  if (req.task === 'rephrase') return sys.includes('MODE: Say it better') ? SAY : CHECK;
  if (req.task === 'generate' && sys.includes('MODE: Rephrasing generator')) return GENERATED;
  return undefined;
}
