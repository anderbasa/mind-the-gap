import { describe, expect, it } from 'vitest';
import { fill, getPrompt } from '../ai/prompts';
import { buildPlan, priorities, type PlannerState } from './plan';
import { weekKey } from './weekly';

const NOW = new Date('2026-11-12T10:00:00Z').getTime(); // jueves
const SAT = new Date('2026-11-14T10:00:00Z').getTime();
const DAY = 86_400_000;

const base: PlannerState = {
  scores: { reading: 182, uoe: 164, writing: 176, listening: 185, speaking: 172 },
  lastBySkill: { reading: NOW - DAY, uoe: NOW - 4 * DAY, writing: NOW - 2 * DAY, listening: NOW - DAY, speaking: NOW - 6 * DAY },
  recentErrors: { uoe: 6, writing: 4 },
  dueCards: 12,
  nextGrammar: { id: 'inversion', title: 'Inversion' },
  patterns: 2,
  pendingSpeaking: false,
  lastActivity: NOW - DAY,
  hasDiagnostic: true,
  diagnosticNext: null,
};

describe('prioridades', () => {
  it('distancia a 180 + días sin practicar + errores, con el porqué', () => {
    const p = priorities(base, NOW);
    expect(p[0].skill).toBe('uoe'); // 16 + 6 + 3 = 25
    expect(p[0].why).toContain('a 16 de 180');
    expect(p[0].why).toContain('4 días');
    expect(p[1].skill).toBe('speaking'); // 8 + 9 = 17
    expect(p.at(-1)?.skill).toBe('listening');
  });
});

describe('plan del día', () => {
  it('30 minutos: vocabulario primero y luego lo prioritario, sin pasarse del tiempo', () => {
    const plan = buildPlan(base, { minutes: 30, canSpeak: true, energy: 'normal' }, NOW);
    expect(plan.tasks[0].kind).toBe('vocab');
    expect(plan.tasks[1].skill).toBe('uoe');
    const total = plan.tasks.reduce((a, t) => a + t.minutes, 0);
    expect(total).toBeLessThanOrEqual(33);
    expect(plan.tasks.every((t) => t.why.length > 10)).toBe(true);
  });

  it('modo mínimo (5 min): una sola tarea', () => {
    const plan = buildPlan(base, { minutes: 5, canSpeak: true, energy: 'normal' }, NOW);
    expect(plan.mode).toBe('minimum');
    expect(plan.tasks).toHaveLength(1);
    expect(plan.tasks[0].kind).toBe('vocab');
  });

  it('modo silencioso: el speaking queda pendiente para casa; la próxima vez sube', () => {
    const plan = buildPlan(base, { minutes: 45, canSpeak: false, energy: 'normal' }, NOW);
    expect(plan.tasks.some((t) => t.kind === 'speaking' && !t.postponed)).toBe(false);
    expect(plan.tasks.find((t) => t.postponed)?.why).toContain('próxima sesión en casa');
    const next = buildPlan({ ...base, pendingSpeaking: true }, { minutes: 30, canSpeak: true, energy: 'normal' }, NOW);
    const firstSkill = next.tasks.find((t) => t.kind !== 'vocab');
    expect(firstSkill?.skill).toBe('speaking');
    expect(firstSkill?.why).toContain('pendiente');
  });

  it('sin diagnóstico, lo primero es el diagnóstico', () => {
    const plan = buildPlan({ ...base, scores: {}, hasDiagnostic: false, diagnosticNext: { label: 'Use of English', route: '/diagnostico', minutes: 15 } }, { minutes: 30, canSpeak: true, energy: 'normal' }, NOW);
    expect(plan.tasks[0].kind).toBe('diagnostic');
  });

  it('energía baja: nada de writing completo; fin de semana con tiempo: sí', () => {
    const low = buildPlan({ ...base, scores: { ...base.scores, writing: 150 } }, { minutes: 90, canSpeak: true, energy: 'low' }, NOW);
    expect(low.tasks.some((t) => t.kind === 'writing')).toBe(false);
    const sat = buildPlan({ ...base, scores: { ...base.scores, writing: 150 } }, { minutes: 90, canSpeak: true, energy: 'high' }, SAT);
    expect(sat.mode).toBe('long');
    expect(sat.tasks.some((t) => t.kind === 'writing' && t.minutes === 45)).toBe(true);
  });

  it('bienvenida sin reproches tras varios días sin entrar', () => {
    const plan = buildPlan({ ...base, lastActivity: NOW - 5 * DAY }, { minutes: 15, canSpeak: true, energy: 'normal' }, NOW);
    expect(plan.greeting).toContain('5 días');
    expect(plan.greeting).not.toMatch(/deberías|abandon/i);
  });
});

describe('informe semanal', () => {
  it('se guarda por semana (lunes) y el prompt se rellena', () => {
    expect(weekKey(NOW)).toBe('2026-11-09');
    expect(weekKey(SAT)).toBe('2026-11-09');
    expect(fill(getPrompt('weekly-report').body, { data: '{}' })).not.toMatch(/\{\{/);
  });
});
