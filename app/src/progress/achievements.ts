// Logros e hitos B2 → C1. Theo los celebra con datos concretos (qué hiciste, con qué nota), nunca con
// frases genéricas. Se guardan en users/{uid}/meta/achievements: { [id]: { at, text, seen } }.
import { signal } from '@preact/signals';
import { SKILL_ORDER, SKILLS, type Skill } from '../domain/skills';
import { LESSONS } from '../grammar/lessons';
import type { ScoreDoc } from '../scoring/estimate';
import { fullMocks, readiness, estimateAt, type Estimate } from '../scoring/readiness';
import { hasStore, settings, store } from '../state';
import type { DayDoc, Streak } from './rules';

export interface Ctx {
  now: number;
  scores: ScoreDoc[];
  estimate: Estimate;
  streak: Streak;
  days: DayDoc[];
  xpTotal: number;
  writings: { title: string; type: string; versions: { raw?: number; feedback?: { scores: Record<string, number> } }[] }[];
  speakings: { mode: string; title: string; scale: number; items: { durationMs: number; metrics?: { wpm: number; pauses: number; spanish?: number; seconds: number } }[] }[];
  attempts: { kind?: string; part?: string; mode?: string; marks?: number; max?: number }[];
  mastered: string[];
  grammarDone: number;
  readinessCrit: { globalMin: number; mocksNeeded: number; skillMin: number };
}

export interface Def {
  id: string;
  kind: 'milestone' | 'achievement';
  title: string;
  /** Cómo se consigue (se ve aunque no lo tengas). */
  how: string;
  /** Si ya lo tienes: la celebración concreta de Theo. */
  check: (c: Ctx) => string | null;
}

const lab = (k: Skill) => SKILLS[k].label;
const fmtSkills = (s: Partial<Record<Skill, number>>) =>
  SKILL_ORDER.filter((k) => s[k] != null)
    .map((k) => `${SKILLS[k].short} ${s[k]}`)
    .join(' · ');

export const DEFS: Def[] = [
  /* Hitos B2 → C1 */
  {
    id: 'first-diagnostic',
    kind: 'milestone',
    title: 'Punto de partida',
    how: 'Termina el diagnóstico de nivel.',
    check: (c) => {
      const d = [...c.scores].reverse().find((s) => s.kind === 'diagnostic');
      return d ? `Diagnóstico hecho: global ≈ ${d.overall} (${fmtSkills(d.skills)}). Desde aquí se mide todo lo que subas.` : null;
    },
  },
  {
    id: 'first-skill-180',
    kind: 'milestone',
    title: 'Primera destreza en C1',
    how: 'Que una destreza llegue a 180 en tu nota estimada.',
    check: (c) => {
      const up = SKILL_ORDER.filter((k) => (c.estimate.skills[k]?.value ?? 0) >= 180);
      if (!up.length) return null;
      const k = up.sort((a, b) => (c.estimate.skills[b]!.value - c.estimate.skills[a]!.value))[0];
      const rest = SKILL_ORDER.filter((x) => x !== k && c.estimate.skills[x]).map((x) => `${SKILLS[x].short} ${c.estimate.skills[x]!.value}`);
      return `${lab(k)} en ≈ ${c.estimate.skills[k]!.value}: ya es nivel C1.${rest.length ? ` Las demás: ${rest.join(' · ')}.` : ''}`;
    },
  },
  {
    id: 'longturn-60',
    kind: 'milestone',
    title: 'Un minuto entero sin pararte',
    how: 'Un long turn de 60 s (o más) sin pausas largas ni saltos al castellano.',
    check: (c) => {
      for (const s of c.speakings) {
        if (s.mode !== 'long-turn' && s.mode !== 'mock' && s.mode !== 'part') continue;
        const it = s.items.find((i) => i.durationMs >= 57_000 && i.metrics && i.metrics.pauses === 0 && !i.metrics.spanish);
        if (it) return `${Math.round(it.durationMs / 1000)} segundos seguidos hablando en «${s.title}», a ${it.metrics!.wpm} palabras por minuto y sin una sola pausa larga.`;
      }
      return null;
    },
  },
  {
    id: 'first-mock-pass',
    kind: 'milestone',
    title: 'Primer simulacro completo aprobado',
    how: 'Un simulacro completo (o un sample test oficial completo) con 180 o más de global.',
    check: (c) => {
      const m = [...fullMocks(c.scores)].reverse().find((x) => x.overall >= 180);
      return m ? `${m.label ?? 'Simulacro completo'}: ${m.overall} de global (${fmtSkills(m.skills)}). Eso es un C1 en condiciones de examen.` : null;
    },
  },
  {
    id: 'all-180',
    kind: 'milestone',
    title: 'Las cinco destrezas en C1',
    how: 'Todas las destrezas a 180 o más en tu nota estimada.',
    check: (c) =>
      c.estimate.complete && SKILL_ORDER.every((k) => (c.estimate.skills[k]?.value ?? 0) >= 180)
        ? `Las cinco por encima de 180: ${SKILL_ORDER.map((k) => `${SKILLS[k].short} ${c.estimate.skills[k]!.value}`).join(' · ')}. Ninguna te va a tirar la media.`
        : null,
  },
  {
    id: 'ready',
    kind: 'milestone',
    title: 'Listo para presentarte',
    how: 'Cumplir tu criterio de «¿Estoy listo?».',
    check: (c) => {
      const r = readiness(c.scores, c.readinessCrit, c.now);
      return r.ready ? `Tus últimos ${c.readinessCrit.mocksNeeded} simulacros completos: ${r.mocks.slice(0, c.readinessCrit.mocksNeeded).map((m) => m.overall).join(' y ')}, sin ninguna destreza por debajo de ${c.readinessCrit.skillMin}. Reserva fecha.` : null;
    },
  },
  /* Logros */
  {
    id: 'first-essay-15',
    kind: 'achievement',
    title: 'Essay de 15/20',
    how: 'Un essay corregido con 15/20 o más.',
    check: (c) => {
      for (const w of c.writings) {
        if (w.type !== 'essay') continue;
        const v = w.versions.find((x) => (x.raw ?? 0) >= 15);
        if (v) {
          const s = v.feedback?.scores;
          return `«${w.title}»: ${v.raw}/20${s ? ` (contenido ${s.content}, logro comunicativo ${s.communicative}, organización ${s.organisation}, lenguaje ${s.language})` : ''}. Un 15 en el essay es nota de C1.`;
        }
      }
      return null;
    },
  },
  {
    id: 'first-speaking-mock',
    kind: 'achievement',
    title: 'Primer speaking completo',
    how: 'El simulacro de Speaking con las 4 partes.',
    check: (c) => {
      const s = [...c.speakings].reverse().find((x) => x.mode === 'mock');
      if (!s) return null;
      const wpms = s.items.map((i) => i.metrics?.wpm).filter((x): x is number => !!x);
      return `«${s.title}» entero: ≈ ${s.scale}${wpms.length ? `, a ${Math.round(wpms.reduce((a, b) => a + b, 0) / wpms.length)} palabras por minuto de media` : ''}.`;
    },
  },
  {
    id: 'p4-perfect',
    kind: 'achievement',
    title: 'Part 4 perfecta',
    how: 'Todas las transformaciones de la Parte 4 bien, en modo examen.',
    check: (c) => {
      const a = c.attempts.find((x) => x.kind === 'rue' && x.part === 'p4' && x.mode === 'exam' && x.max && x.marks === x.max);
      return a ? `Part 4 en modo examen: ${a.marks}/${a.max}. La parte que más puntos quita, sin fallar ni una.` : null;
    },
  },
  {
    id: 'paper1-done',
    kind: 'achievement',
    title: 'Paper 1 de principio a fin',
    how: 'Las 8 partes del Reading & Use of English en un simulacro.',
    check: (c) => {
      const m = [...c.scores].reverse().find((s) => s.kind === 'mock' && (s.paper === 'rue' || s.paper === 'full') && s.skills.reading != null && s.skills.uoe != null);
      return m ? `Paper 1 completo: Reading ${m.skills.reading} y Use of English ${m.skills.uoe}. Hora y media de concentración.` : null;
    },
  },
  {
    id: 'grammar-all',
    kind: 'achievement',
    title: 'Gramática C1 dominada',
    how: `Los ${LESSONS.length} puntos de gramática dominados (4 de 5 bien en producción libre).`,
    check: (c) => (c.grammarDone >= LESSONS.length ? `Los ${LESSONS.length} puntos dominados (de «${LESSONS[0].title}» a «${LESSONS[LESSONS.length - 1].title}»), con frases tuyas y no rellenando huecos.` : null),
  },
  {
    id: 'words-100',
    kind: 'achievement',
    title: '100 palabras dominadas',
    how: '100 palabras que has usado bien 3 veces en tus writings y speakings.',
    check: (c) => (c.mastered.length >= 100 ? `100 palabras dominadas de verdad (usadas bien tres veces). Las últimas: ${c.mastered.slice(0, 5).join(', ')}.` : null),
  },
  {
    id: 'streak-7',
    kind: 'achievement',
    title: 'Una semana seguida',
    how: 'Racha de 7 días.',
    check: (c) => streakText(c, 7),
  },
  {
    id: 'streak-30',
    kind: 'achievement',
    title: 'Racha de 30 días',
    how: 'Racha de 30 días.',
    check: (c) => streakText(c, 30),
  },
  {
    id: 'xp-1000',
    kind: 'achievement',
    title: '1000 XP',
    how: 'Llegar a 1000 XP (los puntos débiles dan más).',
    check: (c) => (c.xpTotal >= 1000 ? `1000 XP, y la mayoría de lo que más te cuesta: ${topSkillsXp(c)}.` : null),
  },
];

function streakText(c: Ctx, n: number): string | null {
  if (c.streak.best < n) return null;
  const mins = Math.round(c.days.slice(0, n).reduce((a, d) => a + (d.activeSec ?? 0), 0) / 60);
  return `${n} días seguidos${c.streak.best > n ? ` (tu mejor racha: ${c.streak.best})` : ''}. En los últimos ${n} días: ${mins} minutos de estudio.`;
}

function topSkillsXp(c: Ctx): string {
  const tot: Record<string, number> = {};
  for (const d of c.days) for (const [k, v] of Object.entries(d.xpBySkill ?? {})) tot[k] = (tot[k] ?? 0) + (v ?? 0);
  return (
    Object.entries(tot)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([k, v]) => `${k === 'vocab' ? 'vocabulario' : SKILLS[k as Skill].label} (${v})`)
      .join(' y ') || '—'
  );
}

/** Logros que se cumplen con estos datos (puro: lo usan los tests). */
export function evaluate(c: Ctx): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of DEFS) {
    try {
      const t = d.check(c);
      if (t) out[d.id] = t;
    } catch {
      /* un logro roto no rompe los demás */
    }
  }
  return out;
}

/* ── Datos y celebración ──────────────────────────────────────── */

export interface Earned {
  at: number;
  text: string;
  seen?: boolean;
}
export const earned = signal<Record<string, Earned> | null>(null);

export async function loadEarned(): Promise<Record<string, Earned>> {
  if (!hasStore()) return {};
  const v = ((await store().get<Record<string, Earned>>('meta/achievements').catch(() => null)) ?? {}) as Record<string, Earned>;
  earned.value = v;
  return v;
}

async function gather(): Promise<Ctx> {
  const s = store();
  const [{ loadScores }, { loadProgress, progress }, { listCards }, { getGrammarProgress }] = await Promise.all([
    import('../scoring/readiness'),
    import('./progress'),
    import('../srs/srs'),
    import('../grammar/practice'),
  ]);
  const [scores, writings, speakings, attempts, cards, gprog] = await Promise.all([
    loadScores(),
    s.list<Ctx['writings'][number]>('writings', { orderBy: 'createdAt', desc: true, limit: 60 }).catch(() => []),
    s.list<Ctx['speakings'][number]>('speakings', { orderBy: 'at', desc: true, limit: 40 }).catch(() => []),
    s.list<Ctx['attempts'][number]>('attempts', { orderBy: 'at', desc: true, limit: 300 }).catch(() => []),
    listCards().catch(() => []),
    getGrammarProgress().catch(() => ({})),
  ]);
  const p = progress.value ?? (await loadProgress());
  const now = Date.now();
  return {
    now,
    scores,
    estimate: estimateAt(scores, now),
    streak: p!.streak,
    days: p!.days,
    xpTotal: p!.xpTotal,
    writings,
    speakings,
    attempts,
    mastered: cards.filter((c) => c.status === 'mastered').map((c) => c.front),
    grammarDone: Object.values(gprog as Record<string, { done?: boolean }>).filter((g) => g.done).length,
    readinessCrit: settings.value.readiness,
  };
}

let running = false;
let lastRun = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Comprueba logros nuevos (como mucho una vez por minuto). */
export async function checkAchievements(force = false): Promise<string[]> {
  if (!hasStore() || running || (!force && Date.now() - lastRun < 60_000)) return [];
  running = true;
  lastRun = Date.now();
  try {
    const [have, ctx] = await Promise.all([earned.value ?? loadEarned(), gather()]);
    const now = evaluate(ctx);
    const fresh = Object.keys(now).filter((id) => !have[id]);
    if (!fresh.length) return [];
    const patch: Record<string, Earned> = {};
    for (const id of fresh) patch[id] = { at: Date.now(), text: now[id], seen: false };
    await store().set('meta/achievements', patch as unknown as Record<string, unknown>, { merge: true });
    earned.value = { ...have, ...patch };
    void import('../tutor/notes').then((m) => m.updateTutorNotes(`New achievement(s): ${fresh.map((id) => DEFS.find((d) => d.id === id)?.title).join(', ')}`));
    return fresh;
  } finally {
    running = false;
  }
}

export function scheduleCheck(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void checkAchievements(true), 4000);
}

export async function markSeen(id: string): Promise<void> {
  const cur = earned.value?.[id];
  if (!cur) return;
  earned.value = { ...earned.value!, [id]: { ...cur, seen: true } };
  await store()
    .set('meta/achievements', { [id]: { seen: true } }, { merge: true })
    .catch(() => undefined);
}
