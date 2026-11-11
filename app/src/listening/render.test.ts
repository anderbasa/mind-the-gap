// Ahorro de cuota: peticiones por conversación, lotes de frases y cortes por las pausas.
import { describe, expect, it } from 'vitest';
import { batchBody, batchKey, chunkBody, findSilences, planChunks, renderBatch, renderUnit, splitPoints, type TtsCall, type UnitSpec } from './ttsCore';

const R = 24000;
const tone = (sec: number) => new Int16Array(Math.round(R * sec)).map((_, i) => Math.round(5000 * Math.sin(i / 4)));
const quiet = (sec: number) => new Int16Array(Math.round(R * sec));
function cat(...parts: Int16Array[]): Int16Array {
  const out = new Int16Array(parts.reduce((a, p) => a + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const dialogue: UnitSpec = {
  id: 'd',
  speakers: [
    { id: 'A', name: 'Ann', gender: 'female', accent: 'British' },
    { id: 'B', name: 'Bob', gender: 'male', accent: 'American' },
  ],
  turns: [
    { s: 'A', text: 'x'.repeat(40) },
    { s: 'B', text: 'x'.repeat(80) },
    { s: 'A', text: 'x'.repeat(40) },
  ],
};

const five: UnitSpec = {
  id: 'p4',
  gapMs: 2000,
  speakers: [1, 2, 3, 4, 5].map((n) => ({ id: String(n), name: `S${n}`, gender: n % 2 ? ('female' as const) : ('male' as const), accent: 'British' })),
  turns: [1, 2, 3, 4, 5].map((n) => ({ s: String(n), text: 'hello there' })),
};

const lib = { A: { voice: 'gb-f', library: true }, B: { voice: 'us-m', library: true } };

describe('planificación de peticiones', () => {
  it('una conversación de dos = una petición; cinco hablantes = cinco', () => {
    expect(planChunks(dialogue)).toEqual([{ turns: [0, 1, 2], speakers: ['A', 'B'] }]);
    expect(planChunks(five)).toHaveLength(5);
  });

  it('dos voces en la misma petición, con «speaker» en cada intervención', () => {
    const b = chunkBody(dialogue, planChunks(dialogue)[0], lib, 'm') as {
      model: string;
      input: { content: { annotations: { speaker?: string }[] }[] }[];
      generation_config: { speech_config: unknown };
    };
    expect(b.model).toBe('m');
    expect(b.input[0].content.map((c) => c.annotations[0].speaker)).toEqual(['Ann', 'Bob', 'Ann']);
    expect(b.generation_config.speech_config).toEqual({
      speakers: [
        { speaker: 'Ann', voice: 'gb-f' },
        { speaker: 'Bob', voice: 'us-m' },
      ],
    });
    const single = chunkBody(five, planChunks(five)[0], { 1: { voice: 'Kore', library: false } }) as { generation_config: { speech_config: unknown } };
    expect(single.generation_config.speech_config).toEqual([{ voice: 'Kore' }]);
  });

  it('lotes: misma voz y estilo; pausa larga entre frases', () => {
    const one = (id: string, name: string): UnitSpec => ({ id, speakers: [{ id: 'A', name, gender: 'female', accent: 'British' }], turns: [{ s: 'A', text: 'Hi.' }], style: 's' });
    expect(batchKey(one('a', 'Eve'))).toBe(batchKey(one('b', 'Eve')));
    expect(batchKey(one('a', 'Eve'))).not.toBe(batchKey(one('b', 'Ann')));
    expect(batchKey(dialogue)).toBeNull();
    const b = batchBody(['One.', 'Two.'], 'Kore', 's') as { input: { content: { text: string }[] }[] };
    expect(b.input[0].content.map((c) => c.text)).toEqual(['One. <long pause>', 'Two.']);
  });
});

describe('cortes por las pausas', () => {
  it('encuentra los silencios y corta en los más cercanos a lo esperado', () => {
    // 1 s de voz · 0.4 s pausa · 2 s de voz (con una pausa corta dentro) · 0.4 s pausa · 1 s de voz
    const pcm = cat(quiet(0.2), tone(1), quiet(0.4), tone(0.9), quiet(0.15), tone(1), quiet(0.4), tone(1), quiet(0.2));
    expect(findSilences(pcm, R, 250).length).toBe(2); // las dos pausas de 0,4 s (los bordes y la corta no llegan a 250 ms)
    const cuts = splitPoints(pcm, [1, 2, 1], { rate: R })!;
    expect(cuts).toHaveLength(2);
    expect(cuts[0] / R).toBeCloseTo(1.4, 1);
    expect(cuts[1] / R).toBeCloseTo(3.85, 1);
  });

  it('en modo estricto, sin pausas claras devuelve null', () => {
    expect(splitPoints(cat(tone(3)), [1, 1], { rate: R, strict: true })).toBeNull();
    expect(splitPoints(cat(tone(3)), [1, 1], { rate: R })).toHaveLength(1);
  });
});

describe('generar una pieza con pocas peticiones', () => {
  it('conversación: 1 petición y tiempos por intervención', async () => {
    let calls = 0;
    const tts: TtsCall = async (build) => {
      calls++;
      build('m');
      return { rate: R, pcm: cat(tone(1), quiet(0.4), tone(2), quiet(0.4), tone(1)) };
    };
    const r = await renderUnit(dialogue, lib, tts, () => false);
    expect(calls).toBe(1);
    expect(r.turns).toHaveLength(3);
    expect(r.turns[1][0]).toBeGreaterThan(r.turns[0][0]);
    expect(r.turns[2][1]).toBeLessThanOrEqual(r.pcm.length / R);
  });

  it('Parte 4: una petición por hablante y la pausa entre ellos', async () => {
    let calls = 0;
    const tts: TtsCall = async () => {
      calls++;
      return { rate: R, pcm: tone(1) };
    };
    const r = await renderUnit(five, { 1: { voice: 'a', library: false }, 2: { voice: 'b', library: false }, 3: { voice: 'c', library: false }, 4: { voice: 'd', library: false }, 5: { voice: 'e', library: false } }, tts, () => false);
    expect(calls).toBe(5);
    expect(r.turns[1][0] - r.turns[0][1]).toBeCloseTo(2, 1);
  });

  it('si rechazan las voces del catálogo, repite con voces de serie', async () => {
    const seen: string[] = [];
    const tts: TtsCall = async (build) => {
      const body = build('m') as { generation_config: { speech_config: { speakers: { voice: string }[] } } };
      const v = body.generation_config.speech_config.speakers[0].voice;
      seen.push(v);
      if (v === 'gb-f') throw Object.assign(new Error('bad'), { status: 400 });
      return { rate: R, pcm: tone(1) };
    };
    const r = await renderUnit(dialogue, lib, tts, (e) => (e as { status?: number }).status === 400);
    expect(seen[0]).toBe('gb-f');
    expect(seen).toHaveLength(2);
    expect(r.voices.A.library).toBe(false);
  });

  it('lote de frases: se separan por las pausas largas, o null si no se puede', async () => {
    const units: UnitSpec[] = ['a', 'b', 'c'].map((id) => ({ id, speakers: [{ id: 'A', name: 'Eve', gender: 'female', accent: 'British' }], turns: [{ s: 'A', text: 'x'.repeat(30) }] }));
    const voices = { A: { voice: 'Kore', library: false } };
    const ok = await renderBatch(units, voices, async () => ({ rate: R, pcm: cat(tone(1.5), quiet(1.8), tone(1.5), quiet(1.8), tone(1.5)) }));
    expect(ok!.pcms).toHaveLength(3);
    for (const p of ok!.pcms) expect(p.length / R).toBeGreaterThan(1.4);
    const bad = await renderBatch(units, voices, async () => ({ rate: R, pcm: tone(4.5) }));
    expect(bad).toBeNull();
  });
});
