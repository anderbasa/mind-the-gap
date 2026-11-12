// Simulacros: un paper o el examen completo, con las mismas pantallas (modo examen, «mock=1»).
import { listeningProgress, loadSets } from '../listening/bank';
import { allSets, getProgress } from '../rue/bank';
import { PARTS, type PartId } from '../rue/schema';
import { loadSpeakingBank } from '../speaking/schema';
import { store } from '../state';
import { listWritings } from '../writing/data';
import { WRITING_TASKS } from '../writing/tasks';
import type { DiagPart, DiagRun, MockPaper } from './run';

export const PAPERS: { id: MockPaper; title: string; es: string; minutes: number }[] = [
  { id: 'full', title: 'Simulacro completo', es: 'Los 4 papers (puedes hacerlos en días distintos)', minutes: 225 },
  { id: 'rue', title: 'Paper 1 · Reading & Use of English', es: '8 partes, 56 preguntas', minutes: 90 },
  { id: 'writing', title: 'Paper 2 · Writing', es: 'Essay obligatorio + una tarea de la Parte 2', minutes: 90 },
  { id: 'listening', title: 'Paper 3 · Listening', es: '4 partes, 30 preguntas, cada audio dos veces', minutes: 40 },
  { id: 'speaking', title: 'Paper 4 · Speaking', es: 'Las 4 partes con examinador y compañero', minutes: 15 },
];

const READING = new Set<PartId>(['p1', 'p5', 'p6', 'p7', 'p8']);

export async function startMock(paper: MockPaper): Promise<DiagRun> {
  const parts: DiagPart[] = [];
  const has = (p: MockPaper) => paper === 'full' || paper === p;

  if (has('rue')) {
    const prog = await getProgress();
    for (const p of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'] as PartId[]) {
      const sets = (await allSets(p)).filter((s) => !prog.reported[s.id]);
      const s = sets.find((x) => !prog.seen[x.id]) ?? sets[0];
      if (s) parts.push({ block: READING.has(p) ? 'reading' : 'uoe', kind: 'rue', ref: s.id, part: p, label: PARTS[p].name });
    }
  }
  if (has('writing')) {
    const done = new Set((await listWritings(50).catch(() => [])).map((w) => w.taskId));
    const pick = (part: 1 | 2) => WRITING_TASKS.filter((t) => t.part === part).find((t) => !done.has(t.id)) ?? WRITING_TASKS.find((t) => t.part === part)!;
    const e = pick(1);
    const t2 = pick(2);
    parts.push({ block: 'writing', kind: 'writing', ref: e.id, part: 'w1', label: `Part 1 · ${e.title}` });
    parts.push({ block: 'writing', kind: 'writing', ref: t2.id, part: 'w2', label: `Part 2 · ${t2.title}` });
  }
  if (has('listening')) {
    const [sets, prog] = await Promise.all([loadSets(), listeningProgress()]);
    for (const p of ['l1', 'l2', 'l3', 'l4'] as const) {
      const ofPart = sets.filter((s) => s.part === p);
      const s = ofPart.find((x) => !prog.seen.has(x.id)) ?? ofPart[0];
      if (s) parts.push({ block: 'listening', kind: 'listening', ref: s.id, part: p, label: `Listening · Part ${p[1]}` });
    }
  }
  if (has('speaking')) {
    const bank = await loadSpeakingBank();
    const t = bank?.tests[Math.floor(Math.random() * (bank?.tests.length ?? 1))];
    if (t) parts.push({ block: 'speaking', kind: 'speaking', ref: t.id, part: 's', label: `Speaking · ${t.title}` });
  }

  const run: DiagRun = { id: Date.now().toString(36), mode: 'full', paper, startedAt: Date.now(), parts };
  await store().set('meta/mock', JSON.parse(JSON.stringify(run)) as Record<string, unknown>);
  return run;
}
