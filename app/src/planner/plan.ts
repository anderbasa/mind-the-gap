// Sesión de hoy: con tu tiempo, si puedes hablar y tu energía, elige lo que más puntos te resta.
// Regla (explicable): prioridad = distancia a 180 + 1,5 × días sin practicar (máx. 10) + 0,5 × errores
// recientes (máx. 10). Cada tarea dice «por qué te toca hoy». Lógica pura: se puede probar sin pantalla.
import type { Skill } from '../domain/skills';

export interface CheckIn {
  minutes: number;
  canSpeak: boolean;
  energy: 'low' | 'normal' | 'high';
}

export interface PlannerState {
  /** Nota estimada por destreza (si hay diagnóstico). */
  scores: Partial<Record<Skill, number>>;
  /** Último día que practicaste cada destreza (ms). */
  lastBySkill: Partial<Record<Skill, number>>;
  /** Errores de los últimos 14 días por destreza. */
  recentErrors: Partial<Record<Skill, number>>;
  dueCards: number;
  nextGrammar: { id: string; title: string } | null;
  patterns: number;
  pendingSpeaking: boolean;
  /** Última actividad de cualquier tipo (ms), para la bienvenida tras días sin entrar. */
  lastActivity: number | null;
  hasDiagnostic: boolean;
  diagnosticNext: { label: string; route: string; minutes: number } | null;
}

export type TaskKind = 'vocab' | 'rue' | 'listening' | 'writing' | 'speaking' | 'grammar' | 'errors' | 'rephrase' | 'dictation' | 'diagnostic';

export interface PlanTask {
  id: string;
  kind: TaskKind;
  skill?: Skill;
  part?: string;
  title: string;
  why: string;
  minutes: number;
  route: string;
  done?: boolean;
  postponed?: boolean;
}

export interface Plan {
  tasks: PlanTask[];
  greeting: string;
  mode: 'minimum' | 'normal' | 'long';
  silent: boolean;
  priorities: { skill: Skill; score: number; why: string }[];
}

const TARGET = 180;
const DAY = 86_400_000;
const SKILLS: Skill[] = ['reading', 'uoe', 'writing', 'listening', 'speaking'];
const LABEL: Record<Skill, string> = { reading: 'Reading', uoe: 'Use of English', writing: 'Writing', listening: 'Listening', speaking: 'Speaking' };

export function daysSince(t: number | undefined | null, now: number): number {
  return t ? Math.max(0, Math.floor((now - t) / DAY)) : 14;
}

export function priorities(st: PlannerState, now: number): { skill: Skill; score: number; why: string }[] {
  return SKILLS.map((skill) => {
    const est = st.scores[skill];
    const distance = est == null ? 15 : Math.max(0, TARGET - est);
    const days = daysSince(st.lastBySkill[skill], now);
    const errs = Math.min(10, st.recentErrors[skill] ?? 0);
    const score = distance + 1.5 * Math.min(days, 10) + 0.5 * errs;
    const reasons: string[] = [];
    if (est != null) reasons.push(est < TARGET ? `estás en ≈${est}, a ${TARGET - est} de 180` : `ya estás en ≈${est}`);
    if (days >= 2) reasons.push(days >= 14 ? 'no la has practicado aún' : `llevas ${days} días sin practicarla`);
    if (errs >= 3) reasons.push(`${errs} errores en las dos últimas semanas`);
    return { skill, score, why: reasons.join(' · ') || 'para mantenerla' };
  }).sort((a, b) => b.score - a.score);
}

/** La actividad concreta de cada destreza según el tiempo y la energía. */
function activityFor(skill: Skill, left: number, ci: CheckIn, weekend: boolean, rot: number): Omit<PlanTask, 'id' | 'why'> | null {
  const light = ci.energy === 'low';
  switch (skill) {
    case 'uoe': {
      const parts = ['p4', 'p3', 'p2'];
      const p = parts[rot % parts.length];
      const min = p === 'p4' ? 12 : 10;
      return left >= min - 2 ? { kind: 'rue', skill, part: p, title: `Use of English · Part ${p[1]}`, minutes: min, route: `/practicar/rue/${p}?mode=practice` } : null;
    }
    case 'reading': {
      const long = !light && (weekend || ci.energy === 'high') && left >= 18;
      const p = long ? ['p5', 'p6', 'p7', 'p8'][rot % 4] : 'p1';
      const min = long ? 18 : 10;
      return left >= min - 2 ? { kind: 'rue', skill, part: p, title: `Reading · Part ${p[1]}`, minutes: min, route: `/practicar/rue/${p}?mode=practice` } : null;
    }
    case 'listening': {
      if (left < 8) return left >= 5 ? { kind: 'dictation', skill, title: 'Dictados (3 frases)', minutes: 5, route: '/practicar/listening/dictados' } : null;
      const p = ['l1', 'l3', 'l2', 'l4'][rot % 4];
      return { kind: 'listening', skill, part: p, title: `Listening · Part ${p[1]}`, minutes: p === 'l1' ? 8 : 10, route: `/practicar/listening/${p}?mode=practice` };
    }
    case 'writing':
      if (!light && left >= 45) return { kind: 'writing', skill, title: 'Writing completo (con corrección)', minutes: 45, route: '/practicar/writing' };
      return left >= 8 ? { kind: 'rephrase', skill, title: 'Reformular (estructuras C1 para el Writing)', minutes: 8, route: '/practicar/reformular' } : null;
    case 'speaking':
      if (!ci.canSpeak) return null;
      if (!light && left >= 15 && (weekend || ci.energy === 'high')) return { kind: 'speaking', skill, title: 'Role-play con Theo', minutes: 10, route: '/practicar/speaking/conversacion' };
      if (left >= 8) return { kind: 'speaking', skill, part: 'p2', title: 'Speaking · Part 2 (long turn de 1 minuto)', minutes: 6, route: '/practicar/speaking/simulacro?part=p2' };
      return left >= 4 ? { kind: 'speaking', skill, title: 'Long turn (entrenamiento)', minutes: 5, route: '/practicar/speaking/long-turn' } : null;
  }
}

export function buildPlan(st: PlannerState, ci: CheckIn, now = Date.now(), rot = 0): Plan {
  const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'Europe/Madrid' }).format(now);
  const weekend = day === 'Sat' || day === 'Sun';
  const away = st.lastActivity ? daysSince(st.lastActivity, now) : 0;
  const mode: Plan['mode'] = ci.minutes <= 7 ? 'minimum' : ci.minutes >= 60 && ci.energy !== 'low' ? 'long' : 'normal';
  const greeting =
    away >= 3
      ? `¡Qué bien volver a verte! Han pasado ${away} días: retomamos con calma, sin prisas.`
      : mode === 'minimum'
        ? 'Cinco minutos también cuentan. Vamos a lo más útil.'
        : ci.energy === 'low'
          ? 'Día flojo: hoy tareas cortas y llevaderas.'
          : weekend && mode === 'long'
            ? 'Fin de semana con tiempo: toca algo largo y de examen.'
            : 'Esto es lo que más puntos te da hoy.';

  const tasks: PlanTask[] = [];
  let left = ci.minutes;
  const add = (t: Omit<PlanTask, 'id'>) => {
    tasks.push({ ...t, id: `${t.kind}-${t.part ?? tasks.length}` });
    left -= t.minutes;
  };
  const prio = priorities(st, now);

  // Sin diagnóstico, lo primero es saber dónde estás.
  if (!st.hasDiagnostic && st.diagnosticNext && left >= Math.min(12, st.diagnosticNext.minutes)) {
    add({ kind: 'diagnostic', title: `Diagnóstico · ${st.diagnosticNext.label}`, why: 'Sin diagnóstico no sé dónde estás: es lo que más ayuda a planificar el resto.', minutes: Math.min(left, st.diagnosticNext.minutes), route: st.diagnosticNext.route });
  }

  // Modo mínimo: una sola cosa, la más útil.
  if (mode === 'minimum') {
    if (!tasks.length) {
      if (st.dueCards > 0) add({ kind: 'vocab', title: `Repaso de vocabulario (${Math.min(st.dueCards, 15)} tarjetas)`, why: 'Las tarjetas que vencen hoy se olvidan si las dejas.', minutes: 5, route: '/vocabulario/repaso' });
      else if (st.nextGrammar) add({ kind: 'grammar', title: `Gramática: ${st.nextGrammar.title}`, why: 'Dos o tres frases de un punto C1: rápido y suma en Writing y Speaking.', minutes: 5, route: `/practicar/gramatica/punto?id=${st.nextGrammar.id}` });
      else add({ kind: 'dictation', skill: 'listening', title: 'Dictados (3 frases)', why: 'Cinco minutos de oído y ortografía.', minutes: 5, route: '/practicar/listening/dictados' });
    }
    return { tasks, greeting, mode, silent: !ci.canSpeak, priorities: prio };
  }

  // 1) Vocabulario que vence hoy (corto, siempre primero).
  if (st.dueCards > 0) add({ kind: 'vocab', title: `Repaso de vocabulario (${Math.min(st.dueCards, 30)} tarjetas)`, why: 'Las tarjetas que vencen hoy: si las dejas, se olvidan y hay que empezar de nuevo.', minutes: Math.min(10, Math.max(4, Math.ceil(st.dueCards / 3))), route: '/vocabulario/repaso' });

  // 2) Speaking pendiente de otra sesión (si hoy se puede hablar).
  const order = [...prio];
  if (st.pendingSpeaking && ci.canSpeak) {
    const i = order.findIndex((p) => p.skill === 'speaking');
    if (i > 0) order.unshift(...order.splice(i, 1));
  }

  // 3) Destrezas por prioridad, con la actividad que quepa.
  let postponed: PlanTask | null = null;
  for (let k = 0; k < order.length && left >= 4; k++) {
    const p = order[k];
    if (p.skill === 'speaking' && !ci.canSpeak) {
      postponed = { id: 'speaking-postponed', kind: 'speaking', skill: 'speaking', title: 'Speaking', why: 'Hoy no puedes hablar en voz alta: queda pendiente para la próxima sesión en casa.', minutes: 0, route: '/practicar/speaking', postponed: true };
      continue;
    }
    const act = activityFor(p.skill, left, ci, weekend, rot + k);
    if (!act || act.minutes > left + 3) continue;
    const pendingNote = p.skill === 'speaking' && st.pendingSpeaking ? 'La dejaste pendiente la última vez · ' : '';
    add({ ...act, why: `${pendingNote}${LABEL[p.skill]}: ${p.why}.` });
    if (k >= 2 && mode !== 'long') break; // como mucho tres destrezas en una sesión normal
  }

  // 4) Si sobra tiempo: errores frecuentes o gramática.
  if (left >= 8 && st.patterns > 0) add({ kind: 'errors', title: 'Tus errores frecuentes', why: 'Practicar tus patrones de error es lo que más rápido sube la nota.', minutes: 8, route: '/cuaderno' });
  if (left >= 6 && st.nextGrammar) add({ kind: 'grammar', title: `Gramática: ${st.nextGrammar.title}`, why: 'Siguiente punto C1 sin dominar: lo usarás en Writing y Speaking.', minutes: Math.min(8, left), route: `/practicar/gramatica/punto?id=${st.nextGrammar.id}` });
  if (postponed) tasks.push(postponed);

  return { tasks, greeting, mode, silent: !ci.canSpeak, priorities: prio };
}
