// Convierte los guiones del banco de Listening en mp3 con Gemini TTS (gratis).
// Lo ejecuta GitHub Actions (.github/workflows/audio.yml) con la clave en el secret GEMINI_API_KEY.
// Solo genera lo que falta o ha cambiado. La capa gratuita da ~10 peticiones de voz al día por
// modelo, así que se ahorra: una petición por conversación, frases sueltas en lotes y, si se agota
// un modelo, se sigue con el otro. Si se acaban los dos, guarda lo hecho y sigue al día siguiente.
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
const MAX_REQUESTS = Number(process.env.MAX_REQUESTS ?? 60);
const PAUSE_MS = Number(process.env.PAUSE_MS ?? (DRY ? 0 : 6000));
const BATCH = 6;
const API = 'https://generativelanguage.googleapis.com/v1beta';

/** Limpia errores típicos al pegar el secret: espacios, comillas o «GEMINI_API_KEY=» delante. */
export function cleanKey(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/^GEMINI_API_KEY\s*=\s*/i, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();
}
const KEY = cleanKey(process.env.GEMINI_API_KEY);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = async (f) => JSON.parse(await readFile(f, 'utf8'));

class StopError extends Error {}

let requests = 0;
let modelIdx = 0;
let lastModel = core.TTS_MODEL;

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

const isDailyQuota = (status, text) => status === 429 && /per ?day|PerDay|daily/i.test(text);

/** Audio sintético para --dry: un tono por frase y silencios entre ellas (largos si hay <long pause>). */
function synth(body) {
  const items = body.input[0].content;
  const parts = [];
  for (const it of items) {
    const n = Math.round(core.RATE * Math.max(0.5, it.text.length * 0.05));
    const tone = new Int16Array(n);
    for (let i = 0; i < n; i++) tone[i] = Math.round(4000 * Math.sin((2 * Math.PI * 220 * i) / core.RATE));
    parts.push(tone, new Int16Array(Math.round(core.RATE * (/<long pause>/.test(it.text) ? 1.8 : 0.5))));
  }
  const len = parts.reduce((a, p) => a + p.length, 0);
  const pcm = new Int16Array(len);
  let at = 0;
  for (const p of parts) {
    pcm.set(p, at);
    at += p.length;
  }
  return { rate: core.RATE, pcm };
}

/** Una petición de voz, con reintentos, cambio de modelo al agotar la cuota y límite por ejecución. */
async function tts(build) {
  let tries = 0;
  for (;;) {
    const model = core.TTS_MODELS[modelIdx];
    const body = build(model);
    if (DRY) return synth(body);
    if (requests >= MAX_REQUESTS) throw new StopError(`límite de ${MAX_REQUESTS} peticiones por ejecución`);
    requests++;
    const r = await fetch(`${API}/interactions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify(body),
    });
    const raw = await r.text();
    if (r.ok) {
      const audio = core.audioFromInteraction(JSON.parse(raw));
      if (!audio) throw new Error('La respuesta no trae audio');
      lastModel = model;
      await sleep(PAUSE_MS);
      return core.decodeAudio(new Uint8Array(Buffer.from(audio.data, 'base64')), audio.mime);
    }
    if (isDailyQuota(r.status, raw) || (r.status === 404 && modelIdx > 0)) {
      modelIdx++;
      if (modelIdx >= core.TTS_MODELS.length) throw new StopError('cuota diaria gratuita de voz agotada (en los dos modelos)');
      console.log(`  · Cuota de ${model} agotada; sigo con ${core.TTS_MODELS[modelIdx]}.`);
      continue;
    }
    if (r.status === 401 || r.status === 403) {
      throw new StopError(`Google acepta la clave para Gemini pero no para la voz (HTTP ${r.status}).`);
    }
    if ((r.status === 429 || r.status >= 500) && ++tries <= 3) {
      const wait = Number(r.headers.get('retry-after')) * 1000 || 15000 * tries;
      console.log(`  · ${r.status}: espero ${Math.round(wait / 1000)} s (intento ${tries})`);
      await sleep(wait);
      continue;
    }
    const err = new Error(`HTTP ${r.status}: ${raw.slice(0, 300)}`);
    err.status = r.status;
    throw err;
  }
}

const isBadRequest = (e) => e?.status === 400;

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

  const finish = async (made, stoppedBy) => {
    const done = units.filter((u) => manifest.units[u.id]).length;
    const next = { total: units.length, done, ...(stoppedBy ? { stoppedBy } : {}) };
    const { at: _at, requests: _r, ...prev } = manifest.status ?? {};
    if (made > 0 || removed > 0 || JSON.stringify(prev) !== JSON.stringify(next)) {
      manifest.status = { at: new Date().toISOString(), ...next, requests };
      await save();
    }
    console.log(`Listo: ${made} nuevas · ${done}/${units.length} piezas con audio · ${requests} peticiones${stoppedBy ? ` · parado: ${stoppedBy}` : ''}`);
  };

  // Antes de nada: ¿Google acepta la clave? (sin gastar cuota de voz)
  if (!DRY) {
    const r = await fetch(`${API}/models?pageSize=1`, { headers: { 'x-goog-api-key': KEY } });
    if (!r.ok) {
      const why =
        r.status === 400 || r.status === 401 || r.status === 403
          ? `Google no acepta la clave del secret GEMINI_API_KEY (HTTP ${r.status}). Vuelve a pegarla entera desde AI Studio (botón de copiar, no el texto con «…»).`
          : `No se ha podido comprobar la clave (HTTP ${r.status}).`;
      console.log(`■ ${why}`);
      return finish(0, why);
    }
    console.log('· Clave aceptada por Gemini.');
  }

  // Lo que falta, con su huella.
  const pending = [];
  for (const unit of units) {
    const hash = await core.unitHash(unit);
    const cur = manifest.units[unit.id];
    if (cur && cur.hash === hash && existsSync(path.join(OUT, cur.file))) continue;
    pending.push({ unit, hash });
  }
  console.log(`· Pendientes: ${pending.length} de ${units.length}`);
  if (!pending.length) return finish(0);

  const catalog = await listVoices();

  const store = async ({ unit, hash }, pcm, rate, turns, voices) => {
    const mp3 = toMp3(pcm, rate);
    const file = `${unit.id}-${hash}.mp3`;
    await writeFile(path.join(OUT, file), mp3);
    const old = manifest.units[unit.id]?.file;
    if (old && old !== file && existsSync(path.join(OUT, old))) await unlink(path.join(OUT, old));
    manifest.units[unit.id] = {
      hash,
      file,
      duration: Math.round((pcm.length / rate) * 100) / 100,
      turns,
      voices: Object.fromEntries(Object.entries(voices).map(([k, v]) => [k, v.voice])),
      model: lastModel,
    };
    await save();
    console.log(`  ✓ ${file} · ${manifest.units[unit.id].duration} s · ${Math.round(mp3.length / 1024)} KB`);
  };

  // Primero los listenings (una petición por conversación); después las frases sueltas en lotes.
  const singles = pending.filter((p) => core.batchKey(p.unit) && (p.unit.id.startsWith('dict-') || p.unit.id.startsWith('cs-')));
  const whole = pending.filter((p) => !singles.includes(p));
  const groups = new Map();
  for (const p of singles) {
    const k = core.batchKey(p.unit);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }

  let made = 0;
  let failures = 0;
  const renderOne = async (p) => {
    console.log(`→ ${p.unit.id} (${p.unit.turns.length} intervenciones, ${core.planChunks(p.unit).length} petición/es)`);
    const r = await core.renderUnit(p.unit, core.pickVoices(p.unit.speakers, catalog), tts, isBadRequest);
    await store(p, r.pcm, r.rate, r.turns, r.voices);
    made++;
  };

  try {
    for (const p of whole) {
      try {
        await renderOne(p);
        failures = 0;
      } catch (e) {
        if (e instanceof StopError) throw e;
        console.log(`  ✗ ${p.unit.id}: ${e.message}`);
        if (++failures >= 3) throw new StopError(`tres fallos seguidos (último: ${e.message.slice(0, 160)})`);
      }
    }
    for (const list of groups.values()) {
      for (let i = 0; i < list.length; i += BATCH) {
        const batch = list.slice(i, i + BATCH);
        const voices = core.pickVoices(batch[0].unit.speakers, catalog);
        console.log(`→ Lote de ${batch.length}: ${batch.map((b) => b.unit.id).join(', ')}`);
        let res = null;
        try {
          res = batch.length > 1 ? await core.renderBatch(batch.map((b) => b.unit), voices, tts) : null;
        } catch (e) {
          if (e instanceof StopError) throw e;
          console.log(`  ✗ lote: ${e.message}`);
        }
        if (res) {
          for (let k = 0; k < batch.length; k++) {
            const seg = res.pcms[k];
            const { pcm, turns } = core.joinSegments([seg], 0, res.rate);
            await store(batch[k], pcm, res.rate, turns, voices);
            made++;
          }
        } else {
          if (batch.length > 1) console.log('  · No se distinguen bien las pausas: las pido una a una.');
          for (const p of batch) await renderOne(p);
        }
      }
    }
  } catch (e) {
    if (e instanceof StopError) {
      console.log(`■ Me paro: ${e.message}`);
      return finish(made, e.message);
    }
    throw e;
  }
  return finish(made);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
