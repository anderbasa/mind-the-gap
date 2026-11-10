// Temas: mezcla de temas típicos del examen y los intereses del alumno (sección 6 del documento).
export const EXAM_TOPICS = [
  'the psychology of habits and routines',
  'urban design and liveable cities',
  'the future of museums',
  'why we find it hard to switch off from work',
  'sleep, memory and learning',
  'the ethics of advertising to young people',
  'citizen science projects',
  'the comeback of vinyl records and analogue hobbies',
  'volunteering and what people gain from it',
  'the history and science of coffee',
  'rewilding the countryside',
  'how languages borrow words from each other',
  'the appeal of true-crime podcasts',
  'minimalism and owning less',
  'architecture that changed how people live',
  'the role of failure in creativity',
  'food waste and supermarkets',
  'the science of happiness at work',
  'space tourism and who pays for it',
  'the art of persuasion and public speaking',
];

export const INTEREST_TOPICS = [
  'behavioural finance: why smart people make bad money decisions',
  'how young people should start investing',
  'the economics of football transfers',
  'data analytics in professional football',
  'artificial intelligence in the workplace',
  'should students be allowed to use AI tools?',
  'the Erasmus experience: studying abroad',
  'budget travel and overtourism',
  'fintech and the end of cash',
  'the gig economy and young workers',
  'sports psychology and pressure',
  'start-ups founded by university students',
];

/** Elige un tema evitando los usados recientemente. ~40 % de las veces, de tus intereses. */
export function pickTopic(recent: string[], random = Math.random): string {
  const pool = random() < 0.4 ? INTEREST_TOPICS : EXAM_TOPICS;
  const fresh = pool.filter((t) => !recent.some((r) => r.toLowerCase().includes(t.slice(0, 18).toLowerCase())));
  const list = fresh.length ? fresh : pool;
  return list[Math.floor(random() * list.length)];
}
