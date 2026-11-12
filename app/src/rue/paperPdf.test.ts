import { describe, expect, it } from 'vitest';
import { pdfSafe } from './paperPdf';

describe('PDF del Paper 1', () => {
  it('deja lo que cabe en Windows-1252 y cambia o quita lo demás', () => {
    expect(pdfSafe('Part 1 · Multiple-choice — it’s “fine” 1–8')).toBe('Part 1 · Multiple-choice — it’s “fine” 1–8');
    expect(pdfSafe('a → b ≈ c ✓')).toBe('a -> b ~ c ');
    expect(pdfSafe('línea\nnueva ñ é')).toBe('línea\nnueva ñ é');
  });
});
