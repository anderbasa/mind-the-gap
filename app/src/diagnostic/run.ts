// Diagnóstico de nivel en bloques reanudables. Usa las pantallas de ejercicios que ya existen
// (en modo examen, con «diag=1» en la ruta) y guarda cada resultado en meta/diagnostic.
import { listeningProgress, loadSets } from '../listening/bank';
import { allSets, getProgress } from '../rue/bank';
import type { PartId } from '../rue/schema';
import { overallOf, pctToScale, rawToScale, type ScoreDoc, type SkillScores } from '../scoring/estimate';
import { hasStore, store } from '../state';
import { listWritings } from '../writing/data';
import { WRITING_TASKS } from '../writing/tasks';

export type Block = 'uoe' | 'reading' | 'listening' | 'writing' | 'speaking';
export type PartKind = 'rue' | 'listening' | 'writing' | 'speaking';

export interface DiagPart {
  block: Block;
  kind: PartKind;
  ref: string;
  part: string;
  label: string;
  done?: boolean;
  marks?: number;
  max?: number;
  scale?: number;
  at?: number;
}

export type RunDoc = 'diagnostic' | 'mock';
export type MockPaper = 'full' | 'rue' | 'writing' | 'listening' | 'speaking';

export interface DiagRun {
  id: string;
  mode: 'full' | 'mini';
  /** Solo en simulacros: qué paper (o todos). */
  paper?: MockPaper;
  startedAt: number;
  parts: DiagPart[];
  finishedAt?: number;
  result?: { skills: SkillScores; overall: number };
}

export const BLOCKS: { id: Block; title: string; es: string; minutes: number }[] = [
  { id: 'uoe', title: 'Use of English', es: 'Partes 4, 3 y 2 del Reading & Use of English', minutes: 15 },
  { id: 'reading', title: 'Reading', es: 'Partes 1 y 5', minutes: 15 },
  { id: 'listening', title: 'Listening', es: 'Partes 1 y 3, cada audio dos veces', minutes: 12 },
  { id: 'writing', title: 'Writing', es: 'Una tarea de la Parte 2 (~30 min, 220–260 palabras)', minutes: 30 },
  { id: 'speaking', title: 'Speaking', es: 'Una conversación con Theo: él anota en silencio', minutes: 8 },
];

const DOC = (d: RunDoc) => `meta/${d === 'mock' ? 'mock' : 'diagnostic'}`;
const docOf = (run: DiagRun): RunDoc => (run.paper ? 'mock' : 'diagnostic');

export async function getRun(doc: RunDoc = 'diagnostic'): Promise<DiagRun | null> {
  if (!hasStore()) return null;
  return store().get<DiagRun>(DOC(doc));
}

async function save(run: DiagRun): Promise<void> {
  await store().set(DOC(docOf(run)), JSON.parse(JSON.stringify(run)) as Record<string, unknown>);
}

/** Elige el contenido (lo que aún no has hecho, si se puede) y empieza un diagnóstico nuevo. */
export async function startRun(mode: 'full' | 'mini' = 'full'): Promise<DiagRun> {
  const [rueProgress, lSets, lProg, writings] = await Promise.all([getProgress(), loadSets(), listeningProgress(), listWritings(50).catch(() => [])]);
  const pickRue = async (p: PartId) => {
    const sets = await allSets(p);
    const ok = sets.filter((s) => !rueProgress.reported[s.id]);
    return ok.find((s) => !rueProgress.seen[s.id]) ?? ok[0] ?? sets[0];
  };
  const pickL = (p: 'l1' | 'l3') => lSets.filter((s) => s.part === p).find((s) => !lProg.seen.has(s.id)) ?? lSets.find((s) => s.part === p);
  const done = new Set(writings.map((w) => w.taskId));
  const task = WRITING_TASKS.filter((t) => t.part === 2).find((t) => !done.has(t.id)) ?? WRITING_TASKS.find((t) => t.part === 2)!;

  const parts: DiagPart[] = [];
  const rue = async (block: Block, p: PartId, label: string) => {
    const s = await pickRue(p);
    if (s) parts.push({ block, kind: 'rue', ref: s.id, part: p, label });
  };
  await rue('uoe', 'p4', 'Part 4 · Key word transformation');
  if (mode === 'full') {
    await rue('uoe', 'p3', 'Part 3 · Word formation');
    await rue('uoe', 'p2', 'Part 2 · Open cloze');
    await rue('reading', 'p1', 'Part 1 · Multiple-choice cloze');
    await rue('reading', 'p5', 'Part 5 · Multiple choice');
  }
  const l1 = pickL('l1');
  if (l1) parts.push({ block: 'listening', kind: 'listening', ref: l1.id, part: 'l1', label: 'Part 1 · Short extracts' });
  if (mode === 'full') {
    const l3 = pickL('l3');
    if (l3) parts.push({ block: 'listening', kind: 'listening', ref: l3.id, part: 'l3', label: 'Part 3 · Interview' });
    parts.push({ block: 'writing', kind: 'writing', ref: task.id, part: 'w', label: task.title });
  }
  parts.push({ block: 'speaking', kind: 'speaking', ref: 'diag', part: 's', label: 'Conversación con Theo' });

  const run: DiagRun = { id: Date.now().toString(36), mode, startedAt: Date.now(), parts };
  await save(run);
  return run;
}

/** La ruta de la pantalla que hace cada parte (en modo examen y marcada como diagnóstico). */
export function partRoute(p: DiagPart, doc: RunDoc = 'diagnostic'): string {
  const flag = doc === 'mock' ? 'mock=1' : 'diag=1';
  switch (p.kind) {
    case 'rue':
      return `/practicar/rue/${p.part}?mode=exam&id=${p.ref}&${flag}`;
    case 'listening':
      return `/practicar/listening/${p.part}?mode=exam&id=${p.ref}&${flag}`;
    case 'writing':
      return `/practicar/writing/escribir?task=${p.ref}&${flag}`;
    case 'speaking':
      return doc === 'mock' ? `/practicar/speaking/simulacro?test=${p.ref}&mock=1` : `/practicar/speaking/conversacion?s=diag&diag=1`;
  }
}

export function nextPart(run: DiagRun, block?: Block): DiagPart | null {
  return run.parts.find((p) => !p.done && (!block || p.block === block)) ?? null;
}

/** Lo llaman las pantallas de ejercicios al terminar una parte del diagnóstico. */
export async function recordPart(kind: PartKind, ref: string, data: { marks?: number; max?: number; scale?: number }): Promise<DiagRun | null> {
  // Puede ser parte del diagnóstico o de un simulacro: se busca en los dos.
  for (const doc of ['mock', 'diagnostic'] as RunDoc[]) {
    const run = await getRun(doc);
    if (!run || run.finishedAt) continue;
    const p = run.parts.find((x) => x.kind === kind && x.ref === ref && !x.done);
    if (!p) continue;
    Object.assign(p, data, { done: true, at: Date.now() });
    await save(run);
    return run;
  }
  return null;
}

/** El diagnóstico o simulacro en curso en el que se ha hecho algo más recientemente. */
export async function activeRun(): Promise<{ run: DiagRun; doc: RunDoc } | null> {
  const runs = (await Promise.all((['mock', 'diagnostic'] as RunDoc[]).map(async (d) => ({ run: await getRun(d), doc: d })))).filter(
    (x): x is { run: DiagRun; doc: RunDoc } => !!x.run && !x.run.finishedAt,
  );
  const lastAt = (r: DiagRun) => Math.max(r.startedAt, ...r.parts.map((p) => p.at ?? 0));
  return runs.sort((a, b) => lastAt(b.run) - lastAt(a.run))[0] ?? null;
}

/** Notas por destreza con lo que haya hecho (aciertos → escala; writing y speaking ya traen su escala). */
export function skillsOf(run: DiagRun): SkillScores {
  const out: SkillScores = {};
  const byPct = (b: 'uoe' | 'reading' | 'listening') => {
    const ps = run.parts.filter((p) => p.block === b && p.done && p.max);
    if (!ps.length) return undefined;
    const marks = ps.reduce((a, p) => a + (p.marks ?? 0), 0);
    const max = ps.reduce((a, p) => a + (p.max ?? 0), 0);
    return pctToScale((marks / max) * 100, b);
  };
  const uoe = byPct('uoe');
  const reading = byPct('reading');
  const listening = byPct('listening');
  if (uoe != null) out.uoe = uoe;
  if (reading != null) out.reading = reading;
  if (listening != null) out.listening = listening;
  // Writing: cada tarea vale 20; se escala al paper de 40 (con una sola tarea, la suya ×2).
  const ws = run.parts.filter((p) => p.block === 'writing' && p.done);
  const w = ws.length ? (ws.every((p) => p.marks != null) ? rawToScale('writing', (ws.reduce((a, p) => a + (p.marks ?? 0), 0) * 2) / ws.length) : ws[0].scale) : undefined;
  const s = run.parts.find((p) => p.block === 'speaking' && p.done)?.scale;
  if (w != null) out.writing = w;
  if (s != null) out.speaking = s;
  return out;
}

/** Cierra el diagnóstico: guarda la nota en scores/ (la que se ve en Hoy y en Progreso). */
export async function finishRun(run: DiagRun): Promise<DiagRun> {
  const skills = skillsOf(run);
  const overall = overallOf(skills) ?? 0;
  run.result = { skills, overall };
  run.finishedAt = Date.now();
  await save(run);
  const isMock = !!run.paper;
  const doc: ScoreDoc = {
    kind: isMock ? 'mock' : run.mode === 'full' ? 'diagnostic' : 'mini',
    skills,
    overall,
    at: run.finishedAt,
    ...(isMock ? { label: run.paper === 'full' ? 'Simulacro completo' : `Simulacro · ${run.paper}`, paper: run.paper } : {}),
  };
  await store().set(`scores/${isMock ? 'mock' : 'diag'}-${run.id}`, doc as unknown as Record<string, unknown>);
  return run;
}

export async function latestScore(): Promise<ScoreDoc | null> {
  if (!hasStore()) return null;
  const rows = await store()
    .list<ScoreDoc>('scores', { orderBy: 'at', desc: true, limit: 1 })
    .catch(() => []);
  return rows[0] ?? null;
}
