// Perfil del alumno. Los valores reales NO están en el repo (que es público):
// se siembran en Firestore con `npm run seed` desde local/perfil.local.json
// y el onboarding los muestra para confirmarlos.
import { z } from 'zod';

export const ProfileSchema = z.object({
  name: z.string().default(''),
  age: z.string().default(''),
  city: z.string().default(''),
  studies: z.string().default(''),
  nativeLanguage: z.string().default('Castellano'),
  otherLanguages: z.string().default(''),
  currentLevel: z.string().default(''),
  goal: z.string().default(''),
  whyC1: z.string().default(''),
  examRules: z.string().default(''),
  examFormat: z.enum(['unknown', 'paper', 'computer']).default('unknown'),
  strugglesSpeaking: z.string().default(''),
  strugglesWriting: z.string().default(''),
  strugglesGeneral: z.string().default(''),
  englishOutside: z.string().default(''),
  availability: z.string().default(''),
  studyPlaces: z.string().default(''),
  devices: z.string().default(''),
  funDetails: z.string().default(''),
  interests: z.string().default(''),
  confirmedAt: z.number().nullable().default(null),
  changedAt: z.number().nullable().default(null),
});

export type Profile = z.infer<typeof ProfileSchema>;

export function parseProfile(raw: unknown): Profile {
  const r = ProfileSchema.safeParse(raw ?? {});
  return r.success ? r.data : ProfileSchema.parse({});
}

export interface ProfileFieldDef {
  key: keyof Profile;
  label: string;
  hint?: string;
  long?: boolean;
}

export const PROFILE_SECTIONS: { title: string; fields: ProfileFieldDef[] }[] = [
  {
    title: 'Sobre ti',
    fields: [
      { key: 'name', label: 'Nombre' },
      { key: 'age', label: 'Edad' },
      { key: 'city', label: 'Ciudad' },
      { key: 'studies', label: 'Qué estudias', long: true },
      { key: 'nativeLanguage', label: 'Lengua materna' },
    ],
  },
  {
    title: 'Tu inglés y tu objetivo',
    fields: [
      { key: 'currentLevel', label: 'Nivel / certificado actual', long: true },
      { key: 'goal', label: 'Objetivo', long: true },
      { key: 'whyC1', label: 'Para qué lo necesitas', long: true },
      { key: 'examRules', label: 'Condiciones que pone tu universidad', long: true },
    ],
  },
  {
    title: 'Lo que te cuesta',
    fields: [
      { key: 'strugglesGeneral', label: 'En general', long: true },
      { key: 'strugglesSpeaking', label: 'Al hablar', long: true },
      { key: 'strugglesWriting', label: 'Al escribir', long: true },
      { key: 'englishOutside', label: 'Inglés fuera de estudiar', long: true },
    ],
  },
  {
    title: 'Tu tiempo y tus sitios',
    fields: [
      { key: 'availability', label: 'Tiempo disponible', long: true },
      { key: 'studyPlaces', label: 'Dónde estudias', long: true },
      { key: 'devices', label: 'Dispositivos', long: true },
    ],
  },
];

export const EXAM_FORMATS: { value: Profile['examFormat']; label: string }[] = [
  { value: 'unknown', label: 'Aún no lo sé' },
  { value: 'paper', label: 'Papel' },
  { value: 'computer', label: 'Ordenador' },
];

/** Texto compacto del perfil para el system prompt de Theo. */
export function profileForPrompt(p: Profile): string {
  const lines: [string, string][] = [
    ['Name', p.name],
    ['Age', p.age],
    ['City', p.city],
    ['Studies', p.studies],
    ['Native language', p.nativeLanguage],
    ['Other languages', p.otherLanguages],
    ['Current level', p.currentLevel],
    ['Goal', p.goal],
    ['Why C1', p.whyC1],
    ['University requirements', p.examRules],
    ['Exam format', { unknown: 'not decided (practise both paper and computer)', paper: 'paper-based', computer: 'computer-based' }[p.examFormat]],
    ['Struggles (general)', p.strugglesGeneral],
    ['Struggles (speaking)', p.strugglesSpeaking],
    ['Struggles (writing)', p.strugglesWriting],
    ['English outside study', p.englishOutside],
    ['Availability', p.availability],
    ['Study places', p.studyPlaces],
    ['Devices', p.devices],
    ['Interests', p.interests],
    ['Fun personal details (use them in examples, with humour)', p.funDetails],
  ];
  return lines
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `- ${k}: ${v.trim()}`)
    .join('\n');
}
