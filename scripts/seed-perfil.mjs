// Siembra tu perfil en Firestore (users/{UID}/meta/profile) para que el onboarding
// te lo muestre ya rellenado. Tus datos viven en local/perfil.local.json, que NO se sube
// al repo (está en .gitignore).
//
// Uso:   npm run seed -- <TU_UID>            (no pisa un perfil que ya exista)
//        npm run seed -- <TU_UID> --force    (lo sobrescribe)
//
// Usa la sesión del Firebase CLI que ya tienes iniciada (la misma con la que se creó el proyecto).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = 'mind-the-gap-ander';
// Carpeta de firebase-tools (el CLI). Se puede indicar con FIREBASE_TOOLS_DIR.
function findFirebaseTools() {
  if (process.env.FIREBASE_TOOLS_DIR) return process.env.FIREBASE_TOOLS_DIR;
  try {
    return dirname(require.resolve('firebase-tools/package.json'));
  } catch {
    console.error('No encuentro firebase-tools. Indica su carpeta con FIREBASE_TOOLS_DIR=…/node_modules/firebase-tools');
    process.exit(1);
  }
}
const FIREBASE_TOOLS = findFirebaseTools().replace(/\\/g, '/');

const [uid, flag] = process.argv.slice(2);
if (!uid) {
  console.error('Falta el UID: npm run seed -- <TU_UID>');
  process.exit(1);
}

const profile = JSON.parse(readFileSync(join(root, 'local', 'perfil.local.json'), 'utf8'));
profile.confirmedAt = null; // que el onboarding te lo enseñe para confirmar

const auth = require(`${FIREBASE_TOOLS}/lib/auth.js`);
const scopes = require(`${FIREBASE_TOOLS}/lib/scopes.js`);
const account = auth.getGlobalDefaultAccount();
if (!account?.tokens?.refresh_token) {
  console.error('No hay sesión del Firebase CLI. Ejecuta antes: firebase login');
  process.exit(1);
}
const { access_token } = await auth.getAccessToken(account.tokens.refresh_token, [scopes.CLOUD_PLATFORM]);

// JSON → formato de valores de la API REST de Firestore
const toValue = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
};

const docPath = `projects/${PROJECT}/databases/(default)/documents/users/${uid}/meta/profile`;
const precondition = flag === '--force' ? '' : '?currentDocument.exists=false';
const res = await fetch(`https://firestore.googleapis.com/v1/${docPath}${precondition}`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ fields: Object.fromEntries(Object.entries(profile).map(([k, v]) => [k, toValue(v)])) }),
});

if (res.ok) console.log(`Perfil sembrado en users/${uid}/meta/profile ✔`);
else if (res.status === 400 || res.status === 409 || res.status === 412) console.log('Ya existe un perfil: no lo toco (usa --force para sobrescribir).');
else {
  console.error(`Error ${res.status}: ${await res.text()}`);
  process.exit(1);
}
