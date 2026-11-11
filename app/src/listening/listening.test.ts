import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { diffWords, gapCorrect, markListening, normalizeGap, wordsOf } from './marking';
import { Connected, Dictation, ListeningSet, unitsOf, type ListeningSetT, type UnitT } from './schema';
import {
  audioFromInteraction,
  bankUnits,
  decodeAudio,
  encodeWav,
  interactionBody,
  joinSegments,
  pickVoices,
  PREBUILT,
  trimSilence,
  unitHash,
  type VoiceInfo,
} from './ttsCore';

const DIR = fileURLToPath(new URL('../../public/bank/listening/', import.meta.url));
const read = (f: string) => JSON.parse(readFileSync(DIR + f, 'utf8'));
const index: string[] = read('index.json');
const sets: ListeningSetT[] = index.map((f) => ListeningSet.parse(read(f)));
const dictation = (read('dictation.json') as unknown[]).map((x) => Dictation.parse(x));
const connected = (read('connected.json') as unknown[]).map((x) => Connected.parse(x));

const flat = (s: string) => s.toLowerCase().replace(/\s+/g, ' ');
const script = (u: UnitT) => flat(u.turns.map((t) => t.text).join(' '));
const words = (u: UnitT) => u.turns.map((t) => t.text).join(' ').split(/\s+/).length;

describe('banco de Listening', () => {
  it('todos los sets son válidos y hay de las 4 partes', () => {
    expect(sets.length).toBe(index.length);
    for (const p of ['l1', 'l2', 'l3', 'l4']) expect(sets.filter((s) => s.part === p).length).toBeGreaterThanOrEqual(2);
  });

  it('ids únicos y cada intervención tiene un hablante declarado', () => {
    const units = sets.flatMap(unitsOf);
    expect(new Set(units.map((u) => u.id)).size).toBe(units.length);
    for (const u of units) {
      const ids = new Set(u.speakers.map((s) => s.id));
      for (const t of u.turns) expect(ids.has(t.s), `${u.id}: ${t.s}`).toBe(true);
    }
  });

  it('numeración, opciones y respuestas como en el examen', () => {
    for (const s of sets) {
      if (s.part === 'l1') {
        expect(s.extracts.flatMap((x) => x.questions.map((q) => q.n))).toEqual([1, 2, 3, 4, 5, 6]);
        for (const q of s.extracts.flatMap((x) => x.questions)) {
          expect(Object.keys(q.options)).toEqual(['A', 'B', 'C']);
          expect(q.options[q.answer], `${s.id} ${q.n}`).toBeTruthy();
        }
      }
      if (s.part === 'l2') expect(s.items.map((i) => i.n)).toEqual([7, 8, 9, 10, 11, 12, 13, 14]);
      if (s.part === 'l3') {
        expect(s.questions.map((q) => q.n)).toEqual([15, 16, 17, 18, 19, 20]);
        for (const q of s.questions) {
          expect(Object.keys(q.options)).toEqual(['A', 'B', 'C', 'D']);
          expect(q.options[q.answer]).toBeTruthy();
        }
      }
      if (s.part === 'l4') {
        expect(s.unit.turns).toHaveLength(5);
        for (const [task, ans] of [
          [s.task1, s.answers1],
          [s.task2, s.answers2],
        ] as const) {
          expect(Object.keys(task.options)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
          expect(new Set(ans).size).toBe(5);
          for (const a of ans) expect(task.options[a]).toBeTruthy();
        }
      }
    }
  });

  it('cada «evidence» está literalmente en el guion, y cada respuesta de la Parte 2 se oye', () => {
    for (const s of sets) {
      if (s.part === 'l1') for (const x of s.extracts) for (const q of x.questions) expect(script(x.unit), `${s.id} ${q.n}`).toContain(flat(q.evidence));
      if (s.part === 'l3') for (const q of s.questions) expect(script(s.unit), `${s.id} ${q.n}`).toContain(flat(q.evidence));
      if (s.part === 'l2') {
        for (const it of s.items) {
          expect(script(s.unit), `${s.id} ${it.n}`).toContain(flat(it.evidence));
          expect(flat(it.evidence), `${s.id} ${it.n}`).toContain(flat(it.answers[0]));
          expect(it.sentence).toContain('___');
        }
      }
      if (s.part === 'l4') {
        s.notes.forEach((nt, i) => {
          const t = flat(s.unit.turns[i].text);
          expect(t, `${s.id} speaker ${i + 1}`).toContain(flat(nt.evidence1));
          expect(t, `${s.id} speaker ${i + 1}`).toContain(flat(nt.evidence2));
        });
      }
    }
  });

  it('longitudes parecidas a las del examen', () => {
    for (const s of sets) {
      if (s.part === 'l1') for (const x of s.extracts) expect(words(x.unit), x.unit.id).toBeGreaterThanOrEqual(130);
      if (s.part === 'l2') expect(words(s.unit), s.id).toBeGreaterThanOrEqual(420);
      if (s.part === 'l3') expect(words(s.unit), s.id).toBeGreaterThanOrEqual(550);
      if (s.part === 'l4') for (const t of s.unit.turns) expect(t.text.split(/\s+/).length, s.id).toBeGreaterThanOrEqual(80);
    }
  });

  it('dictados e inglés hablado real', () => {
    expect(dictation.length).toBeGreaterThanOrEqual(20);
    expect(connected.length).toBeGreaterThanOrEqual(20);
    expect(new Set(dictation.map((d) => d.id)).size).toBe(dictation.length);
    expect(new Set(connected.map((d) => d.id)).size).toBe(connected.length);
    const all = bankUnits(sets, dictation, connected);
    expect(new Set(all.map((u) => u.id)).size).toBe(all.length);
  });
});

describe('núcleo de audio', () => {
  it('pide la voz a la API de Interactions y lee el audio de la respuesta', () => {
    const b = interactionBody('Hello there.', 'Kore', 'calm') as { model: string; input: { content: { annotations: unknown[] }[] }[]; generation_config: unknown };
    expect(b.model).toBe('gemini-3.8-flash-tts');
    expect(b.input[0].content[0].annotations).toEqual([{ type: 'speech_metadata', style: 'calm' }]);
    expect(b.generation_config).toEqual({ speech_config: [{ voice: 'Kore' }] });
    const res = { steps: [{ type: 'user_input', content: [] }, { type: 'model_output', content: [{ type: 'audio', data: 'QUJD', mime_type: 'audio/wav' }] }] };
    expect(audioFromInteraction(res)).toEqual({ data: 'QUJD', mime: 'audio/wav' });
    expect(audioFromInteraction({})).toBeNull();
  });

  it('WAV ida y vuelta, recorte de silencios y unión con tiempos', () => {
    const tone = new Int16Array(2400).map((_, i) => Math.round(5000 * Math.sin(i / 5)));
    const padded = new Int16Array(2400 + 9600);
    padded.set(tone, 4800);
    const back = decodeAudio(encodeWav(padded, 24000));
    expect(back.rate).toBe(24000);
    expect(Array.from(back.pcm)).toEqual(Array.from(padded));
    expect(trimSilence(padded).length).toBeLessThan(padded.length);
    const raw = decodeAudio(new Uint8Array(encodeWav(tone).slice(44)), 'audio/l16;rate=24000');
    expect(raw.pcm.length).toBe(tone.length);
    const { pcm, turns } = joinSegments([tone, tone], 500, 24000, 300);
    expect(turns).toEqual([
      [0.3, 0.4],
      [0.9, 1],
    ]);
    expect(pcm.length).toBe(24000 * 0.3 * 2 + 2400 * 2 + 12000);
  });

  it('asigna voces distintas por acento y género, siempre las mismas', () => {
    const cat: VoiceInfo[] = [
      { id: 'gb-f-1', accent: 'British', gender: 'female', language_code: 'en-GB' },
      { id: 'gb-f-2', accent: 'British', gender: 'female', language_code: 'en-GB' },
      { id: 'us-m-1', accent: 'American', gender: 'male', language_code: 'en-US' },
      { id: 'ie-x', gender: 'male', language_code: ['en-IE'] },
    ];
    const sp = [
      { id: 'A', name: 'Ann', gender: 'female' as const, accent: 'British' },
      { id: 'B', name: 'Bea', gender: 'female' as const, accent: 'British' },
      { id: 'C', name: 'Carl', gender: 'male' as const, accent: 'American' },
      { id: 'D', name: 'Dan', gender: 'male' as const, accent: 'Irish' },
      { id: 'E', name: 'Eve', gender: 'female' as const, accent: 'Australian' },
    ];
    const v = pickVoices(sp, cat);
    expect(v.A.voice).not.toBe(v.B.voice);
    expect([v.A.voice, v.B.voice].sort()).toEqual(['gb-f-1', 'gb-f-2']);
    expect(v.C).toEqual({ voice: 'us-m-1', library: true });
    expect(v.D).toEqual({ voice: 'ie-x', library: true });
    expect(v.E.library).toBe(false);
    expect(PREBUILT.female).toContain(v.E.voice);
    expect(pickVoices(sp, cat)).toEqual(v);
  });

  it('la huella cambia si cambia el guion', async () => {
    const u = sets[0].part === 'l1' ? sets[0].extracts[0].unit : unitsOf(sets[0])[0];
    const h = await unitHash(u);
    expect(h).toMatch(/^[0-9a-f]{12}$/);
    expect(await unitHash(u)).toBe(h);
    expect(await unitHash({ ...u, turns: [...u.turns, { s: u.turns[0].s, text: 'Extra.' }] })).not.toBe(h);
  });
});

describe('corrección', () => {
  it('Parte 2: tildes, mayúsculas, guiones y artículo inicial no cuentan; la ortografía sí', () => {
    expect(normalizeGap('  The Café. ')).toBe('cafe');
    expect(gapCorrect('cafe', ['café'])).toBe(true);
    expect(gapCorrect('corn-flour', ['cornflour', 'corn flour'])).toBe(true);
    expect(gapCorrect('wether forecast', ['weather forecast'])).toBe(false);
    expect(gapCorrect('', ['x'])).toBe(false);
  });

  it('un set perfecto saca todo y uno vacío nada', () => {
    for (const s of sets) {
      const perfect: Record<number, string> = {};
      if (s.part === 'l1') s.extracts.forEach((x) => x.questions.forEach((q) => (perfect[q.n] = q.answer)));
      if (s.part === 'l3') s.questions.forEach((q) => (perfect[q.n] = q.answer));
      if (s.part === 'l2') s.items.forEach((i) => (perfect[i.n] = i.answers[0]));
      if (s.part === 'l4') {
        s.answers1.forEach((a, i) => (perfect[21 + i] = a));
        s.answers2.forEach((a, i) => (perfect[26 + i] = a));
      }
      const r = markListening(s, perfect);
      expect(r.marks, s.id).toBe(r.max);
      expect(markListening(s, {}).marks).toBe(0);
    }
  });

  it('dictado: contracciones y números iguales; detecta palabras que faltan, sobran o están mal', () => {
    expect(wordsOf("I'd rather pay 12%")).toEqual(['i', 'would', 'rather', 'pay', '12', 'per', 'cent']);
    expect(diffWords('Profits fell by twelve per cent.', 'profits fell by 12 percent').correct).toBe(6);
    const d = diffWords('The meeting has been moved to Thursday.', 'The meting has moved to Thursday on')
      .ops.map((o) => o.kind)
      .join(',');
    expect(d).toBe('ok,wrong,ok,missing,ok,ok,ok,extra');
  });
});
