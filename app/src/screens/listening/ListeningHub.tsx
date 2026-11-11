// Índice del Listening: las 4 partes, herramientas (dictados, inglés hablado real)
// y enlaces a audio real.
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { hasBankAudio, listeningProgress, loadManifest, loadSets, type LProgress } from '../../listening/bank';
import { LPART_INFO, LPARTS, unitsOf, type ListeningSetT } from '../../listening/schema';
import type { Manifest } from '../../listening/ttsCore';
import { navigate } from '../../router';
import { Band, ListItem, Page, Segmented, Spinner } from '../../ui/components';
import { IconChevron } from '../../ui/icons';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;
const MODE_KEY = 'mtg.listeningMode';

function readMode(): 'practice' | 'exam' {
  try {
    return localStorage.getItem(MODE_KEY) === 'exam' ? 'exam' : 'practice';
  } catch {
    return 'practice';
  }
}

export function ListeningHub() {
  const [mode, setModeState] = useState<'practice' | 'exam'>(readMode());
  const [sets, setSets] = useState<ListeningSetT[] | null>(null);
  const [prog, setProg] = useState<LProgress | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [ready, setReady] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([loadSets(), listeningProgress(), loadManifest()]).then(async ([s, p, m]) => {
      setSets(s);
      setProg(p);
      setManifest(m);
      const ok = new Set<string>();
      for (const set of s) if ((await Promise.all(unitsOf(set).map(hasBankAudio))).every(Boolean)) ok.add(set.id);
      setReady(ok);
    });
  }, []);

  const setMode = (m: 'practice' | 'exam') => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* nada */
    }
  };

  const st = manifest?.status;

  return (
    <>
      <Band back="/practicar" kicker="Practicar · Paper 3" title="Listening" sub="≈ 40 min · 4 partes · 30 preguntas" line="var(--line-listening)" />
      <Page>
        <Segmented
          label="Modo"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'practice', label: 'Práctica' },
            { value: 'exam', label: 'Examen' },
          ]}
        />
        <p class="muted small">
          {mode === 'practice'
            ? 'Práctica: pausa, velocidad, «Repetir frase» para volver a oír un trozo y, al corregir, la transcripción con las respuestas marcadas.'
            : 'Examen: tiempo para leer las preguntas y cada audio suena dos veces, sin pausa, como el día del examen. Usa auriculares.'}
        </p>

        {!sets || !prog ? (
          <Spinner />
        ) : (
          <div class="list">
            {LPARTS.map((p) => {
              const info = LPART_INFO[p];
              const ofPart = sets.filter((s) => s.part === p);
              const unseen = ofPart.filter((s) => !prog.seen.has(s.id)).length;
              const withAudio = ofPart.filter((s) => ready.has(s.id)).length;
              const best = ofPart.map((s) => prog.best[s.id]).filter((x) => x != null);
              return (
                <button key={p} class="list-item" onClick={() => navigate(`/practicar/listening/${p}?mode=${mode}`)}>
                  <span class="line-dot" style={{ '--dot': 'var(--line-listening)' } as JSX.CSSProperties} />
                  <span class="grow">
                    <span class="list-title" style={{ display: 'block' }}>
                      {info.name}
                    </span>
                    <span class="list-sub" style={{ display: 'block' }}>
                      {info.short}
                    </span>
                    <span class="list-sub">
                      {unseen} sin hacer de {ofPart.length} · audio listo: {withAudio}/{ofPart.length}
                      {best.length ? ` · mejor: ${Math.max(...best)} %` : ''}
                    </span>
                  </span>
                  <IconChevron class="chev" width={20} height={20} />
                </button>
              );
            })}
          </div>
        )}

        {manifest && (
          <div class={`notice ${st && st.done >= st.total ? 'ok' : 'info'} small`}>
            <span>
              {!st
                ? 'Los audios del banco aún no se han generado. Los genera GitHub con tu clave de Gemini (gratis) en cuanto añadas el secret; mientras tanto puedes generar cada uno en este dispositivo.'
                : st.done >= st.total
                  ? `Todos los audios del banco están listos (${st.total}).`
                  : `Audios del banco: ${st.done} de ${st.total} listos. GitHub sigue generándolos cada día con la cuota gratuita${st.stoppedBy ? ` (última parada: ${st.stoppedBy})` : ''}.`}
            </span>
          </div>
        )}

        <section class="stack" style={g(8)}>
          <span class="kicker">Entrenar el oído</span>
          <div class="list">
            <ListItem dot="var(--line-listening)" title="Dictados" sub="Frases a tres velocidades; se comparan palabra a palabra" to="/practicar/listening/dictados" />
            <ListItem dot="var(--line-listening)" title="Inglés hablado real" sub="Formas débiles, contracciones, palabras que se unen o se comen" to="/practicar/listening/habla-real" />
            <ListItem dot="var(--line-listening)" title="Escucha de verdad" sub="Podcasts, radio y series para oír inglés natural" to="/practicar/listening/escuchar" />
          </div>
        </section>
      </Page>
    </>
  );
}

/* ── Escucha de verdad: enlaces (solo enlaces, nada copiado) ─────── */

const PODCASTS: { name: string; url: string; accent: string; why: string }[] = [
  { name: 'Money Box (BBC Radio 4)', url: 'https://www.bbc.co.uk/programmes/b006qjnv', accent: 'Británico', why: 'Finanzas personales, bancos, ahorro e impuestos: vocabulario de tu carrera en inglés real.' },
  { name: 'Planet Money (NPR)', url: 'https://www.npr.org/podcasts/510289/planet-money', accent: 'Americano', why: 'Economía explicada con historias. Ritmo rápido y muy natural.' },
  { name: 'In Our Time (BBC Radio 4)', url: 'https://www.bbc.co.uk/programmes/b006qykl', accent: 'Británico', why: 'Debates de 50 minutos con expertos: perfecto para la Parte 3 (entrevistas largas).' },
  { name: 'BBC World Service', url: 'https://www.bbc.co.uk/worldserviceradio', accent: 'Varios', why: 'Noticias y reportajes con acentos de todo el mundo.' },
  { name: 'BBC Sounds', url: 'https://www.bbc.co.uk/sounds', accent: 'Británico', why: 'Todos los podcasts de la BBC; busca temas que te gusten.' },
  { name: 'RTÉ Radio', url: 'https://www.rte.ie/radio/', accent: 'Irlandés', why: 'Para acostumbrarte al acento irlandés, que sale en el examen.' },
  { name: 'ABC Listen', url: 'https://www.abc.net.au/listen', accent: 'Australiano', why: 'Radio y podcasts australianos.' },
  { name: 'TED Talks', url: 'https://www.ted.com/talks', accent: 'Varios', why: 'Charlas de 10–15 minutos: muy parecidas a la Parte 2. Activa la transcripción en inglés.' },
];

const SERIES: { name: string; accent: string; why: string }[] = [
  { name: 'Industry', accent: 'Británico', why: 'Jóvenes en un banco de inversión de Londres. Vocabulario de finanzas y diálogos rápidos.' },
  { name: 'Succession', accent: 'Americano', why: 'Negocios y poder; registro formal e informal mezclados.' },
  { name: 'The Office (UK)', accent: 'Británico', why: 'Humor de oficina y mucho inglés hablado real (muletillas, frases a medias).' },
  { name: 'Derry Girls', accent: 'Norirlandés', why: 'Acento difícil y muy divertido. Para cuando ya vayas cómodo.' },
  { name: 'Normal People', accent: 'Irlandés', why: 'Diálogos lentos y naturales, buen punto de partida con acento irlandés.' },
  { name: 'Ted Lasso', accent: 'Británico y americano', why: 'Contraste constante entre los dos acentos.' },
  { name: 'Fleabag', accent: 'Británico', why: 'Episodios cortos, ingenio y habla rápida.' },
  { name: 'Bluey', accent: 'Australiano', why: 'Dibujos de 7 minutos con acento australiano claro. No te rías: funciona.' },
];

export function Escuchar() {
  return (
    <>
      <Band back="/practicar/listening" kicker="Listening · Entrenar el oído" title="Escucha de verdad" line="var(--line-listening)" />
      <Page>
        <p class="small">
          Lo que más mejora el Listening es escuchar mucho inglés real. Un consejo: series con <strong>subtítulos en inglés</strong>, nunca en castellano; y podcasts primero
          con transcripción y luego sin ella.
        </p>
        <section class="stack" style={g(8)}>
          <span class="kicker">Podcasts y radio</span>
          <div class="list">
            {PODCASTS.map((p) => (
              <a key={p.url} class="list-item" href={p.url} target="_blank" rel="noopener">
                <span class="grow">
                  <span class="list-title" style={{ display: 'block' }}>
                    {p.name} <span class="pill">{p.accent}</span>
                  </span>
                  <span class="list-sub">{p.why}</span>
                </span>
                <IconChevron class="chev" width={20} height={20} />
              </a>
            ))}
          </div>
        </section>
        <section class="stack" style={g(8)}>
          <span class="kicker">Series</span>
          <div class="list">
            {SERIES.map((s) => (
              <div key={s.name} class="list-item" style={{ cursor: 'default' }}>
                <span class="grow">
                  <span class="list-title" style={{ display: 'block' }}>
                    {s.name} <span class="pill">{s.accent}</span>
                  </span>
                  <span class="list-sub">{s.why}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      </Page>
    </>
  );
}
