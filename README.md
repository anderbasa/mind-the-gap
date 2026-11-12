# Mind the Gap

Tu profe particular de inglés con IA (**Theo**) para pasar de B2 a **C1 Advanced** (Cambridge, 180+).
Web instalable en el iPhone (PWA) y usable en el ordenador. La usa una sola persona.

> **Estado:** Fases 1 a 6 terminadas y la 7 a medias (sesión de hoy e informe semanal hechos). Ver «Fases» al final.

---

## Qué hay dentro

| Pieza | Qué hace | Coste |
|---|---|---|
| **GitHub Pages** | Sirve la app (`app/`, Vite + Preact + TypeScript) | Gratis |
| **Firebase** (plan Spark) | Login con Google (solo tu cuenta) y base de datos Firestore | Gratis |
| **Cloudflare Worker** (`worker/`) | Guarda las claves de IA y solo atiende a tu cuenta | Gratis |
| **Gemini** (capa gratuita) | Generar ejercicios, chat de Theo, transcribir audio, voces | 0 € |
| **Claude Sonnet 5.5** | Corregir writings y speakings, **solo cuando tú lo eliges** en cada corrección | ≈0,10 $ por writing, tope 5 $/mes |

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

Claude solo se usa para corregir writings y speakings, y **nunca por su cuenta**: tiene que estar encendido en **Ajustes → IA y uso → Usar Claude** y, además, en cada corrección eliges «Corregir gratis (Gemini)» o «Corregir con Claude», que te enseña el coste y te pide confirmación. Mientras no lo cargues, todo se corrige gratis con Gemini. Cuando cargues el saldo:

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

### 8. Clave de Gemini en GitHub para los audios del Listening (tú, 2 minutos, gratis)

Los audios del Listening se generan **una sola vez** en GitHub (con la voz de Gemini, gratis) y se guardan en el repo como mp3. Para eso GitHub necesita tu clave de Gemini como «secret» (cifrado: nadie la ve, ni yo).

1. Abre <https://github.com/anderbasa/mind-the-gap/settings/secrets/actions>.
2. **New repository secret**. Name: `GEMINI_API_KEY`. Secret: tu clave de Gemini (la de AI Studio, la misma que pusiste en Cloudflare). **Add secret**.
3. Abre la pestaña **Actions** → **Audios del Listening** → **Run workflow** → **Run workflow**.
4. Tarda unos minutos. Si la cuota gratuita del día se acaba, sigue sola al día siguiente (se ejecuta cada mañana). En la app, **Practicar → Listening** te dice cuántos audios hay listos.

Mientras tanto, cada listening tiene un botón **«Generarlo aquí (gratis)»** que crea el audio en tu dispositivo.

La voz gratuita de Gemini da unas 10 peticiones al día por modelo, así que el generador ahorra: una petición por conversación, frases sueltas en lotes y, si se agota un modelo, sigue con el otro. Las voces del examinador y del compañero del Speaking salen del mismo proceso.

### 9. Clave de Pexels para las fotos del Speaking (tú, 3 minutos, gratis)

1. Crea una cuenta gratis en <https://www.pexels.com/join> y entra en <https://www.pexels.com/api/>. Pide tu clave (en el uso, pon algo como «personal English practice app»).
2. Cloudflare → **Workers & Pages → mind-the-gap → Settings → Variables and Secrets → Add** → Type **Secret**, Name `PEXELS_API_KEY`, Value: tu clave → **Deploy**.

Hasta entonces, las fotos de la Parte 2 salen descritas en texto.

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
scripts/    Iconos, siembra del perfil, audios del Listening (render-listening.mjs; prueba local: --dry --out <carpeta>)
local/      Tus datos personales para sembrar el perfil. NO se sube (está en .gitignore)
```

### La capa de IA

Todo pasa por `runAI({ task, system, messages, schema })` (`app/src/ai/client.ts`):

- Cada tarea tiene una cadena de modelos con respaldos (`providers.ts`), que se puede cambiar desde **Ajustes → IA y uso**.
- Reintenta ante límites de uso (429) y, si la cuota gratuita de un modelo se agota, pasa al siguiente.
- Valida la salida JSON con Zod y guarda en caché de Firestore lo que se pida.
- Cuenta peticiones, tokens y coste por día (`usage/`). Respeta el tope mensual de Claude.
- Lo que necesite IA sí o sí y no pueda hacerse entra en una cola (`queue/`) y se procesa al volver.
- **Nada gasta saldo sin que lo elijas:** los modelos de pago solo se usan si la petición lleva `allowPaid: true` (una acción que acabas de confirmar) **y** «Usar Claude» está encendido.
- Modo demo para probar pantallas sin gastar cuota: `http://localhost:5181/mind-the-gap/?demo` (respuestas de ejemplo en `app/src/ai/mockData.ts`).

---

## Fases

- [x] **0 · Investigación y decisiones** — formato del examen verificado y elección de IA, voz, diseño y stack.
- [x] **1 · Base** — PWA, login, perfil, Firestore con reglas, navegación, capa de IA, Worker, prompts, prueba de voz.
- [x] **2 · Reading & Use of English** — las 8 partes en modo práctica y examen, corrección (P4 de 0 a 2), «Explícamelo en castellano», «Reportar pregunta», tocar palabras para guardarlas y un banco de 40 ejercicios escritos a mano. Generar con IA queda como opción experimental, solo cuando la pulsas.
- [x] **3 · Writing y Reformular** — 12 enunciados (essay, letter, email, proposal, report, review) con plan de párrafos, banco de lenguaje y cronómetro opcional. Entrega escrita (sin autocorrector, con contador 220–260) o en foto (Gemini transcribe tal cual y avisa de lo que no ha leído bien). Corrección con los 4 criterios (0–5), nota orientativa en la escala, errores marcados en tu texto, Upgrade to C1, cohesión, palabras repetidas (las que adoptas van a tu vocabulario), versión modelo y reescritura con comparación de nota. Todos los errores van al cuaderno de errores. **Reformular** (39 frases escritas a mano; hasta 3 versiones corregidas al momento) y **Dímelo mejor** (corregida + neutra, formal y natural).
- [x] **4 · Listening** — guiones originales de las 4 partes (2 por parte para empezar) con voces y acentos variados (británico, americano, australiano, irlandés, escocés). Modo examen (tiempo de lectura y cada audio dos veces sin pausa) y práctica (pausa, velocidad sin cambiar el tono, «Repetir frase»). Corrección con la transcripción y la frase exacta de cada respuesta; tocar una frase la vuelve a reproducir. 24 dictados en tres niveles con comparación palabra a palabra, 22 fenómenos de «inglés hablado real» con audio y enlaces a podcasts, radio y series. Los audios los genera GitHub una vez (`.github/workflows/audio.yml`) y, si falta alguno, se puede generar en el dispositivo.
- [x] **5 · Speaking por voz** — simulacro completo de las 4 partes por turnos (Theo de examinador y un compañero, con los tiempos reales; voces pregrabadas en GitHub y la del dispositivo mientras tanto), partes sueltas, fotos de Pexels, entrenamiento del long turn (30 → 90 s) con «dilo otra vez, pero mejor», role-plays y conversación libre con Gemini Live (o por turnos si no está disponible) con botón «Help». Al final: transcripción literal, palabras por minuto, muletillas, pausas, pronunciación, los 6 criterios, nota orientativa, «say it better» y registro de los recursos C1 que de verdad usas. Las grabaciones se quedan en el dispositivo; a Firestore solo va el texto.
- [x] **6 · Diagnóstico, cuaderno de errores, vocabulario (FSRS), gramática y memoria de Theo** — diagnóstico completo (~60 min en 5 bloques reanudables) y mini-diagnóstico mensual, con la nota estimada por destreza en Hoy y Progreso; memoria de Theo (Ajustes); cuaderno de errores con patrones (al tercer error), tus 5 errores top, práctica dirigida y tarjetas; vocabulario con repaso espaciado FSRS (pack de inicio de 60 tarjetas, tus palabras guardadas → tarjetas, alta manual, buscador, tope diario de nuevas y «dominada» solo tras 3 usos espontáneos en writings y speakings); gramática C1 (12 puntos con microlección, bloques de colores, «explícamelo de otra forma» y producción libre corregida; se domina con 4 de 5) y minijuegos de orden de palabras e idioms.
- [x] **7 · Sesión de hoy, simulacros y «¿Estoy listo?»** — sesión de hoy (tiempo, si puedes hablar y energía → plan con «por qué te toca esto», regla: distancia a 180 + días sin practicar + errores recientes; modo mínimo de 5 min, modo silencioso con el speaking pendiente para casa, fin de semana con tareas largas y bienvenida tras días sin entrar; las tareas se marcan solas al hacerlas), informe semanal con resumen de Theo y notas con las tablas oficiales de conversión de Cambridge. **Simulacros** por paper o completos (Practicar → Simulacros), con las mismas pantallas en modo examen y ejercicios que aún no has hecho; el Paper 1 también **en papel**: página imprimible (o «Guardar como PDF») con hoja de respuestas del 1 al 56, y después metes lo que marcaste y se corrige. **«¿Estoy listo?»**: nota de hoy con margen (media ponderada: oficial ×3, simulacro ×2, diagnóstico ×1,5, mini ×1, y cada nota pesa la mitad cada 30 días), tendencia por semana, criterio editable (por defecto: global ≥ 185 en los 2 últimos simulacros completos y ninguna destreza < 170), aviso de reservar cuando al ritmo actual faltan ≤ 10 semanas con enlace al [buscador oficial de centros](https://www.cambridgeenglish.org/find-a-centre/find-an-exam-centre/), fecha del examen → cuenta atrás (también en Hoy) con consejos por tramo, y registro de sample tests oficiales (puntos brutos → escala oficial) para ver si la app te infla o te infravalora.
- [ ] **8 · Rachas, logros, Telegram y pulido** — hecho: **racha** (un día cuenta con 10 min de estudio activo —la app abierta y usándola, escuchando o grabando— o con la sesión de hoy completa; un comodín automático por semana protege un día fallado), **XP** que premia lo que te cuesta (base según lo difícil: writing 40, Part 4 12, tarjeta 1…; ×1,75 en tu destreza más floja y ×0,75 en las que pasan de 185; tarjetas con tope de 20 XP al día; objetivo diario en Ajustes), panel en Hoy (racha, XP de hoy frente al objetivo y la semana en barras), tiempo de estudio por semana en Progreso, y **logros e hitos B2 → C1** que Theo celebra con datos concretos (página Logros). Falta: Escenas de series, bot de Telegram y pulido.

Contenido: todo lo que se genera es original y tiene formato de examen. Nada se copia de material oficial de Cambridge. Para práctica real, usa los [sample tests oficiales gratuitos](https://www.cambridgeenglish.org/exams-and-tests/qualifications/advanced/preparation/).
