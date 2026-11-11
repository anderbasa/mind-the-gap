// Índice del Speaking: simulacro, partes sueltas, long turn, conversación y tu progreso.
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { loadManifest } from '../../listening/bank';
import { listSpeakings, resourceTally, type SpeakingDoc } from '../../speaking/data';
import { linesById, loadSpeakingBank, type SpeakingBankT } from '../../speaking/schema';
import { Band, ListItem, Page, Spinner } from '../../ui/components';

const g = (n: number) => ({ '--gap': `${n}px` }) as JSX.CSSProperties;
const dateEs = (t: number) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(t);

export function SpeakingHub() {
  const [bank, setBank] = useState<SpeakingBankT | null>(null);
  const [docs, setDocs] = useState<(SpeakingDoc & { id: string })[] | null>(null);
  const [voices, setVoices] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    loadSpeakingBank().then(async (b) => {
      setBank(b);
      if (!b) return;
      const m = await loadManifest();
      const ids = [...linesById(b).keys()].map((id) => `sp-${id}`);
      setVoices({ done: ids.filter((id) => m.units[id]).length, total: ids.length });
    });
    listSpeakings()
      .then(setDocs)
      .catch(() => setDocs([]));
  }, []);

  const tally = docs ? resourceTally(docs).slice(0, 12) : [];

  return (
    <>
      <Band back="/practicar" kicker="Practicar · Paper 4" title="Speaking" sub="≈ 15 min · 4 partes · examinador y compañero" line="var(--line-speaking)" />
      <Page>
        <section class="stack" style={g(8)}>
          <span class="kicker">El examen</span>
          <div class="list">
            {(bank?.tests ?? []).map((t) => (
              <ListItem key={t.id} dot="var(--line-speaking)" title={`Simulacro completo · ${t.title}`} sub={`Las 4 partes con tiempos reales · compañero: ${t.partner.name}`} to={`/practicar/speaking/simulacro?test=${t.id}`} />
            ))}
            <ListItem dot="var(--line-speaking)" title="Part 1 · Interview" sub="Preguntas sobre ti (≈ 2 min)" to="/practicar/speaking/simulacro?part=p1" />
            <ListItem dot="var(--line-speaking)" title="Part 2 · Long turn" sub="Comparar fotos 1 minuto + respuesta de 30 s" to="/practicar/speaking/simulacro?part=p2" />
            <ListItem dot="var(--line-speaking)" title="Part 3 · Collaborative task" sub="Discutir con tu compañero y decidir (3 min)" to="/practicar/speaking/simulacro?part=p3" />
            <ListItem dot="var(--line-speaking)" title="Part 4 · Discussion" sub="Preguntas de opinión más abiertas (≈ 5 min)" to="/practicar/speaking/simulacro?part=p4" />
          </div>
        </section>

        <section class="stack" style={g(8)}>
          <span class="kicker">Entrenar</span>
          <div class="list">
            <ListItem dot="var(--signal)" title="Long turn" sub="30 → 45 → 60 → 90 s sin quedarte en blanco · «dilo otra vez, pero mejor»" to="/practicar/speaking/long-turn" />
            <ListItem dot="var(--signal)" title="Role-plays y conversación" sub="Entrevista, debate, reclamación… en tiempo real con Gemini Live" to="/practicar/speaking/conversacion" />
          </div>
        </section>

        {voices && (
          <div class={`notice ${voices.done >= voices.total ? 'ok' : 'info'} small`}>
            <span>
              {voices.done >= voices.total
                ? 'Las voces del examinador y del compañero están listas.'
                : `Voces pregrabadas: ${voices.done} de ${voices.total}. GitHub las va generando con la cuota gratuita; mientras tanto suena la voz de tu dispositivo.`}
            </span>
          </div>
        )}

        {!docs && <Spinner />}
        {docs && docs.length > 0 && (
          <section class="stack" style={g(8)}>
            <span class="kicker">Tus speakings</span>
            <div class="list">
              {docs.slice(0, 10).map((d) => (
                <ListItem key={d.id} dot="var(--line-speaking)" title={d.title} sub={dateEs(d.at)} right={<span class={`pill ${d.scale >= 180 ? 'ok' : ''}`}>≈ {d.scale}</span>} to={`/practicar/speaking/ver?id=${d.id}`} />
              ))}
            </div>
          </section>
        )}

        {tally.length > 0 && (
          <section class="card stack" style={g(8)}>
            <span class="kicker">Recursos C1 que ya usas</span>
            <div class="chips">
              {tally.map((t) => (
                <span key={t.resource} class="chip on" title={t.last}>
                  {t.resource} ×{t.count}
                </span>
              ))}
            </div>
            <p class="muted small">Contados en tus últimos speakings: solo los que de verdad dijiste.</p>
          </section>
        )}

        <p class="muted small">Consejo: haz antes la «Prueba de voz» (Ajustes) en el iPhone, en Safari y en la app instalada, para comprobar el micrófono.</p>
      </Page>
    </>
  );
}
