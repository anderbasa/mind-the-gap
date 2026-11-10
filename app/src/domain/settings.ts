// Ajustes que se sincronizan entre dispositivos (Firestore: users/{uid}/meta/settings)
import { z } from 'zod';

const ModelRefSchema = z.object({
  provider: z.enum(['gemini', 'claude']),
  model: z.string(),
});

export const SettingsSchema = z.object({
  slowRate: z.number().min(0.5).max(1).default(0.8),
  geminiTier: z.enum(['free', 'paid']).default('free'),
  /** Apagado por defecto: Claude solo se usa si está encendido Y eliges «con Claude» en esa acción concreta. */
  claudeEnabled: z.boolean().default(false),
  claudeMonthlyCapUsd: z.number().min(0).default(5),
  providerOverrides: z.record(z.string(), z.array(ModelRefSchema)).default({}),
  readiness: z
    .object({
      globalMin: z.number().default(185),
      mocksNeeded: z.number().int().default(2),
      skillMin: z.number().default(170),
    })
    .default({ globalMin: 185, mocksNeeded: 2, skillMin: 170 }),
  srsNewPerDay: z.number().int().min(0).default(10),
  examDate: z.string().nullable().default(null),
});

export type Settings = z.infer<typeof SettingsSchema>;
export type ModelRef = z.infer<typeof ModelRefSchema>;

export function parseSettings(raw: unknown): Settings {
  const r = SettingsSchema.safeParse(raw ?? {});
  return r.success ? r.data : SettingsSchema.parse({});
}

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});
