import { describe, expect, it } from 'vitest';
import { createLocalStore } from './store';
import { parseProfile, profileForPrompt } from '../domain/profile';

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe('almacén local (modo demo)', () => {
  it('suma con inc() y fusiona con merge', async () => {
    const s = createLocalStore('t', memoryStorage());
    await s.set('usage/2026-11-10', { total: { requests: s.inc(1), costUsd: s.inc(0.5) }, day: '2026-11-10' }, { merge: true });
    await s.set('usage/2026-11-10', { total: { requests: s.inc(2), costUsd: s.inc(0.25) } }, { merge: true });
    expect(await s.get('usage/2026-11-10')).toEqual({ total: { requests: 3, costUsd: 0.75 }, day: '2026-11-10' });
  });

  it('lista una colección con filtro y orden', async () => {
    const s = createLocalStore('t', memoryStorage());
    await s.set('usage/a', { day: '2026-11-01' });
    await s.set('usage/b', { day: '2026-11-09' });
    await s.set('usage/c', { day: '2026-10-30' });
    await s.set('usage/b/sub/x', { day: 'no' }); // no es hijo directo
    const rows = await s.list<{ day: string }>('usage', { where: [['day', '>=', '2026-11-01']], orderBy: 'day', desc: true });
    expect(rows.map((r) => r.id)).toEqual(['b', 'a']);
  });
});

describe('perfil', () => {
  it('rellena valores por defecto y no rompe con basura', () => {
    expect(parseProfile(null).examFormat).toBe('unknown');
    expect(parseProfile({ examFormat: 'mars' }).name).toBe('');
  });

  it('el texto para Theo omite los campos vacíos', () => {
    const t = profileForPrompt(parseProfile({ name: 'Alex', city: '' }));
    expect(t).toContain('- Name: Alex');
    expect(t).not.toContain('City');
  });
});
