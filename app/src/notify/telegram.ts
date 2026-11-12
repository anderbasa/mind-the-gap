// Avisos por Telegram: cuándo toca cada mensaje y qué dice. Funciones puras: las usa el script
// de GitHub Actions (scripts/telegram.mjs, con Node) y los tests. Sin imports de código en tiempo
// de ejecución (solo tipos), para que Node pueda cargar este .ts tal cual.
import type { PlanTask } from '../planner/plan';
import type { DayDoc, Streak } from '../progress/rules';

export interface TelegramSettings {
  daily: boolean;
  /** Hora de Madrid del mensaje de mediodía (14 = entre las 14:00 y las 15:00). */
  hour: number;
  evening: boolean;
  eveningHour: number;
  sunday: boolean;
  sundayHour: number;
}
export const DEFAULT_TELEGRAM: TelegramSettings = { daily: true, hour: 14, evening: true, eveningHour: 21, sunday: true, sundayHour: 19 };

export type Kind = 'daily' | 'evening' | 'sunday';
export type Sent = Partial<Record<Kind, string>>;

export interface MadridNow {
  date: string; // AAAA-MM-DD
  hour: number;
  /** 0 = lunes … 6 = domingo */
  weekday: number;
}

export function madridNow(now: number): MadridNow {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday: wd };
}

/** Qué mensajes tocan ahora (cada uno, como mucho una vez al día). */
export function due(now: number, cfg: TelegramSettings, sent: Sent, streak: Streak): Kind[] {
  const m = madridNow(now);
  const out: Kind[] = [];
  // Mediodía: dentro de su hora (el cron prueba dos veces por hora).
  if (cfg.daily && m.hour === cfg.hour && sent.daily !== m.date) out.push('daily');
  // Noche: solo si la racha está en juego (hoy aún no cuenta).
  if (cfg.evening && m.hour >= cfg.eveningHour && sent.evening !== m.date && !streak.todayDone && streak.current > 0) out.push('evening');
  // Domingo: resumen de la semana.
  if (cfg.sunday && m.weekday === 6 && m.hour >= cfg.sundayHour && sent.sunday !== m.date) out.push('sunday');
  return out;
}

/* ── Textos (HTML de Telegram: solo <b>, <i>, <a>) ─────────────── */

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function streakLine(s: Streak): string {
  if (s.current === 0) return 'Racha: empieza hoy (10 minutos bastan).';
  const wc = s.wildcardFree ? 'comodín de la semana libre' : 'comodín de la semana gastado';
  return `Racha: <b>${s.current} ${s.current === 1 ? 'día' : 'días'}</b> · ${wc}.`;
}

export function dailyText(p: { tasks: PlanTask[]; greeting?: string; challenge?: string | null; streak: Streak; examDays?: number | null; stale?: boolean }): string {
  const lines: string[] = [];
  lines.push(`<b>${esc(p.greeting || 'Hola.')}</b>`);
  if (p.examDays != null && p.examDays >= 0) lines.push(`Examen en <b>${p.examDays} ${p.examDays === 1 ? 'día' : 'días'}</b>.`);
  lines.push(streakLine(p.streak));
  if (p.tasks.length) {
    const total = p.tasks.reduce((a, t) => a + t.minutes, 0);
    lines.push('', `<b>Sesión sugerida (~${total} min)</b>`);
    p.tasks.forEach((t, i) => lines.push(`${i + 1}. ${esc(t.title)} (${t.minutes} min)${i === 0 || i === 1 ? `\n   <i>${esc(t.why)}</i>` : ''}`));
  }
  else lines.push('', 'Abre la app y Theo te prepara la sesión de hoy según tus puntos débiles.');
  if (p.challenge) lines.push('', `<b>Mini reto de Theo:</b> ${esc(p.challenge)}`);
  if (p.stale) lines.push('', '<i>Calculado con tus datos de la última vez que abriste la app.</i>');
  return lines.join('\n');
}

export function eveningText(p: { streak: Streak; todayMin: number }): string {
  const left = Math.max(1, 10 - p.todayMin);
  const lines = [`<b>Tu racha de ${p.streak.current} ${p.streak.current === 1 ? 'día' : 'días'} está en juego.</b>`];
  lines.push(p.todayMin > 0 ? `Hoy llevas ${p.todayMin} min: te ${left === 1 ? 'falta 1 minuto' : `faltan ${left} minutos`}.` : 'Hoy aún no has estudiado: con 10 minutos basta.');
  lines.push(p.streak.wildcardFree ? 'Si hoy no puedes, el comodín de la semana te la guarda (pero solo hay uno).' : 'El comodín de esta semana ya está gastado: si hoy no estudias, vuelve a 0.');
  lines.push('', 'Lo más rápido: el modo mínimo de 5 min (repaso de tarjetas y una reformulación).');
  return lines.join('\n');
}

export function sundayText(p: { week: DayDoc[]; streak: Streak; estimate?: { overall: number; margin: number } | null; report?: { summary: string; focus: string[] } | null; examDays?: number | null }): string {
  const min = Math.round(p.week.reduce((a, d) => a + (d.activeSec ?? 0), 0) / 60);
  const xp = p.week.reduce((a, d) => a + (d.xp ?? 0), 0);
  const counted = p.week.filter((d) => (d.activeSec ?? 0) >= 600 || d.sessionDone).length;
  const lines = ['<b>Tu semana</b>', `${min} min de estudio · ${xp} XP · ${counted} de 7 días que cuentan.`, streakLine(p.streak)];
  if (p.estimate) lines.push(`Nota estimada: <b>≈ ${p.estimate.overall}</b> ± ${p.estimate.margin}${p.estimate.overall < 180 ? ` (te faltan unos ${180 - p.estimate.overall} para el C1)` : ' (zona C1)'}.`);
  if (p.examDays != null && p.examDays >= 0) lines.push(`Examen en ${p.examDays} días.`);
  if (p.report) {
    lines.push('', `<i>${esc(p.report.summary)}</i>`);
    if (p.report.focus.length) lines.push('', '<b>La semana que viene</b>', ...p.report.focus.slice(0, 3).map((f) => `• ${esc(f)}`));
  } else lines.push('', 'Pide a Theo tu informe semanal en la app (Hoy → informe).');
  return lines.join('\n');
}

/** Días hasta el examen (hora de Madrid), o null. */
export function examDaysLeft(examDate: string | null | undefined, today: string): number | null {
  if (!examDate) return null;
  return Math.round((Date.parse(`${examDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
}
