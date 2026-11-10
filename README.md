# Mind the Gap

Tu profe particular de inglés con IA (**Theo**) para pasar de B2 a **C1 Advanced** (Cambridge, 180+).
Web instalable en el iPhone (PWA) y usable en el ordenador. La usa una sola persona.

> **Estado:** Fase 1 (base) terminada. Ver «Fases» al final.

---

## Qué hay dentro

| Pieza | Qué hace | Coste |
|---|---|---|
| **GitHub Pages** | Sirve la app (`app/`, Vite + Preact + TypeScript) | Gratis |
| **Firebase** (plan Spark) | Login con Google (solo tu cuenta) y base de datos Firestore | Gratis |
| **Cloudflare Worker** (`worker/`) | Guarda las claves de IA y solo atiende a tu cuenta | Gratis |
| **Gemini** (capa gratuita) | Generar ejercicios, chat de Theo, transcribir audio, voces | 0 € |
| **Claude Sonnet 5.5** | Corregir writings y speakings (Fases 3 y 5) | ≈2–4 $/mes, tope 5 $ |

- Las claves de API **nunca** están en la app: viven como secretos en el Worker.
- Tu perfil y las notas de Theo viven **solo en Firestore**. El repo es público y no contiene datos personales: los prompts (`prompts/`) usan huecos que se rellenan al usarlos.
- Tus grabaciones de voz **no se suben nunca**: se quedan en el propio dispositivo (IndexedDB). A Firestore solo va el texto (transcripción y feedback).

### Sobre la capa gratuita de Gemini en la UE

Los términos de la API de Gemini piden usar la capa de pago para apps puestas a disposición de usuarios del EEE. También dicen que, a quien está en el EEE, se le aplican las condiciones de privacidad de pago incluso en la cuota gratuita. Para una app personal en la que eres desarrollador y único usuario, es una zona gris. Elegiste usar la capa gratuita. Si un día prefieres la lectura estricta, se activa la facturación en Google AI Studio con un tope: es un cambio de configuración, no de código. (Esto es una lectura de los términos, no asesoría legal.)

---

## Puesta en marcha (una sola vez)

Cada paso dice **quién** lo hace. Lo que pone «tú» necesita tu cuenta o tus claves, y no puedo hacerlo yo.

### 1. Activar el login con Google en Firebase (tú, 2 minutos)

El proyecto `mind-the-gap-ander` ya está creado, con Firestore en Madrid y las reglas cerradas.

1. Abre <https://console.firebase.google.com/project/mind-the-gap-ander/authentication> y entra con tu cuenta de Google de siempre.
2. Si sale un botón **«Comenzar»** (*Get started*), púlsalo.
3. Pestaña **«Método de inicio de sesión»** (*Sign-in method*) → **«Google»**.
4. Activa el interruptor **«Habilitar»**, elige tu correo en **«Correo electrónico de asistencia»** y pulsa **«Guardar»**.
5. Pestaña **«Configuración»** (*Settings*) → **«Dominios autorizados»** → **«Añadir dominio»** → escribe `anderbasa.github.io` → **«Añadir»**.

### 2. Crear el repositorio y activar GitHub Pages (tú y yo)

1. (Tú) Ve a <https://github.com/new>. Nombre: `mind-the-gap`. Visibilidad: **Public** (GitHub Pages gratis lo exige). **No** marques «Add a README». Pulsa **«Create repository»**.
2. (Yo, cuando me des el visto bueno) Subo el código.
3. (Tú) En el repositorio: **Settings → Pages → Build and deployment → Source: «GitHub Actions»**.
4. La app quedará en <https://anderbasa.github.io/mind-the-gap/>.

### 3. Clave de Gemini (tú, 3 minutos, gratis)

1. Abre <https://aistudio.google.com/apikey> con tu cuenta de Google.
2. Pulsa **«Create API key»**. Si te pide un proyecto, elige **«Mind the Gap»** (`mind-the-gap-ander`).
3. Copia la clave (empieza por `AQ.`: es el formato nuevo de Google desde 2026, está bien) y guárdala un momento en un sitio seguro. **No me la pegues en el chat ni la escribas en la terminal**: la meterás tú en el panel de Cloudflare (paso 5).
4. No actives la facturación: así sigues en la capa gratuita.

### 4. Clave de Claude con tope de gasto (tú, 5 minutos, 5 $) — puede esperar

Claude solo se usa para corregir writings y speakings (Fases 3 y 5). Mientras no esté, la app corrige con Gemini 3.8 Flash automáticamente. Cuando cargues el saldo:

1. Abre <https://platform.claude.com> y crea una cuenta (o entra si ya tienes).
2. **Billing** → compra **5 $** de créditos. **Desactiva «Auto-reload»** (recarga automática): así nunca puedes gastar más de lo que has cargado.
3. **Limits** (*Settings → Limits*) → pon un **límite mensual de 5 $**.
4. **API keys → Create key**. Nombre: `mind-the-gap`. Copia la clave (empieza por `sk-ant-…`). **Tampoco me la pegues en el chat.**

### 5. Cloudflare Worker (tú y yo, 10 minutos, gratis)

1. (Tú) Crea una cuenta gratuita en <https://dash.cloudflare.com/sign-up>.
2. (Tú) En una terminal, dentro de la carpeta del proyecto (`proyectos\mind-the-gap`):
   ```bash
   npx.cmd wrangler login
   ```
   Se abre el navegador: pulsa **«Allow»**.
3. (Yo) Publico el Worker con `npm run worker:deploy`. Su dirección es `https://mind-the-gap.mind-the-gap-worker.workers.dev` y ya está puesta en la app (`app/src/config.ts`).
4. (Tú) Guarda cada clave como **secreto** del Worker desde el panel de Cloudflare (lo más sencillo):
   1. Abre <https://dash.cloudflare.com> → **Workers & Pages** → **mind-the-gap**.
   2. **Settings** → **Variables and Secrets** → **+ Add**.
   3. **Type: Secret**. **Variable name:** `GEMINI_API_KEY`. **Value:** pega la clave de Gemini. Pulsa **Deploy**.
   4. Cuando tengas la de Claude, repite con el nombre `ANTHROPIC_API_KEY`.

   (Alternativa en terminal: `npx.cmd wrangler secret put GEMINI_API_KEY --config worker/wrangler.jsonc`, y pegar la clave **solo** cuando ponga `Enter a secret value:`.)
5. Nada más: la dirección del Worker ya va en la app. (Opcional: si algún día cambia, puedes ponerla en GitHub → **Settings → Secrets and variables → Actions → Variables** con el nombre `WORKER_URL`, o en la app en **Ajustes → Conexión**.)

### 6. Primer login y autorizar tu cuenta (tú y yo)

1. (Tú) Abre la app y pulsa **«Entrar con Google»**. Saldrá «Tu cuenta aún no está autorizada» con tu UID.
2. (Yo) Apunto tu UID en las reglas de Firestore y en el Worker y lo publico. También siembro tu perfil desde `local/perfil.local.json` (no se sube al repo).
3. (Tú) Recarga: verás la bienvenida de Theo con tus datos para confirmar.

### 7. Instalar en el iPhone y pasar la prueba de voz (tú)

1. En Safari, abre <https://anderbasa.github.io/mind-the-gap/> → botón **Compartir** → **«Añadir a pantalla de inicio»**.
2. En la app: **Ajustes → Prueba de voz**. Hazla **dos veces**: una en Safari y otra desde el icono. Mejor en casa, porque hay que hablar.
3. Los resultados se guardan solos y yo los puedo revisar.

---

## Desarrollo

```bash
npm install
```
```bash
npm run dev
```
Abre <http://localhost:5181/mind-the-gap/?demo>. El **modo demo** usa datos en el navegador y una IA de mentira: sirve para probar la interfaz sin login.

| Comando | Para qué |
|---|---|
| `npm test` | Tests de la app y del Worker |
| `npm run typecheck` | Comprobación de tipos |
| `npm run build` | Compila la app en `app/dist` |
| `npm run icons` | Regenera iconos y pantallas de arranque del iPhone |
| `npm run worker:dev` / `worker:deploy` | Worker en local / publicarlo |
| `npm run seed -- <UID>` | Siembra tu perfil en Firestore desde `local/perfil.local.json` |

Reglas de Firestore: `firebase deploy --only firestore:rules --project mind-the-gap-ander`.

### Estructura

```
app/        La web (Preact + TypeScript). src/ai = capa de IA, src/voice = audio, src/screens = pantallas
worker/     Cloudflare Worker: verifica tu sesión y reenvía a Gemini / Claude / Pexels
prompts/    Prompts de Theo, versionados (tutor-system.md + tasks/)
scripts/    Iconos, siembra del perfil (y en fases siguientes: banco de ejercicios, Telegram)
local/      Tus datos personales para sembrar el perfil. NO se sube (está en .gitignore)
```

### La capa de IA

Todo pasa por `runAI({ task, system, messages, schema })` (`app/src/ai/client.ts`):

- Cada tarea tiene una cadena de modelos con respaldos (`providers.ts`), que se puede cambiar desde **Ajustes → IA y uso**.
- Reintenta ante límites de uso (429) y, si la cuota gratuita de un modelo se agota, pasa al siguiente.
- Valida la salida JSON con Zod y guarda en caché de Firestore lo que se pida.
- Cuenta peticiones, tokens y coste por día (`usage/`). Respeta el tope mensual de Claude.
- Lo que necesite IA sí o sí y no pueda hacerse entra en una cola (`queue/`) y se procesa al volver.

---

## Fases

- [x] **0 · Investigación y decisiones** — formato del examen verificado y elección de IA, voz, diseño y stack.
- [x] **1 · Base** — PWA, login, perfil, Firestore con reglas, navegación, capa de IA, Worker, prompts, prueba de voz.
- [ ] **2 · Reading & Use of English** — motor de ejercicios, validador, las 8 partes y banco precargado.
- [ ] **3 · Writing y Reformular**
- [ ] **4 · Listening**
- [ ] **5 · Speaking por voz**
- [ ] **6 · Diagnóstico, cuaderno de errores, vocabulario (FSRS), gramática y memoria de Theo**
- [ ] **7 · Sesión de hoy, simulacros y «¿Estoy listo?»**
- [ ] **8 · Rachas, logros, Telegram y pulido**

Contenido: todo lo que se genera es original y tiene formato de examen. Nada se copia de material oficial de Cambridge. Para práctica real, usa los [sample tests oficiales gratuitos](https://www.cambridgeenglish.org/exams-and-tests/qualifications/advanced/preparation/).
