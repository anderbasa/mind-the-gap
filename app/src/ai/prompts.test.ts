import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildSystem, fill, listPrompts, parsePrompt } from './prompts';
import { parseProfile } from '../domain/profile';

describe('prompts', () => {
  it('lee la cabecera y el cuerpo', () => {
    const p = parsePrompt('---\nid: x\nversion: 2.1.0\ndescription: hola\n---\nBody {{a}}');
    expect(p).toMatchObject({ id: 'x', version: '2.1.0', description: 'hola', body: 'Body {{a}}' });
  });

  it('todos los prompts del repo tienen id y versión', () => {
    const all = listPrompts();
    expect(all.length).toBeGreaterThanOrEqual(4);
    for (const p of all) {
      expect(p.id).toBeTruthy();
      expect(p.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('fill falla si falta un valor (para no mandar prompts a medias)', () => {
    expect(fill('Hola {{name}}', { name: 'Theo' })).toBe('Hola Theo');
    expect(() => fill('Hola {{name}}', {})).toThrow(/name/);
  });

  it('fill no interpreta $ en los valores', () => {
    expect(fill('{{m}}', { m: 'cuesta $& 5' })).toBe('cuesta $& 5');
  });

  it('el system prompt completo no deja huecos sin rellenar', () => {
    const profile = parseProfile({ name: 'Alex', funDetails: 'loves tortilla' });
    const s = buildSystem({ profile, now: new Date('2026-11-10T12:00:00Z') }, 'chat');
    expect(s).not.toMatch(/\{\{/);
    expect(s).toContain("You are Theo, Alex's personal English tutor");
    expect(s).toContain('loves tortilla');
    expect(s).toMatch(/Tuesday,? 10 November 2026/);
    expect(s).toContain('=== CURRENT TASK ===');
  });

  // El repo es público: ningún dato del perfil local (que no se sube) puede aparecer en los prompts.
  const localProfile = join(dirname(fileURLToPath(import.meta.url)), '../../../local/perfil.local.json');
  it.skipIf(!existsSync(localProfile))('los prompts no llevan datos personales', () => {
    const data = JSON.parse(readFileSync(localProfile, 'utf8')) as Record<string, string>;
    const sensitive = ['name', 'city', 'studies', 'currentLevel'].map((k) => data[k]).filter((v) => v && v.length > 2);
    const words = ['name', 'city', 'studies']
      .map((k) => data[k] ?? '')
      .flatMap((v) => v.split(/[\s,]+/).filter((w) => w.length > 4 && /^[A-ZÁÉÍÓÚ]/.test(w)));
    words.push(...(data.currentLevel?.match(/\d{3}\s*[–-]\s*\d{3}/g) ?? [])); // la nota del First
    for (const p of listPrompts()) for (const w of [...sensitive, ...words]) expect(p.body, `«${w}» en ${p.id}`).not.toContain(w);
  });
});
