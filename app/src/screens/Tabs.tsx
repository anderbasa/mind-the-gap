// Pestañas principales. En la Fase 1 muestran la estructura y lo que llega en cada fase.
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { profile, store } from '../state';
import { SKILL_ORDER, SKILLS } from '../domain/skills';
import { navigate } from '../router';
import { Band, ListItem, MetroLine, Page, SkillLine, Spinner } from '../ui/components';
import { IconTheo } from '../ui/icons';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;

function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 6) return 'Burning the midnight oil';
  if (h < 13) return 'Good morning';
  if (h < 20) return 'Good afternoon';
  return 'Good evening';
}

function todayEs(d = new Date()): string {
  return new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}

const PhasePill = (props: { n: number }) => <span class="pill">Fase {props.n}</span>;

/* ── Hoy ───────────────────────────────────────────────────────── */

export function Hoy() {
  const name = profile.value?.name.trim();
  return (
    <>
      <Band kicker={`Mind the Gap · ${todayEs()}`} title={`${greeting()}${name ? `, ${name}` : ''}.`} />
      <Page>
        <section class="card stack" style={g(10)}>
          <div class="spread">
            <span class="kicker">Tu trayecto</span>
            <span class="pill">Next station: 180</span>
          </div>
          <MetroLine estimate={null} />
          <p class="muted small">
            Aún no hay nota estimada: Theo no se fía de tu nota del First. El diagnóstico (Fase 6) medirá dónde estás de verdad, y el tramo rojo será tu «gap».
          </p>
        </section>

        <section class="card card-line stack" style={{ ...g(12), '--card-line': 'var(--signal)' } as JSX.CSSProperties}>
          <div class="spread">
            <h2>Sesión de hoy</h2>
            <PhasePill n={7} />
          </div>
          <p>
            Cada día te preguntaré cuánto tiempo tienes, si puedes hablar en voz alta y cómo vas de energía, y montaré la sesión con lo que más puntos te resta.
          </p>
          <p class="muted small">Mientras se construye, ya puedes hablar con Theo por escrito.</p>
          <button class="btn signal" onClick={() => navigate('/theo')}>
            <IconTheo width={22} height={22} /> Habla con Theo
          </button>
        </section>

        <section class="stack" style={g(8)}>
          <span class="kicker">Así va la obra</span>
          <div class="list">
            <ListItem dot="var(--ok)" title="Fase 1 · Base" sub="Login, perfil, Theo, capa de IA, prueba de voz" right={<span class="pill ok">Hecha</span>} />
            <ListItem dot="var(--line-uoe)" title="Fase 2 · Reading & Use of English" sub="Las 8 partes, modo práctica y examen" right={<span class="pill ok">Hecha</span>} />
            <ListItem dot="var(--line-writing)" title="Fase 3 · Writing y Reformular" sub="Corrección, Upgrade to C1, reescritura, Dímelo mejor" right={<span class="pill signal">Ahora</span>} />
            <ListItem dot="var(--line-listening)" title="Fase 4 · Listening" sub="Audios con varios acentos, dictados" />
            <ListItem dot="var(--line-speaking)" title="Fase 5 · Speaking por voz" sub="Simulacro, role-plays, long turn" />
            <ListItem dot="var(--line-vocab)" title="Fases 6–8" sub="Diagnóstico, SRS, sesión diaria, ¿Estoy listo?, Telegram" />
          </div>
        </section>
      </Page>
    </>
  );
}

/* ── Practicar ─────────────────────────────────────────────────── */

export function Practicar() {
  return (
    <>
      <Band kicker="Mind the Gap · Practicar" title="Practise" sub="Formato de examen real, contenido original." />
      <Page>
        <section class="stack" style={g(8)}>
          <span class="kicker">Ya disponible</span>
          <div class="list">
            <ListItem dot={SKILLS.reading.color} title="Reading & Use of English" sub="8 partes · práctica o examen · prioridad P4, P3 y P1" to="/practicar/rue" />
            <ListItem dot={SKILLS.writing.color} title="Writing" sub="Essay, email, letter, proposal, report, review · escrito o en foto" to="/practicar/writing" />
            <ListItem dot="var(--line-grammar)" title="Reformular" sub="Una frase y una instrucción: hasta 3 formas de decirlo" to="/practicar/reformular" />
            <ListItem dot="var(--line-grammar)" title="Dímelo mejor" sub="Pega una frase tuya: corregida, neutra, formal y natural" to="/practicar/dimelo" />
            <ListItem dot="var(--signal)" title="Habla con Theo" sub="Chat por escrito, con correcciones rápidas" to="/theo" />
          </div>
        </section>
        <section class="stack" style={g(8)}>
          <span class="kicker">El examen (próximas fases)</span>
          <div class="list">
            <ListItem dot={SKILLS.listening.color} title="Listening" sub="4 partes, acentos variados, dictados" right={<PhasePill n={4} />} disabled />
            <ListItem dot={SKILLS.speaking.color} title="Speaking" sub="Simulacro con examinador y compañero" right={<PhasePill n={5} />} disabled />
            <ListItem dot="var(--ink)" title="Simulacros" sub="Por paper o completos, en pantalla o en papel" right={<PhasePill n={7} />} disabled />
          </div>
        </section>
        <section class="stack" style={g(8)}>
          <span class="kicker">Herramientas</span>
          <div class="list">
            <ListItem dot="var(--line-grammar)" title="Gramática C1" sub="Inversión, cleft sentences, orden de palabras" right={<PhasePill n={6} />} disabled />
            <ListItem dot="var(--bad)" title="Cuaderno de errores" sub="Tus patrones, con ejercicios dirigidos" right={<PhasePill n={6} />} disabled />
          </div>
        </section>
      </Page>
    </>
  );
}

/* ── Vocabulario ───────────────────────────────────────────────── */

interface VocabRow {
  id: string;
  term: string;
  context: string;
  createdAt: number;
}

function SavedWords() {
  const [rows, setRows] = useState<VocabRow[] | null>(null);
  useEffect(() => {
    store()
      .list<Omit<VocabRow, 'id'>>('vocab', { orderBy: 'createdAt', desc: true, limit: 200 })
      .then(setRows)
      .catch(() => setRows([]));
  }, []);
  const remove = async (id: string) => {
    await store().remove(`vocab/${id}`);
    setRows((r) => (r ?? []).filter((x) => x.id !== id));
  };
  if (!rows) return <Spinner />;
  return (
    <section class="stack" style={g(8)}>
      <span class="kicker">Tus palabras guardadas ({rows.length})</span>
      {rows.length === 0 ? (
        <p class="muted small">Toca cualquier palabra de un texto del Reading para guardarla aquí, con su frase.</p>
      ) : (
        <div class="list">
          {rows.map((w) => (
            <div key={w.id} class="list-item" style={{ cursor: 'default', alignItems: 'flex-start' }}>
              <span class="grow">
                <span class="list-title" style={{ display: 'block' }}>
                  {w.term}
                </span>
                <span class="list-sub read" style={{ fontSize: '15px' }}>
                  {w.context}
                </span>
              </span>
              <button class="linkbtn" onClick={() => remove(w.id)}>
                Quitar
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function Vocabulario() {
  return (
    <>
      <Band kicker="Mind the Gap · Vocabulario" title="Vocabulary" line="var(--line-vocab)" />
      <Page>
        <SavedWords />
        <section class="card stack" style={g(10)}>
          <div class="spread">
            <h2>Repaso espaciado</h2>
            <PhasePill n={6} />
          </div>
          <p>
            Tarjetas siempre en contexto (significado, hueco, word formation, collocation y producción del castellano al inglés), programadas con el algoritmo FSRS.
          </p>
          <p class="muted small">
            Una palabra solo pasa a «dominada» cuando la usas bien tres veces sin que te la pidan, en un writing o un speaking. Acertar tarjetas no basta.
          </p>
        </section>
      </Page>
    </>
  );
}

/* ── Progreso ──────────────────────────────────────────────────── */

export function Progreso() {
  return (
    <>
      <Band kicker="Mind the Gap · Progreso" title="Progress" />
      <Page>
        <section class="card stack" style={g(16)}>
          <div class="spread">
            <span class="kicker">Nota estimada por destreza</span>
            <span class="pill">frente a 180</span>
          </div>
          {SKILL_ORDER.map((k) => (
            <SkillLine key={k} label={SKILLS[k].label} color={SKILLS[k].color} score={null} />
          ))}
          <p class="muted small">Las notas aparecerán tras el diagnóstico. Siempre se mostrarán como estimación, con su margen y cómo se han calculado.</p>
        </section>
        <section class="card stack" style={g(10)}>
          <div class="spread">
            <h2>¿Estoy listo?</h2>
            <PhasePill n={7} />
          </div>
          <p>Criterio por defecto: global ≥ 185 en dos simulacros completos y ninguna destreza por debajo de 170. Se puede cambiar.</p>
        </section>
      </Page>
    </>
  );
}
