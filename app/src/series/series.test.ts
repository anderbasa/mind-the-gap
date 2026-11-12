import { describe, expect, it } from 'vitest';
import { fill, getPrompt } from '../ai/prompts';
import { DEMO_SCENE, SERIES_LESSON } from './demoScene';
import { cardFor, cleanSubtitles, markGaps, placeGaps, SeriesLessonSchema } from './series';

const SRT = `1
00:00:01,200 --> 00:00:03,100
<i>I can't believe</i> you told Mum

2
00:00:03,300 --> 00:00:05,000
about the flat.

3
00:00:05,400 --> 00:00:07,900
- She figured it out.
- She's not stupid.`;

describe('Escenas de series', () => {
  it('limpia subtítulos .srt: sin números, tiempos ni etiquetas; une líneas partidas', () => {
    expect(cleanSubtitles(SRT)).toBe("I can't believe you told Mum about the flat.\n- She figured it out.\n- She's not stupid.");
  });

  it('la lección de ejemplo cumple el esquema y los prompts se rellenan', () => {
    expect(SeriesLessonSchema.safeParse(SERIES_LESSON).success).toBe(true);
    expect(fill(getPrompt('series-lesson').body, { text: 'x', show: 'y' })).not.toMatch(/\{\{/);
    expect(fill(getPrompt('series-check').body, { summary: 'x', rephrase: 'y', questions: 'z' })).not.toMatch(/\{\{/);
  });

  it('huecos por nivel: el fácil tiene menos; el difícil, todos; cada uno en su sitio', () => {
    const gaps = SeriesLessonSchema.parse(SERIES_LESSON).gaps;
    const easy = placeGaps(DEMO_SCENE, gaps, 1).filter((s) => s.t === 'gap');
    const hard = placeGaps(DEMO_SCENE, gaps, 3).filter((s) => s.t === 'gap');
    expect(easy.length).toBe(4);
    expect(hard.length).toBe(11);
    // el texto se reconstruye entero
    expect(placeGaps(DEMO_SCENE, gaps, 3).map((s) => (s.t === 'text' ? s.s : s.word)).join('')).toBe(DEMO_SCENE);
  });

  it('respeta la aparición pedida (la 2.ª «it», no la 1.ª) y corrige sin mayúsculas ni puntos', () => {
    const text = 'Did it work? I think it did.';
    const segs = placeGaps(text, [{ word: 'it', occurrence: 2, level: 1, hint: 'pronoun' }], 1);
    expect(segs.map((s) => (s.t === 'text' ? s.s : '[ ]')).join('')).toBe('Did it work? I think [ ] did.');
    const gap = segs.find((s) => s.t === 'gap')!;
    expect(gap.t === 'gap' && markGaps(segs, { [gap.i]: ' It. ' }).ok).toBe(1);
  });

  it('lo que falta va al vocabulario como tarjeta de hueco con la frase de la escena', () => {
    const c = cardFor({ term: 'come clean', meaning: 'tell the truth', es: 'confesar', quote: "- Then I've got until Friday to come clean, haven't I?" }, 'Demo');
    expect(c.type).toBe('gap');
    expect(c.front).toBe("Then I've got until Friday to _____, haven't I?");
    expect(c.source).toBe('series');
  });
});
