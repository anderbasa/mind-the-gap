// Convierte los guiones del banco de Listening en mp3 con Gemini TTS (gratis).
// Lo ejecuta GitHub Actions (.github/workflows/audio.yml) con la clave en el secret GEMINI_API_KEY.
// Solo genera lo que falta o ha cambiado; si se acaba la cuota del día, guarda lo hecho y sigue mañana.
//
//   node scripts/render-listening.mjs              → genera de verdad (necesita GEMINI_API_KEY)
//   node scripts/render-listening.mjs --dry --out <carpeta>   → prueba local con audio sintético
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Mp3Encoder } from '@breezystack/lamejs';
import * as core from '../app/src/listening/ttsCore.ts';

const BANK = 'app/public/bank/listening';
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : path.join(BANK, 'audio');
const KEY = process.env.GEMINI_API_KEY ?? '';
const MAX_REQUESTS = Number(process.env.MAX_REQUESTS ?? 400);
const PAUSE_MS = Number(process.env.PAUSE_MS ?? (DRY ? 0 : 4000));
const API = 'https://generativelanguage.googleapis.com/v1beta';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = async (f) => JSON.parse(await readFile(f, 'utf8'));

class StopError extends Error {}

let requests = 0;

/* ── Gemini ──────────────────────────────────────────────────────── */

async function listVoices() {
  if (DRY) return [];
  const q = ['en-GB', 'en-US', 'en-AU', 'en-IE', 'en-CA', 'en-NZ'].map((l) => `language_code=${l}`).join('&');
  try {
    const r = await fetch(`${API}/voices?${q}&page_size=1000`, { headers: { 'x-goog-api-key': KEY } });
    if (!r.ok) {
      console.log(`· Catálogo de voces no disponible (${r.status}); uso voces de serie.`);
      return [];
    }
    const j = await r.json();
    const voices = (j.voices ?? []).map((v) => ({ id: v.id ?? v.name, accent: v.accent, gender: v.gender, language_code: v.language_code ?? v.languageCode }));
    const by = {};
    for (const v of voices) by[`${v.accent ?? '?'}/${v.gender ?? '?'}`] = (by[`${v.accent ?? '?'}/${v.gender ?? '?'}`] ?? 0) + 1;
    console.log(`· Catálogo: ${voices.length} voces en inglés`, by);
    return voices;
  } catch (e) {
    console.log('· Catálogo de voces no disponible:', e.message);
    return [];
  }
}

function isDailyQuota(status, text) {
  return status === 429 && /per ?day|PerDay|daily/i.test(text);
}

/** Una intervención → muestras PCM. */
async function speak(text, voice, style) {
  if (DRY) {
    // Prueba local: un tono suave, de longitud proporcional al texto.
    const n = Math.round(core.RATE * Math.max(0.6, text.length * 0.06));
    const pcm = new Int16Array(n);
    for (let i = 0; i < n; i++) pcm[i] = Math.round(3000 * Math.sin((2 * Math.PI * 220 * i) / core.RATE));
    return { rate: core.RATE, pcm };
  }
  for (let attempt = 1; attempt <= 4; attempt++) {
    if (requests >= MAX_REQUESTS) throw new StopError(`límite de ${MAX_REQUESTS} peticiones por ejecución`);
    requests++;
    const r = await fetch(`${API}/interactions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify(core.interactionBody(text, voice, style)),
    });
    const raw = await r.text();
    if (r.ok) {
      const audio = core.audioFromInteraction(JSON.parse(raw));
      if (!audio) throw new Error('La respuesta no trae audio');
      const out = core.decodeAudio(new Uint8Array(Buffer.from(audio.data, 'base64')), audio.mime);
      await sleep(PAUSE_MS);
      return { rate: out.rate, pcm: core.trimSilence(out.pcm, 300, 60, out.rate) };
    }
    if (isDailyQuota(r.status, raw)) throw new StopError('cuota diaria gratuita de TTS agotada');
    if (r.status === 429 || r.status >= 500) {
      const wait = Number(r.headers.get('retry-after')) * 1000 || 15000 * attempt;
      console.log(`  · ${r.status}: espero ${Math.round(wait / 1000)} s (intento ${attempt})`);
      await sleep(wait);
      continue;
    }
    const err = new Error(`HTTP ${r.status}: ${raw.slice(0, 300)}`);
    err.status = r.status;
    throw err;
  }
  throw new Error('Gemini TTS sigue saturado');
}

/* ── MP3 ─────────────────────────────────────────────────────────── */

function toMp3(pcm, rate) {
  const enc = new Mp3Encoder(1, rate, 48);
  const chunks = [];
  for (let i = 0; i < pcm.length; i += 1152) {
    const b = enc.encodeBuffer(pcm.subarray(i, i + 1152));
    if (b.length) chunks.push(Buffer.from(b));
  }
  const end = enc.flush();
  if (end.length) chunks.push(Buffer.from(end));
  return Buffer.concat(chunks);
}

/* ── Una pieza ───────────────────────────────────────────────────── */

async function renderUnit(unit, catalog) {
  let voices = core.pickVoices(unit.speakers, catalog);
  const segs = [];
  let rate = core.RATE;
  for (const turn of unit.turns) {
    const sp = unit.speakers.find((s) => s.id === turn.s);
    let v = voices[turn.s];
    let seg;
    try {
      seg = await speak(turn.text, v.voice, core.styleFor(unit, turn, sp, v.library));
    } catch (e) {
      // Si la voz del catálogo no vale, se repite con voces de serie.
      if (e instanceof StopError || !v.library || e.status !== 400) throw e;
      console.log(`  · La voz ${v.voice} no funciona (${e.message.slice(0, 80)}); paso a voces de serie.`);
      voices = core.pickVoices(unit.speakers, []);
      v = voices[turn.s];
      seg = await speak(turn.text, v.voice, core.styleFor(unit, turn, sp, false));
    }
    rate = seg.rate;
    segs.push(seg.pcm);
  }
  const { pcm, turns } = core.joinSegments(segs, unit.gapMs ?? 450, rate);
  return { mp3: toMp3(pcm, rate), duration: Math.round((pcm.length / rate) * 100) / 100, turns, voices: Object.fromEntries(Object.entries(voices).map(([k, v]) => [k, v.voice])) };
}

/* ── Principal ───────────────────────────────────────────────────── */

async function main() {
  if (!DRY && !KEY) {
    console.log('Sin GEMINI_API_KEY: no se generan audios. Añádela en GitHub → Settings → Secrets and variables → Actions.');
    return;
  }
  const index = await readJson(path.join(BANK, 'index.json'));
  const sets = await Promise.all(index.map((f) => readJson(path.join(BANK, f))));
  const dictation = await readJson(path.join(BANK, 'dictation.json'));
  const connected = await readJson(path.join(BANK, 'connected.json'));
  const units = core.bankUnits(sets, dictation, connected);

  await mkdir(OUT, { recursive: true });
  const manifestPath = path.join(OUT, 'manifest.json');
  const manifest = existsSync(manifestPath) ? await readJson(manifestPath) : { version: 1, units: {} };
  const save = async () => writeFile(manifestPath, JSON.stringify(manifest, null, 1) + '\n');

  // Piezas que ya no están en el banco: fuera del manifiesto y del disco.
  const ids = new Set(units.map((u) => u.id));
  let removed = 0;
  for (const id of Object.keys(manifest.units)) {
    if (!ids.has(id)) {
      delete manifest.units[id];
      removed++;
    }
  }
  const keep = new Set(Object.values(manifest.units).map((e) => e.file));
  for (const f of await readdir(OUT)) if (f.endsWith('.mp3') && !keep.has(f) && !units.some((u) => f.startsWith(`${u.id}-`))) await unlink(path.join(OUT, f));

  const catalog = await listVoices();
  let done = 0;
  let made = 0;
  let stoppedBy;
  let failures = 0;
  for (const unit of units) {
    const hash = await core.unitHash(unit);
    const cur = manifest.units[unit.id];
    if (cur && cur.hash === hash && existsSync(path.join(OUT, cur.file))) {
      done++;
      continue;
    }
    console.log(`→ ${unit.id} (${unit.turns.length} intervenciones)`);
    try {
      const r = await renderUnit(unit, catalog);
      const file = `${unit.id}-${hash}.mp3`;
      await writeFile(path.join(OUT, file), r.mp3);
      if (cur?.file && cur.file !== file && existsSync(path.join(OUT, cur.file))) await unlink(path.join(OUT, cur.file));
      manifest.units[unit.id] = { hash, file, duration: r.duration, turns: r.turns, voices: r.voices };
      await save();
      done++;
      made++;
      failures = 0;
      console.log(`  ✓ ${file} · ${r.duration} s · ${Math.round(r.mp3.length / 1024)} KB`);
    } catch (e) {
      if (e instanceof StopError) {
        stoppedBy = e.message;
        console.log(`■ Me paro: ${stoppedBy}`);
        break;
      }
      failures++;
      console.log(`  ✗ ${unit.id}: ${e.message}`);
      if (failures >= 3) {
        stoppedBy = `tres fallos seguidos (último: ${e.message.slice(0, 160)})`;
        break;
      }
    }
  }
  // El estado solo se reescribe si algo ha cambiado (así no hay un commit diario vacío).
  const next = { total: units.length, done, ...(stoppedBy ? { stoppedBy } : {}) };
  const { at: _at, requests: _r, ...prev } = manifest.status ?? {};
  if (made > 0 || removed > 0 || JSON.stringify(prev) !== JSON.stringify(next)) {
    manifest.status = { at: new Date().toISOString(), ...next, requests };
    await save();
  }
  console.log(`Listo: ${made} nuevas · ${done}/${units.length} piezas con audio · ${requests} peticiones${stoppedBy ? ` · parado: ${stoppedBy}` : ''}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
