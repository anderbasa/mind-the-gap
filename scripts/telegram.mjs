// Avisos de Mind the Gap por Telegram. Lo lanza .github/workflows/telegram.yml (cron cada 30 min,
// de 4 a 22 UTC): decide con la hora de Madrid qué toca (mediodía, noche si la racha peligra,
// resumen del domingo) y lo manda una sola vez al día. Sin dependencias: Firestore por REST con
// la cuenta de servicio (JWT firmado con node:crypto).
//
// OJO: el repo es público y los logs de Actions también. Nunca se imprime el token, el chat_id
// ni el contenido de tus datos; solo qué se ha enviado.
//
//   node scripts/telegram.mjs            → modo normal (decide por la hora)
//   node scripts/telegram.mjs --prueba   → manda ya un mensaje de prueba con la sesión sugerida
//   node scripts/telegram.mjs --seco     → (solo en tu ordenador) imprime el mensaje en vez de enviarlo; no apunta nada.
//                                          Acepta ACCESS_TOKEN + FIREBASE_PROJECT en lugar de la cuenta de servicio.
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as plan from '../app/src/planner/plan.ts';
import * as rules from '../app/src/progress/rules.ts';
import * as tg from '../app/src/notify/telegram.ts';

const SECO = process.argv.includes('--seco');
const PRUEBA = SECO || process.argv.includes('--prueba');
const APP_URL = process.env.APP_URL || 'https://anderbasa.github.io/mind-the-gap/';
const UID = process.env.MTG_UID;
const { FIREBASE_SERVICE_ACCOUNT, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, GEMINI_API_KEY } = process.env;

function fin(msg, code = 0) {
  console.log(msg);
  process.exit(code);
}

const LOCAL = SECO && !!process.env.ACCESS_TOKEN && !!process.env.FIREBASE_PROJECT;
const need = SECO ? (LOCAL ? ['MTG_UID'] : ['FIREBASE_SERVICE_ACCOUNT', 'MTG_UID']) : ['FIREBASE_SERVICE_ACCOUNT', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'MTG_UID'];
const missing = need.filter((k) => !process.env[k]?.trim());
if (missing.length) fin(`Telegram sin configurar: faltan ${missing.join(', ')} (README, paso 10). No se envía nada.`);

let sa = LOCAL ? { project_id: process.env.FIREBASE_PROJECT } : null;
if (!LOCAL) try {
  sa = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
} catch {
  fin('FIREBASE_SERVICE_ACCOUNT no es un JSON válido: pega el archivo entero de la clave, tal cual.', 1);
}

/* ── Firestore por REST ─────────────────────────────────────────── */

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
  });
  if (!res.ok) fin(`Google no ha aceptado la cuenta de servicio (HTTP ${res.status}). Revisa el secret FIREBASE_SERVICE_ACCOUNT.`, 1);
  return (await res.json()).access_token;
}

const BASE = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents`;
let TOKEN = '';

function decode(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(decode);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, decode(x)]));
  return null;
}
const fromDoc = (d) => (d?.fields ? decode({ mapValue: { fields: d.fields } }) : null);

async function getDoc(path) {
  const res = await fetch(`${BASE}/users/${UID}/${path}`, { headers: { authorization: `Bearer ${TOKEN}` } });
  if (res.status === 404) return null;
  if (!res.ok) fin(`No he podido leer Firestore (HTTP ${res.status}).`, 1);
  return fromDoc(await res.json());
}

async function lastDays(limit = 60) {
  const res = await fetch(`${BASE}/users/${UID}:runQuery`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'days' }], orderBy: [{ field: { fieldPath: 'date' }, direction: 'DESCENDING' }], limit } }),
  });
  if (!res.ok) fin(`No he podido leer tus días (HTTP ${res.status}).`, 1);
  return (await res.json()).map((r) => fromDoc(r.document)).filter(Boolean);
}

async function markSent(kind, date) {
  const res = await fetch(`${BASE}/users/${UID}/meta/telegram?updateMask.fieldPaths=${kind}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ fields: { [kind]: { stringValue: date } } }),
  });
  if (!res.ok) console.log(`Aviso: no he podido apuntar el envío de «${kind}» (HTTP ${res.status}).`);
}

/* ── Telegram ───────────────────────────────────────────────────── */

async function send(text, button) {
  if (SECO) {
    console.log(`--- mensaje (${button?.text ?? 'sin botón'} → ${button?.url ?? ''}) ---
${text}
---`);
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(button ? { reply_markup: { inline_keyboard: [[{ text: button.text, url: button.url }]] } } : {}),
    }),
  });
  if (!res.ok) {
    const why = res.status === 401 ? 'el token del bot no es válido' : res.status === 400 || res.status === 403 ? 'el chat_id no es correcto o no has pulsado «Iniciar» en tu bot' : `HTTP ${res.status}`;
    fin(`Telegram no ha aceptado el mensaje: ${why}.`, 1);
  }
}

/* ── Comentario de Theo (Gemini, gratis; opcional) ──────────────── */

const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];

async function theoComment(vars) {
  if (!GEMINI_API_KEY?.trim()) return null;
  try {
    const raw = await readFile(new URL('../prompts/tasks/telegram-sunday.md', import.meta.url), 'utf8');
    const body = raw.replace(/^---[\s\S]*?---\s*/, '').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
    for (const model of GEMINI_MODELS) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY.trim() },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: body }] }], generationConfig: { maxOutputTokens: 300, temperature: 0.7 } }),
      });
      if (!res.ok) {
        console.log(`Theo (${model}): HTTP ${res.status}, pruebo el siguiente.`);
        continue;
      }
      const j = await res.json();
      const text = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
      if (text) return text.slice(0, 600);
    }
  } catch {
    console.log('Theo: no he podido escribir el comentario (se manda sin él).');
  }
  return null;
}

/* ── Principal ──────────────────────────────────────────────────── */

TOKEN = LOCAL ? process.env.ACCESS_TOKEN : await accessToken();
const now = Date.now();
const m = tg.madridNow(now);
const [settingsDoc, sentDoc, digest, notes, days] = await Promise.all([getDoc('meta/settings'), getDoc('meta/telegram'), getDoc('meta/digest'), getDoc('tutorNotes/current'), lastDays()]);

const cfg = { ...tg.DEFAULT_TELEGRAM, ...(settingsDoc?.telegram ?? {}) };
const streak = rules.computeStreak(days, m.date);
const examDays = tg.examDaysLeft(settingsDoc?.examDate, m.date);
const kinds = SECO ? ['daily', 'evening', 'sunday'] : PRUEBA ? ['daily'] : tg.due(now, cfg, sentDoc ?? {}, streak);
if (!kinds.length) fin(`Nada que enviar (Madrid ${m.date} ${m.hour}h).`);

for (const kind of kinds) {
  if (kind === 'daily') {
    let tasks = [];
    let greeting;
    if (digest?.state) {
      const p = plan.buildPlan(digest.state, { minutes: 30, canSpeak: true, energy: 'normal' }, now);
      tasks = p.tasks.filter((t) => !t.postponed);
      greeting = p.greeting;
    }
    const stale = !!digest?.updatedAt && now - digest.updatedAt > 36 * 3_600_000;
    const text = tg.dailyText({ tasks, greeting, challenge: notes?.nextChallenge ?? null, streak, examDays, stale });
    await send(PRUEBA ? `<i>Mensaje de prueba</i>\n\n${text}` : text, { text: 'Empezar la sesión', url: `${APP_URL}#/sesion` });
  } else if (kind === 'evening') {
    await send(tg.eveningText({ streak, todayMin: streak.todayMin }), { text: 'Modo mínimo (5 min)', url: `${APP_URL}#/sesion` });
  } else if (kind === 'sunday') {
    const mon = rules.mondayOf(m.date);
    const week = days.filter((d) => d.date >= mon && d.date <= m.date);
    const report = await getDoc(`reports/week-${mon}`);
    let theo = null;
    if (!report?.summary) {
      const prio = digest?.state ? plan.priorities(digest.state, now).slice(0, 2).map((x) => ({ label: x.skill, why: x.why })) : [];
      const notesText = notes ? [notes.summary, notes.weaknesses, notes.patterns, notes.nextChallenge].flat().filter(Boolean).map(String).join(' · ').slice(0, 800) : '(none yet)';
      theo = await theoComment({ stats: tg.weekStatsText({ week, streak, estimate: digest?.estimate ?? null, priorities: prio, examDays }), notes: notesText });
    }
    await send(tg.sundayText({ week, streak, estimate: digest?.estimate ?? null, report: report?.summary ? { summary: report.summary, focus: report.focus ?? [] } : null, theo, examDays }), {
      text: 'Ver tu informe',
      url: `${APP_URL}#/informe`,
    });
  }
  if (!PRUEBA) await markSent(kind, m.date);
  console.log(`Enviado: ${kind}${PRUEBA ? ' (prueba)' : ''}.`);
}
