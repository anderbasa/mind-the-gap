// Role-plays de nivel C1 y conversación libre (Gemini Live, o por turnos si Live no está disponible).
export interface Scenario {
  id: string;
  title: string;
  es: string;
  role: string;
  goal: string;
  twist: string;
  minutes: number;
  /** No sale en la lista (p. ej. la conversación del diagnóstico). */
  hidden?: boolean;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'interview',
    title: 'Job interview in finance',
    es: 'Entrevista para unas prácticas de analista en un banco de inversión de Londres.',
    role: 'Sarah Whitlock, a senior associate interviewing graduates for a summer analyst internship at an investment bank in London. Professional, friendly but probing.',
    goal: 'The student is applying for the internship. They want to show motivation, explain their studies in business and finance, and handle difficult questions.',
    twist: 'At some point, ask an unexpected question (for example about a time they failed, or how they would value a small company) and politely challenge one of their answers.',
    minutes: 7,
  },
  {
    id: 'debate',
    title: 'Debate: free university',
    es: 'Debate sobre si la universidad debería ser gratuita. Theo defiende lo contrario que tú.',
    role: 'Theo, a sharp debating partner who always takes the opposite side to the student and defends it with good arguments, but changes his mind on points where the student is convincing.',
    goal: 'The student defends their view on whether university education should be free, gives reasons and examples, and responds to counter-arguments.',
    twist: 'Bring in a surprising statistic or example halfway through, and ask the student to concede at least one point.',
    minutes: 6,
  },
  {
    id: 'complaint',
    title: 'Complaint call',
    es: 'Llamas a tu compañía de móvil porque te han cobrado de más tres meses seguidos.',
    role: 'Gary, a customer service agent for a mobile phone company. Polite but initially unhelpful and keen to follow the script.',
    goal: 'The student has been overcharged for three months and wants a refund and an apology, without losing their temper.',
    twist: 'First offer only a partial refund; if they negotiate well, escalate to a better offer. Put them on hold once and come back with a complication.',
    minutes: 6,
  },
  {
    id: 'landlord',
    title: 'Negotiating with a landlord',
    es: 'Erasmus: la calefacción de tu piso no funciona y quieres que la arreglen y te bajen el alquiler.',
    role: 'Mrs Henderson, the landlady of a flat in Edinburgh rented by an Erasmus student. Friendly, a bit forgetful, and reluctant to spend money.',
    goal: 'The heating has been broken for two weeks. The student wants it fixed quickly and a discount on this month’s rent.',
    twist: 'Suggest a cheap temporary solution first, and mention that the repairman can only come in ten days. Agree to something only if they make a reasonable proposal.',
    minutes: 6,
  },
  {
    id: 'erasmus',
    title: 'Erasmus coordinator',
    es: 'Reunión con la coordinadora Erasmus para elegir destino: tu primera opción ya no tiene plazas.',
    role: 'Dr Patel, the international exchange coordinator at a UK partner university. Helpful, efficient and short of time.',
    goal: 'The student wants a place on a business exchange programme and needs to justify their choice of destination and courses.',
    twist: 'Tell them their first choice has no places left and ask them to compare two alternatives and justify their decision.',
    minutes: 6,
  },
  {
    id: 'free',
    title: 'Free conversation with Theo',
    es: 'Charla libre con Theo sobre lo que quieras: tu semana, la uni, noticias, planes.',
    role: 'Theo, the student’s English tutor: curious, warm, a dry sense of humour, genuinely interested in their life and opinions.',
    goal: 'The student chats naturally, tells stories and gives opinions at length.',
    twist: 'Pick up on something they mention and ask them to speculate, compare or tell a story about it.',
    minutes: 8,
  },
];

/** Conversación del diagnóstico: Theo charla contigo y anota en silencio. */
SCENARIOS.push({
  id: 'diag',
  title: 'Diagnostic conversation',
  es: 'Charla con Theo para medir tu nivel de Speaking. Él anota en silencio.',
  role: 'Theo, the student’s new English tutor, getting to know them in their first conversation. Friendly and relaxed, but you are quietly assessing their level, so you vary the type of question.',
  goal: 'The student talks about themselves and gives opinions so that Theo can measure their speaking level.',
  twist: 'Move from simple personal questions (studies, free time, plans) to asking them to compare and speculate, and finally to abstract opinion questions (technology, work, society), each a bit harder than the last.',
  minutes: 7,
  hidden: true,
});

export const getScenario = (id: string | null) => SCENARIOS.find((s) => s.id === id) ?? null;

/** Estrategias para el long turn (rellenar sin quedarse en blanco). */
export const LONG_TURN_TIPS: { es: string; en: string[] }[] = [
  { es: 'Gana tiempo sin silencio', en: ["That's an interesting one…", 'Let me think about that for a second.'] },
  { es: 'Compara', en: ['Whereas the first picture shows…, the second…', 'What both pictures have in common is…'] },
  { es: 'Especula', en: ['They might well be…', "I'd imagine they're feeling…", 'It looks as if…'] },
  { es: 'Si te quedas en blanco', en: ['What strikes me most is…', 'Another thing worth mentioning is…'] },
  { es: 'Cierra con una conclusión', en: ["All in all, I'd say…", 'So, if I had to choose,…'] },
];

/** Temas extra para el long turn, además de las fotos de la Parte 2. */
export const LONG_TURN_TOPICS: string[] = [
  'Describe a decision you made that changed your life, and say whether you would make the same decision again.',
  'Talk about a person you admire, and explain what others could learn from them.',
  'Compare studying in your home town with studying abroad. Which would suit you better, and why?',
  'Talk about a habit you would like to change, and how you might go about changing it.',
  'Describe a place that is special to you, and say how it has changed over the years.',
  'Talk about the advantages and disadvantages of working for a large company rather than a start-up.',
  'Explain how money and happiness are related, in your opinion.',
  'Talk about a skill that schools should teach but don’t, and why it matters.',
];
