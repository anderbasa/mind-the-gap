// Banco de lenguaje útil por tipo de texto: estructura, conectores y registro.
// Las frases están en inglés; las notas, en castellano.
import type { WritingType } from './tasks';

export interface LanguageBank {
  structure: { title: string; note: string }[];
  phrases: { group: string; items: string[] }[];
  register: string;
}

const LINKERS = [
  { group: 'Añadir', items: ['Furthermore,', 'What is more,', 'In addition to this,', 'Not only … but also …'] },
  { group: 'Contrastar', items: ['However,', 'Nevertheless,', 'On the other hand,', 'Whereas / While …', 'Admittedly, … but …'] },
  { group: 'Causa y consecuencia', items: ['As a result,', 'Consequently,', 'This is largely due to …', 'Owing to …', 'which in turn …'] },
  { group: 'Concluir', items: ['On balance,', 'All things considered,', 'Ultimately,', 'To sum up,'] },
];

export const LANGUAGE: Record<WritingType, LanguageBank> = {
  essay: {
    register: 'Formal e impersonal. Nada de contracciones (do not, it is). Usa estructuras impersonales: «It could be argued that…», «There is little doubt that…».',
    structure: [
      { title: 'Introducción', note: 'Presenta el tema y anuncia los dos puntos que vas a tratar. Sin opinión todavía.' },
      { title: 'Punto 1', note: 'Uno de los puntos de las notas: idea principal, ejemplo y consecuencia.' },
      { title: 'Punto 2', note: 'El segundo punto. Puedes usar alguna de las opiniones, con tus palabras.' },
      { title: 'Conclusión', note: 'Di cuál de los dos es más importante y POR QUÉ. Es lo que pide el enunciado: si falta, baja el Content.' },
    ],
    phrases: [
      { group: 'Abrir el tema', items: ['It is widely acknowledged that …', 'In recent years, there has been growing concern about …', 'This essay will consider two of the most frequently suggested measures: …'] },
      ...LINKERS,
      { group: 'Opinar con matices', items: ['It could be argued that …', 'There is a strong case for …', 'While … has its merits, …', 'This is not to say that …'] },
      { group: 'Decidir cuál es más importante', items: ['Of the two, … is arguably the more effective, since …', 'On balance, I would argue that … would have a greater impact because …'] },
    ],
  },
  letter: {
    register: 'Formal. Saludo y despedida formales; frases completas y corteses; nada de contracciones.',
    structure: [
      { title: 'Saludo y motivo', note: '«Dear Ms …,» / «Dear Sir or Madam,». Una frase con el motivo de la carta.' },
      { title: 'Lo que ganaste / lo positivo', note: 'Ejemplos concretos.' },
      { title: 'Problemas', note: 'Con tacto: describe sin atacar.' },
      { title: 'Sugerencias', note: 'Propuestas concretas, con verbos de recomendación.' },
      { title: 'Cierre', note: '«I look forward to hearing from you.» + «Yours sincerely,» (si sabes el nombre) o «Yours faithfully,» (si no).' },
    ],
    phrases: [
      { group: 'Empezar', items: ['I am writing in response to your request for feedback on …', 'I am writing to share my impressions of …'] },
      { group: 'Problemas, con tacto', items: ['One aspect that could be improved is …', 'I was somewhat disappointed to find that …', 'It would have been helpful if …'] },
      { group: 'Sugerir', items: ['I would strongly recommend that …', 'It might be worth considering …', 'Future participants would benefit from …'] },
      ...LINKERS.slice(0, 2),
    ],
  },
  email: {
    register: 'Informal o semiformal según a quién escribes. Con un amigo: contracciones, preguntas directas, «Anyway,» o «By the way,», pero bien organizado.',
    structure: [
      { title: 'Saludo y reacción', note: '«Hi Sam,» + reacciona a su mensaje («Great to hear from you!»).' },
      { title: 'Respuesta 1', note: 'La primera pregunta, con razones y ejemplos.' },
      { title: 'Respuesta 2', note: 'La segunda pregunta: consejos concretos.' },
      { title: 'Cierre', note: 'Ofrece ayuda y despídete: «Let me know what you decide!», «Best,» / «Take care,».' },
    ],
    phrases: [
      { group: 'Empezar', items: ['It was great to hear from you!', 'Sorry it’s taken me so long to get back to you.'] },
      { group: 'Aconsejar', items: ['If I were you, I’d …', 'You might want to …', 'Whatever you do, don’t …', 'It’s well worth …'] },
      { group: 'Conectar (informal)', items: ['Mind you,', 'Having said that,', 'On top of that,', 'Anyway,'] },
      { group: 'Cerrar', items: ['Let me know if there’s anything else you want to know.', 'Can’t wait to hear what you decide!'] },
    ],
  },
  proposal: {
    register: 'Formal, persuasivo y orientado al futuro. Usa títulos para cada sección.',
    structure: [
      { title: 'Introduction', note: 'Propósito de la propuesta en una o dos frases.' },
      { title: 'Situación actual', note: 'El problema, brevemente.' },
      { title: 'Sugerencia 1 / Sugerencia 2', note: 'Cada una con un título propio y su beneficio.' },
      { title: 'Coste / Conclusión', note: 'Cómo se pagaría y por qué merece la pena.' },
    ],
    phrases: [
      { group: 'Propósito', items: ['The aim of this proposal is to …', 'This proposal outlines …'] },
      { group: 'Sugerir', items: ['It is proposed that …', 'One option would be to …', 'A further suggestion is …'] },
      { group: 'Beneficios', items: ['This would enable students to …', 'The main advantage of this would be …', 'In the long term, this would …'] },
      { group: 'Financiar', items: ['This could be funded by …', 'The cost could be covered through …'] },
    ],
  },
  report: {
    register: 'Formal, objetivo e impersonal. Títulos por sección y lenguaje de evaluación; la opinión, al final.',
    structure: [
      { title: 'Introduction', note: 'Propósito del informe y de dónde salen los datos («Based on feedback from…»).' },
      { title: 'Lo que funcionó', note: 'Con evidencias.' },
      { title: 'Lo que funcionó peor', note: 'Igual de objetivo.' },
      { title: 'Recommendations', note: 'Recomendaciones concretas.' },
    ],
    phrases: [
      { group: 'Propósito', items: ['The purpose of this report is to …', 'This report is based on feedback collected from …'] },
      { group: 'Evaluar', items: ['The majority of students found …', 'By far the most popular feature was …', 'A significant number of participants felt that …', 'This proved less successful, largely because …'] },
      { group: 'Recomendar', items: ['It is recommended that …', 'It would be advisable to …', 'In light of the above, …'] },
    ],
  },
  review: {
    register: 'Neutral o semiformal y vivo: el lector debe querer seguir leyendo. Opina con claridad.',
    structure: [
      { title: 'Gancho', note: 'Abre con una pregunta o una frase que enganche.' },
      { title: 'Descripción breve', note: 'Qué es, sin contar demasiado.' },
      { title: 'Puntos fuertes y débiles', note: 'Con ejemplos concretos.' },
      { title: 'Recomendación', note: 'A quién se lo recomiendas y por qué; responde a lo que pide el enunciado.' },
    ],
    phrases: [
      { group: 'Enganchar', items: ['Have you ever wondered …?', 'If you are looking for …, look no further.'] },
      { group: 'Valorar', items: ['What makes it stand out is …', 'Where it falls short is …', 'It is let down by …', 'The highlight for me was …'] },
      { group: 'Recomendar', items: ['I would wholeheartedly recommend it to …', 'It is well worth …', 'It may not appeal to …, but …'] },
    ],
  },
};

/** Conectores habituales para el análisis de cohesión (se buscan en el texto). */
export const CONNECTORS = [
  'however', 'moreover', 'furthermore', 'in addition', 'also', 'besides', 'what is more', 'nevertheless', 'nonetheless',
  'on the other hand', 'on the contrary', 'whereas', 'while', 'although', 'even though', 'despite', 'in spite of',
  'therefore', 'thus', 'consequently', 'as a result', 'because', 'since', 'so', 'for example', 'for instance',
  'in conclusion', 'to sum up', 'on balance', 'firstly', 'secondly', 'finally', 'in my opinion', 'i think', 'but', 'and then',
];

/** La misma idea en los tres registros. */
export const REGISTER_EXAMPLES: { idea: string; formal: string; neutral: string; informal: string }[] = [
  {
    idea: 'Pedir información',
    formal: 'I would be grateful if you could provide further details regarding the course.',
    neutral: 'Could you tell me a bit more about the course?',
    informal: 'Any chance you could fill me in on the course?',
  },
  {
    idea: 'Dar una mala noticia',
    formal: 'I regret to inform you that the event has been postponed.',
    neutral: "I'm sorry to say that the event has been put off.",
    informal: "Bad news, I'm afraid – they've pushed the event back.",
  },
  {
    idea: 'Recomendar',
    formal: 'It is strongly recommended that participants arrive early.',
    neutral: "I'd recommend getting there early.",
    informal: 'Get there early, trust me.',
  },
];
