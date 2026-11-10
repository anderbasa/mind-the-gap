// Enunciados de Writing al estilo del C1 Advanced. Originales: no copian material de Cambridge.
export type WritingType = 'essay' | 'letter' | 'email' | 'proposal' | 'report' | 'review';

export interface WritingTask {
  id: string;
  part: 1 | 2;
  type: WritingType;
  title: string;
  register: 'formal' | 'semi-formal' | 'neutral' | 'informal';
  /** Situación y enunciado, como en el examen. */
  context: string;
  /** Solo en el essay de la Parte 1. */
  notes?: { heading: string; points: string[]; opinions: string[] };
  instruction: string;
}

export const TYPE_LABEL: Record<WritingType, string> = {
  essay: 'Essay',
  letter: 'Letter',
  email: 'Email',
  proposal: 'Proposal',
  report: 'Report',
  review: 'Review',
};

const ESSAY_INSTRUCTION =
  'Write an essay discussing two of the points in your notes. You should explain which is more important, giving reasons in support of your answer. You may, if you wish, make use of the opinions expressed in the discussion, but you should use your own words as far as possible. Write your answer in 220–260 words in an appropriate style.';

export const WRITING_TASKS: WritingTask[] = [
  {
    id: 'w-essay-saving',
    part: 1,
    type: 'essay',
    title: 'Encouraging young people to save',
    register: 'formal',
    context: 'Your class has attended a panel discussion on what governments could do to encourage young people to save money. You have made the notes below.',
    notes: {
      heading: 'Ways to encourage young people to save',
      points: ['financial education at school', 'tax advantages for savings accounts', 'employers adding money to workers’ savings'],
      opinions: ['“Schools already have far too much to teach.”', '“Young people respond to rewards, not lectures.”', '“Saving feels pointless when rents are so high.”'],
    },
    instruction: ESSAY_INSTRUCTION,
  },
  {
    id: 'w-essay-traffic',
    part: 1,
    type: 'essay',
    title: 'Reducing traffic in cities',
    register: 'formal',
    context: 'Your class has attended a lecture on how cities could reduce traffic congestion. You have made the notes below.',
    notes: {
      heading: 'Ways to reduce traffic in city centres',
      points: ['charging drivers to enter the centre', 'improving public transport', 'encouraging people to work from home'],
      opinions: ['“Charges hit the poorest drivers hardest.”', '“Nobody will leave their car if the bus is unreliable.”', '“Not every job can be done from a kitchen table.”'],
    },
    instruction: ESSAY_INSTRUCTION,
  },
  {
    id: 'w-essay-work',
    part: 1,
    type: 'essay',
    title: 'Preparing students for work',
    register: 'formal',
    context: 'Your class has attended a panel discussion on how universities could better prepare students for the world of work. You have made the notes below.',
    notes: {
      heading: 'How universities could prepare students for work',
      points: ['compulsory work placements', 'better careers advice', 'teaching skills such as teamwork and presentation'],
      opinions: ['“A few weeks in an office teaches you more than a year of lectures.”', '“Careers services are usually understaffed.”', '“Soft skills can’t really be taught in a classroom.”'],
    },
    instruction: ESSAY_INSTRUCTION,
  },
  {
    id: 'w-essay-health',
    part: 1,
    type: 'essay',
    title: 'Encouraging healthier lifestyles',
    register: 'formal',
    context: 'Your class has attended a lecture on how governments could encourage people to lead healthier lives. You have made the notes below.',
    notes: {
      heading: 'Ways to encourage healthier lifestyles',
      points: ['taxes on sugary food and drinks', 'free access to sports facilities', 'public information campaigns'],
      opinions: ['“People should be free to eat what they like.”', '“Most people would exercise more if it didn’t cost anything.”', '“Nobody pays attention to adverts telling them what to do.”'],
    },
    instruction: ESSAY_INSTRUCTION,
  },
  {
    id: 'w-letter-exchange',
    part: 2,
    type: 'letter',
    title: 'Feedback on an exchange programme',
    register: 'formal',
    context:
      'You recently took part in a two-week international exchange programme organised by a European youth organisation. The director of the organisation has asked participants to write to her, explaining what they gained from the programme, describing any problems they experienced, and suggesting how the programme could be improved for future participants.',
    instruction: 'Write your letter in 220–260 words in an appropriate style.',
  },
  {
    id: 'w-email-semester',
    part: 2,
    type: 'email',
    title: 'Advice for a friend going to Spain',
    register: 'informal',
    context:
      'You have received this email from your English-speaking friend, Sam: “I’m thinking of spending a semester studying in Spain next year, but I can’t decide between a big city and a smaller university town. You know Spain well – which would you recommend, and why? And what should I do to make the most of the experience?”',
    instruction: 'Write your email in reply in 220–260 words in an appropriate style.',
  },
  {
    id: 'w-proposal-international',
    part: 2,
    type: 'proposal',
    title: 'Better services for international students',
    register: 'formal',
    context:
      'The student council at your university wants to improve the services offered to international students. You have been asked to write a proposal suggesting two improvements, explaining how they would benefit international students, and saying how they could be paid for.',
    instruction: 'Write your proposal in 220–260 words in an appropriate style.',
  },
  {
    id: 'w-proposal-sportsclub',
    part: 2,
    type: 'proposal',
    title: 'Attracting young members to a sports club',
    register: 'formal',
    context:
      'A local sports club has noticed that very few people under 25 are joining. The manager has invited members to write a proposal describing why young people may not be interested at the moment, suggesting changes that would attract them, and explaining how the club as a whole would benefit.',
    instruction: 'Write your proposal in 220–260 words in an appropriate style.',
  },
  {
    id: 'w-report-careersfair',
    part: 2,
    type: 'report',
    title: 'Report on a careers fair',
    register: 'formal',
    context:
      'Your university recently held a careers fair for final-year students. The head of department has asked you to write a report on the event, outlining which parts were most useful, explaining which were less successful, and recommending changes for next year’s fair.',
    instruction: 'Write your report in 220–260 words in an appropriate style.',
  },
  {
    id: 'w-report-foodwaste',
    part: 2,
    type: 'report',
    title: 'Evaluating a food-waste scheme',
    register: 'formal',
    context:
      'You work part-time in a café that introduced a scheme six months ago to reduce food waste. Your manager has asked you to write a report describing how the scheme works, evaluating how successful it has been for the business and its customers, and recommending whether it should continue in its current form.',
    instruction: 'Write your report in 220–260 words in an appropriate style.',
  },
  {
    id: 'w-review-app',
    part: 2,
    type: 'review',
    title: 'Review of a learning app',
    register: 'neutral',
    context:
      'An international website for students is inviting reviews of apps that help people learn. Write a review of an app you have used, explaining what it does well and what it does less well, and saying whether you would recommend it to students preparing for an important exam.',
    instruction: 'Write your review in 220–260 words in an appropriate style.',
  },
  {
    id: 'w-review-sportsfilm',
    part: 2,
    type: 'review',
    title: 'Review of a sports film or series',
    register: 'neutral',
    context:
      'A film website is asking readers to review a film or series that deals with sport. Briefly describe it, explain what made it interesting or disappointing, and say whether it would appeal to people who are not sports fans.',
    instruction: 'Write your review in 220–260 words in an appropriate style.',
  },
];

export function getTask(id: string): WritingTask | undefined {
  return WRITING_TASKS.find((t) => t.id === id);
}

/** El enunciado completo en texto, para enviarlo al corrector. */
export function taskAsText(t: WritingTask): string {
  const lines = [`C1 Advanced Writing Part ${t.part} — ${TYPE_LABEL[t.type]} (register: ${t.register})`, '', t.context];
  if (t.notes) {
    lines.push('', `NOTES — ${t.notes.heading}:`, ...t.notes.points.map((p, i) => `${i + 1}. ${p}`), '', 'Opinions expressed in the discussion:', ...t.notes.opinions);
  }
  lines.push('', t.instruction);
  return lines.join('\n');
}
