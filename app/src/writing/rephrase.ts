// Reformular: una frase y una instrucción («empieza por Not only…», «usa despite»…).
// Escribes hasta 3 versiones distintas y cada una se corrige al momento (Gemini, gratis).
// Banco escrito a mano; «Generar más» solo cuando lo pulsas, y siempre gratis.
import { z } from 'zod';
import { runAI } from '../ai/client';
import { fill, getPrompt } from '../ai/prompts';
import { store } from '../state';

export const TOPICS = {
  inversion: 'Inversión',
  concession: 'Concesión',
  passive: 'Pasiva',
  wish: 'Wish / If only',
  conditionals: 'Condicionales',
  cleft: 'Cleft sentences',
  participle: 'Participle clauses',
  register: 'Registro',
  modals: 'Modales de deducción',
  causative: 'Causativa',
  comparison: 'Comparaciones',
  reported: 'Estilo indirecto',
  nominal: 'Nominalización',
} as const;

export type Topic = keyof typeof TOPICS;
export const TOPIC_IDS = Object.keys(TOPICS) as Topic[];

export interface RephraseItem {
  id: string;
  topic: Topic;
  sentence: string;
  instruction: string;
  /** Respuestas modelo (no las únicas válidas). */
  models: string[];
  source?: 'bank' | 'ai';
}

const B = (id: string, topic: Topic, sentence: string, instruction: string, models: string[]): RephraseItem => ({ id, topic, sentence, instruction, models, source: 'bank' });

export const REPHRASE_BANK: RephraseItem[] = [
  B('r-inv-1', 'inversion', 'I had never seen such a crowded beach before.', 'Start with “Never before…”.', ['Never before had I seen such a crowded beach.']),
  B('r-inv-2', 'inversion', 'She not only passed the exam but also got the highest mark in her class.', 'Start with “Not only…”.', [
    'Not only did she pass the exam, but she also got the highest mark in her class.',
  ]),
  B('r-inv-3', 'inversion', 'As soon as I sat down, the phone rang.', 'Start with “No sooner…”.', ['No sooner had I sat down than the phone rang.']),
  B('r-inv-4', 'inversion', 'We didn’t realise how serious the problem was until much later.', 'Start with “Only…” or “Not until…”.', [
    'Only much later did we realise how serious the problem was.',
    'Not until much later did we realise how serious the problem was.',
  ]),
  B('r-inv-5', 'inversion', 'You must not leave the lab unattended under any circumstances.', 'Start with “Under no circumstances…”.', [
    'Under no circumstances must you leave the lab unattended.',
    'Under no circumstances should the lab be left unattended.',
  ]),
  B('r-inv-6', 'inversion', 'He didn’t suspect at all that his colleagues were planning a surprise party.', 'Start with “Little…”.', [
    'Little did he suspect that his colleagues were planning a surprise party.',
  ]),
  B('r-con-1', 'concession', 'Although it was raining heavily, the match went ahead.', 'Use “despite”.', [
    'Despite the heavy rain, the match went ahead.',
    'Despite the fact that it was raining heavily, the match went ahead.',
  ]),
  B('r-con-2', 'concession', 'She tried very hard, but she couldn’t open the jar.', 'Start with “However hard…”.', ['However hard she tried, she couldn’t open the jar.']),
  B('r-con-3', 'concession', 'The hotel was expensive, but it was worth every penny.', 'Start with “Expensive as…”.', ['Expensive as the hotel was, it was worth every penny.']),
  B('r-con-4', 'concession', 'He has a lot of experience, but he didn’t get the job.', 'Use “in spite of”.', [
    'In spite of having a lot of experience, he didn’t get the job.',
    'In spite of his considerable experience, he didn’t get the job.',
  ]),
  B('r-pas-1', 'passive', 'People say that the old bridge is unsafe.', 'Start with “The old bridge…”.', ['The old bridge is said to be unsafe.']),
  B('r-pas-2', 'passive', 'Everyone believes the thieves escaped through the window.', 'Start with “The thieves…”.', ['The thieves are believed to have escaped through the window.']),
  B('r-pas-3', 'passive', 'Someone should have told us about the change of plan.', 'Start with “We…”.', ['We should have been told about the change of plan.']),
  B('r-pas-4', 'passive', 'They are going to build a new library next to the station.', 'Make it passive.', ['A new library is going to be built next to the station.']),
  B('r-wis-1', 'wish', 'I regret not studying harder for my exams.', 'Use “wish” or “If only”.', [
    'I wish I had studied harder for my exams.',
    'If only I had studied harder for my exams.',
  ]),
  B('r-wis-2', 'wish', 'It’s a pity you can’t come to the party.', 'Use “wish”.', ['I wish you could come to the party.']),
  B('r-wis-3', 'wish', 'Please stop interrupting me when I’m speaking.', 'Start with “I wish you…”.', [
    'I wish you would stop interrupting me when I’m speaking.',
    'I wish you wouldn’t interrupt me when I’m speaking.',
  ]),
  B('r-wis-4', 'wish', 'We should leave now.', 'Use “It’s (high) time…”.', ['It’s high time we left.', 'It’s time we left.']),
  B('r-cond-1', 'conditionals', 'If I had known about the traffic, I would have taken the train.', 'Start with “Had…”.', [
    'Had I known about the traffic, I would have taken the train.',
  ]),
  B('r-cond-2', 'conditionals', 'Without your help, I would have failed.', 'Start with “But for…” or “Had it not been…”.', [
    'But for your help, I would have failed.',
    'Had it not been for your help, I would have failed.',
  ]),
  B('r-cond-3', 'conditionals', 'I didn’t take the job, so I’m still living with my parents.', 'Use a mixed conditional starting with “If…”.', [
    'If I had taken the job, I wouldn’t still be living with my parents.',
  ]),
  B('r-cond-4', 'conditionals', 'You can borrow my car, but you must return it by six.', 'Use “provided that”.', [
    'You can borrow my car provided that you return it by six.',
    'Provided that you return it by six, you can borrow my car.',
  ]),
  B('r-cle-1', 'cleft', 'The noise from the street annoys me most.', 'Start with “What…”.', ['What annoys me most is the noise from the street.']),
  B('r-cle-2', 'cleft', 'María found the solution, not Pablo.', 'Start with “It was…”.', ['It was María who found the solution, not Pablo.']),
  B('r-cle-3', 'cleft', 'We only need more time.', 'Start with “All…”.', ['All we need is more time.']),
  B('r-par-1', 'participle', 'After she had finished the report, she sent it to her manager.', 'Start with “Having…”.', ['Having finished the report, she sent it to her manager.']),
  B('r-par-2', 'participle', 'Because he didn’t know the city, he got lost several times.', 'Use a participle clause starting with “Not…”.', [
    'Not knowing the city, he got lost several times.',
  ]),
  B('r-reg-1', 'register', 'Sorry, but we can’t give you your money back.', 'Make it formal: a company writing to a customer.', [
    'We regret that we are unable to offer you a refund.',
    'Unfortunately, we are unable to provide a refund.',
  ]),
  B('r-reg-2', 'register', 'The council should do something about the potholes, and fast.', 'Make it formal, for a report.', [
    'It is recommended that the council take urgent action to repair the potholes.',
  ]),
  B('r-reg-3', 'register', 'I am writing to inform you that I will be unable to attend the gathering.', 'Make it informal: an email to a friend.', [
    'Just to let you know, I can’t make it to the party.',
  ]),
  B('r-mod-1', 'modals', 'I’m sure she forgot about the meeting.', 'Use “must”.', ['She must have forgotten about the meeting.']),
  B('r-mod-2', 'modals', 'It’s impossible that he saw us: he was in Madrid.', 'Use “can’t”.', ['He can’t have seen us: he was in Madrid.']),
  B('r-mod-3', 'modals', 'It wasn’t necessary for you to bring a gift, but thank you.', 'Use “needn’t”.', ['You needn’t have brought a gift, but thank you.']),
  B('r-cau-1', 'causative', 'A mechanic is repairing my car this week.', 'Use “have something done”.', ['I’m having my car repaired this week.']),
  B('r-com-1', 'comparison', 'As you practise more, you become more confident.', 'Start with “The more…”.', ['The more you practise, the more confident you become.']),
  B('r-rep-1', 'reported', '“Don’t forget to lock the door,” my mum told me.', 'Use “remind”.', ['My mum reminded me to lock the door.']),
  B('r-rep-2', 'reported', '“I’m sorry I was late,” Tom said.', 'Use “apologise”.', ['Tom apologised for being late.']),
  B('r-nom-1', 'nominal', 'Prices rose sharply, which worried consumers.', 'Start with “The sharp…”.', ['The sharp rise in prices worried consumers.']),
  B('r-nom-2', 'nominal', 'The company decided to close the factory, and this shocked the workers.', 'Start with “The company’s decision…”.', [
    'The company’s decision to close the factory shocked the workers.',
  ]),
];

/* ── Corrección de una versión ──────────────────────────────────── */

export const CheckSchema = z.object({
  verdict: z.enum(['perfect', 'minor', 'wrong']),
  sameMeaning: z.boolean(),
  followsInstruction: z.boolean(),
  differentFromOthers: z.boolean(),
  corrected: z.string().describe("The student's version with the minimum changes needed to be perfect"),
  comment: z.string().describe("One or two sentences in English, in Theo's voice"),
});
export type Check = z.infer<typeof CheckSchema>;

export async function checkVersion(item: RephraseItem, answer: string, others: string[]): Promise<Check> {
  const r = await runAI({
    task: 'rephrase',
    system: fill(getPrompt('rephrase-check').body, {
      sentence: item.sentence,
      instruction: item.instruction,
      models: item.models.join(' | '),
      answer: answer.trim(),
      others: others.length ? others.map((o) => `- ${o}`).join('\n') : '(none)',
    }),
    messages: [{ role: 'user', parts: [{ text: 'Check my version. Return only the JSON.' }] }],
    schema: CheckSchema,
    maxTokens: 800,
    thinking: 'low',
    timeoutMs: 45_000,
    cache: true,
  });
  return r.data!;
}

/* ── Más frases (solo cuando lo pides; nunca de pago) ───────────── */

const GeneratedSchema = z.object({
  items: z
    .array(
      z.object({
        topic: z.enum(TOPIC_IDS as [Topic, ...Topic[]]),
        sentence: z.string().min(10),
        instruction: z.string().min(5),
        models: z.array(z.string().min(5)).min(1).max(3),
      }),
    )
    .min(1)
    .max(8),
});

export async function generateItems(topic: Topic | null, existing: RephraseItem[]): Promise<RephraseItem[]> {
  const sample = existing
    .filter((x) => !topic || x.topic === topic)
    .slice(0, 6)
    .map((x) => `- [${x.topic}] ${x.sentence} → ${x.instruction}`)
    .join('\n');
  const r = await runAI({
    task: 'generate',
    system: fill(getPrompt('rephrase-generate').body, {
      topics: topic ? topic : TOPIC_IDS.join(', '),
      examples: sample,
      avoid: existing.map((x) => x.sentence).slice(-40).join(' | '),
    }),
    messages: [{ role: 'user', parts: [{ text: 'Write 5 new items. Return only the JSON.' }] }],
    schema: GeneratedSchema,
    maxTokens: 3000,
    thinking: 'low',
    timeoutMs: 90_000,
    retries: 1,
    allowPaid: false, // generar frases nunca gasta saldo
  });
  const now = Date.now().toString(36);
  const items = r.data!.items.map((x, i) => ({ ...x, id: `r-ai-${now}-${i}`, source: 'ai' as const }));
  for (const it of items) await store().set(`rephraseBank/${it.id}`, { ...it, createdAt: Date.now() });
  return items;
}

export async function loadGenerated(): Promise<RephraseItem[]> {
  const rows = await store().list<RephraseItem>('rephraseBank', { limit: 300 });
  return rows.filter((r) => r.topic in TOPICS && r.sentence && r.instruction);
}
