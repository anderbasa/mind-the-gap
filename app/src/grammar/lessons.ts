// Gramática C1: microlecciones (≤3 frases), ejemplo con bloques de colores por función y
// producción libre (la corrige Gemini). Se avanza con ~80 % de acierto en las 5 últimas.
export type Role = 'neg' | 'aux' | 'subj' | 'verb' | 'focus' | 'clause' | 'rest';

export const ROLE_ES: Record<Role, string> = {
  neg: 'expresión que provoca el cambio',
  aux: 'auxiliar',
  subj: 'sujeto',
  verb: 'verbo',
  focus: 'lo que se destaca',
  clause: 'oración',
  rest: 'resto',
};

export interface Lesson {
  id: string;
  title: string;
  es: string;
  blocks: [string, Role][];
  examples: string[];
  prompts: string[];
}

export const LESSONS: Lesson[] = [
  {
    id: 'inversion',
    title: 'Inversion after negative adverbials',
    es: 'Si empiezas con una expresión negativa o restrictiva (Never, Rarely, Not only, Little, No sooner…), el auxiliar va antes del sujeto, como en una pregunta. Si no hay auxiliar, usa do/does/did. Suena formal y enfático: ideal para el Writing.',
    blocks: [['Never before', 'neg'], ['had', 'aux'], ['I', 'subj'], ['seen', 'verb'], ['such a crowded beach.', 'rest']],
    examples: ['Not only did she pass, but she also came top.', 'Rarely do we see such commitment.', 'Little did he know what was coming.'],
    prompts: [
      'Rewrite starting with «Never»: I have never felt so nervous.',
      'Write a sentence about your studies starting with «Not only… but also».',
      'Rewrite starting with «Little»: He didn’t realise how important the meeting was.',
      'Rewrite starting with «No sooner»: As soon as I got home, it started to rain.',
      'Write a rule for an office starting with «Under no circumstances».',
    ],
  },
  {
    id: 'cleft',
    title: 'Cleft sentences',
    es: 'Para destacar una parte, «partes» la frase en dos: What + lo que destacas + is/was…, o It is/was + lo destacado + that/who… Dan mucho énfasis y suenan muy naturales al hablar.',
    blocks: [['What', 'focus'], ['annoys me most', 'clause'], ['is', 'verb'], ['the noise from the street.', 'rest']],
    examples: ['It was María who found the solution.', 'What I need is a break.', 'All I want is some peace and quiet.'],
    prompts: [
      'Rewrite starting with «What»: The price worries me most.',
      'Rewrite starting with «It was»: Pablo broke the window, not Luis.',
      'Write a sentence about your ideal job starting with «What I’d really like…».',
      'Rewrite starting with «All»: I only need five more minutes.',
      'Write a sentence starting with «The reason why… is that…».',
    ],
  },
  {
    id: 'participle',
    title: 'Participle clauses',
    es: 'Puedes cambiar una subordinada por un participio: Having finished (después de terminar), Not knowing (como no sabía), Built in 1900 (construida en 1900). El sujeto tiene que ser el mismo que el de la oración principal.',
    blocks: [['Having finished the report,', 'clause'], ['she', 'subj'], ['went', 'verb'], ['home.', 'rest']],
    examples: ['Not knowing the city, he got lost.', 'Built in 1900, the station is now a museum.', 'Feeling tired, I went to bed early.'],
    prompts: [
      'Rewrite with «Having…»: After I had read the contract, I signed it.',
      'Rewrite with «Not…»: Because she didn’t know the answer, she stayed quiet.',
      'Rewrite with a past participle: The bridge, which was designed by a local architect, opened in 2010.',
      'Write a sentence about your week starting with «Feeling…».',
      'Rewrite with «Having been…»: Because he had been warned, he was careful.',
    ],
  },
  {
    id: 'mixed',
    title: 'Mixed conditionals',
    es: 'Mezclan tiempos: condición pasada con resultado presente (If I had…, I would be…) o condición presente con resultado pasado (If I were…, I would have…). Sirven para hablar de cómo el pasado afecta al presente.',
    blocks: [['If I had taken', 'clause'], ['the job,', 'rest'], ['I', 'subj'], ['would be living', 'verb'], ['in London now.', 'rest']],
    examples: ['If I were more organised, I wouldn’t have missed the deadline.', 'If she hadn’t moved abroad, she wouldn’t speak such good English.'],
    prompts: [
      'Rewrite as a mixed conditional: I didn’t study medicine, so I’m not a doctor now.',
      'Rewrite as a mixed conditional: I’m not very patient, so I lost my temper yesterday.',
      'Write a mixed conditional about a decision you made last year.',
      'Write a mixed conditional starting with «If I spoke…».',
      'Rewrite: He missed the train, so he isn’t here now.',
    ],
  },
  {
    id: 'inverted-if',
    title: 'Conditionals without «if»',
    es: 'En registro formal puedes quitar «if» e invertir: Had I known (If I had known), Should you need (If you need), Were it not for (If it weren’t for). Muy útil en cartas formales y essays.',
    blocks: [['Had', 'aux'], ['I', 'subj'], ['known', 'verb'], ['about the traffic,', 'rest'], ['I would have left earlier.', 'clause']],
    examples: ['Should you need any help, please contact me.', 'Were it not for your support, I would have given up.'],
    prompts: [
      'Rewrite starting with «Had»: If we had booked earlier, we would have paid less.',
      'Rewrite starting with «Should»: If you have any questions, do not hesitate to ask.',
      'Rewrite starting with «Were it not for»: If it weren’t for the rain, the event would be perfect.',
      'Write the last sentence of a formal email starting with «Should you…».',
      'Rewrite starting with «Were»: If I were in your position, I would accept.',
    ],
  },
  {
    id: 'wish',
    title: 'Wish, if only, it’s time',
    es: 'Para lamentar el presente: wish + pasado (I wish I knew); para el pasado: wish + past perfect (I wish I had known). Para quejarte de lo que hace otro: wish + would. Y it’s (high) time + pasado: It’s time we left.',
    blocks: [['I', 'subj'], ['wish', 'verb'], ['I had studied', 'clause'], ['harder.', 'rest']],
    examples: ['If only I could speak Japanese.', 'I wish you would stop interrupting.', 'It’s high time we made a decision.'],
    prompts: [
      'Write a wish about something you regret from last year.',
      'Rewrite with «wish»: It’s a pity I can’t come to the party.',
      'Complain about a flatmate with «I wish you would…».',
      'Rewrite with «It’s high time»: We should start revising now.',
      'Write a sentence starting with «If only».',
    ],
  },
  {
    id: 'passive-report',
    title: 'Passive reporting structures',
    es: 'Para contar lo que dice o cree la gente sin decir quién: It is said that…, o sujeto + is said to + infinitivo (to have + participio si es pasado). Muy útil en reports y essays.',
    blocks: [['The company', 'subj'], ['is believed', 'verb'], ['to have lost', 'clause'], ['millions last year.', 'rest']],
    examples: ['It is said that the bridge is unsafe.', 'He is thought to be living abroad.'],
    prompts: [
      'Rewrite starting with «The minister»: People say that the minister is about to resign.',
      'Rewrite starting with «It is believed»: Experts believe prices will rise.',
      'Rewrite starting with «The thieves»: Police think the thieves escaped by car.',
      'Write a sentence about a famous person using «is said to have…».',
      'Rewrite starting with «The painting»: People claim that the painting is a fake.',
    ],
  },
  {
    id: 'past-modals',
    title: 'Modals of deduction in the past',
    es: 'Para deducir sobre el pasado: must have + participio (seguro que sí), can’t/couldn’t have (seguro que no), might/may/could have (quizá). Should have es crítica o arrepentimiento.',
    blocks: [['She', 'subj'], ['must have', 'aux'], ['forgotten', 'verb'], ['about the meeting.', 'rest']],
    examples: ['He can’t have seen us: he was in Madrid.', 'They might have missed the train.', 'You should have told me.'],
    prompts: [
      'Rewrite with «must have»: I’m sure he left early.',
      'Rewrite with «can’t have»: It’s impossible that she said that.',
      'Rewrite with «might have»: Perhaps they got lost.',
      'Write a sentence criticising a past decision with «should have».',
      'Your friend didn’t answer your calls yesterday. Write two possible explanations with past modals.',
    ],
  },
  {
    id: 'future-perfect',
    title: 'Future perfect and continuous',
    es: 'Will have + participio: algo terminado antes de un momento futuro (By June I will have finished). Will be + -ing: algo en curso en un momento futuro (This time tomorrow I’ll be flying).',
    blocks: [['By June,', 'rest'], ['I', 'subj'], ['will have finished', 'verb'], ['my degree.', 'rest']],
    examples: ['This time next year, I’ll be living in Lisbon.', 'By the time you arrive, we’ll have eaten.'],
    prompts: [
      'Write what you will have done by the end of this year.',
      'Write what you will be doing this time tomorrow.',
      'Complete: By the time the film starts, …',
      'Rewrite with the future perfect: I’ll finish the report before Friday.',
      'Write a sentence about your life in ten years with «will be + -ing».',
    ],
  },
  {
    id: 'emphasis',
    title: 'Emphasis: emphatic do and fronting',
    es: 'Para enfatizar en afirmativa: do/does/did + infinitivo (I did warn you). Para conceder: adjetivo o adverbio + as + sujeto + verbo (Hard as she tried, she failed). Much as I like it… = aunque me guste mucho.',
    blocks: [['Hard', 'focus'], ['as', 'neg'], ['she', 'subj'], ['tried,', 'verb'], ['she couldn’t open it.', 'clause']],
    examples: ['I do understand your point.', 'Much as I like him, I can’t agree.', 'Strange as it may seem, it’s true.'],
    prompts: [
      'Rewrite with emphatic «do»: I warned you about the traffic.',
      'Rewrite starting with «Tired as»: Although I was tired, I finished the essay.',
      'Rewrite starting with «Much as»: Although I love the city, I couldn’t live there.',
      'Write a sentence starting with «Strange as it may seem».',
      'Rewrite with emphatic «does»: She cares about her students.',
    ],
  },
  {
    id: 'relatives',
    title: 'Formal relative clauses',
    es: 'En registro formal la preposición va delante de whom/which (the person to whom I spoke). Con comas, la relativa añade información y no admite that. Ojo con most of whom, some of which.',
    blocks: [['The colleague', 'subj'], ['to whom', 'neg'], ['I spoke', 'clause'], ['was very helpful.', 'verb']],
    examples: ['She has two brothers, both of whom live abroad.', 'The report, which was published yesterday, is controversial.'],
    prompts: [
      'Rewrite formally with «to whom»: The man I sent the email to never replied.',
      'Join with «, most of whom»: There were 200 students. Most of them passed.',
      'Join with «, which»: He missed the deadline. This annoyed his manager.',
      'Rewrite formally with «in which»: That’s the office I work in.',
      'Write a sentence with «, some of which».',
    ],
  },
  {
    id: 'adverbs',
    title: 'Word order with adverbs',
    es: 'El adverbio de frecuencia va antes del verbo principal y después de be o del auxiliar (She often works late; She has never been late). Nunca entre el verbo y su objeto: I like coffee very much, no «I like very much coffee».',
    blocks: [['She', 'subj'], ['has', 'aux'], ['never', 'neg'], ['been', 'verb'], ['late for work.', 'rest']],
    examples: ['I speak English quite well.', 'We usually go out on Fridays.', 'They have always lived here.'],
    prompts: [
      'Correct the word order: I like very much living in Bilbao.',
      'Correct the word order: She speaks very well English.',
      'Correct the word order: I go always to the gym on Mondays.',
      'Write a sentence with «hardly ever» and the present perfect.',
      'Correct the word order: We have finished already the project.',
    ],
  },
];

export const getLesson = (id: string | null) => LESSONS.find((l) => l.id === id) ?? null;

/* ── Minijuego de idioms ──────────────────────────────────────── */

export const IDIOMS: { idiom: string; meaning: string }[] = [
  { idiom: 'the ball is in your court', meaning: 'it is your turn to decide or act' },
  { idiom: 'bite off more than you can chew', meaning: 'try to do more than you can manage' },
  { idiom: 'a piece of cake', meaning: 'very easy' },
  { idiom: 'cost an arm and a leg', meaning: 'be very expensive' },
  { idiom: 'hit the nail on the head', meaning: 'say exactly the right thing' },
  { idiom: 'on the same page', meaning: 'in agreement' },
  { idiom: 'under the weather', meaning: 'slightly ill' },
  { idiom: 'get the hang of something', meaning: 'learn how to do something' },
  { idiom: 'call it a day', meaning: 'stop working on something' },
  { idiom: 'back to square one', meaning: 'back to the beginning' },
  { idiom: 'beat around the bush', meaning: 'avoid saying something directly' },
  { idiom: 'break the ice', meaning: 'make people feel relaxed' },
  { idiom: 'in the long run', meaning: 'eventually, over a long period' },
  { idiom: 'keep an eye on', meaning: 'watch carefully' },
  { idiom: 'let the cat out of the bag', meaning: 'reveal a secret by accident' },
  { idiom: 'miss the boat', meaning: 'lose an opportunity' },
  { idiom: 'once in a blue moon', meaning: 'very rarely' },
  { idiom: 'pull someone’s leg', meaning: 'joke with someone' },
  { idiom: 'see eye to eye', meaning: 'agree completely' },
  { idiom: 'the tip of the iceberg', meaning: 'a small part of a bigger problem' },
  { idiom: 'think outside the box', meaning: 'think creatively' },
  { idiom: 'up in the air', meaning: 'not yet decided' },
  { idiom: 'take something with a pinch of salt', meaning: 'not completely believe something' },
  { idiom: 'cut to the chase', meaning: 'get to the point' },
];
