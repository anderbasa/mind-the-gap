import type { Profile, ProfileFieldDef } from '../domain/profile';
import { EXAM_FORMATS, PROFILE_SECTIONS } from '../domain/profile';
import { Segmented } from '../ui/components';

function grow(e: Event) {
  const t = e.currentTarget as HTMLTextAreaElement;
  t.style.height = 'auto';
  t.style.height = `${t.scrollHeight + 2}px`;
}

export function TextField(props: { def: ProfileFieldDef; value: string; onInput: (v: string) => void; placeholder?: string }) {
  const { def } = props;
  return (
    <label class="field">
      <span>{def.label}</span>
      {def.long ? (
        <textarea
          class="textarea"
          rows={2}
          value={props.value}
          placeholder={props.placeholder}
          onInput={(e) => {
            grow(e);
            props.onInput((e.currentTarget as HTMLTextAreaElement).value);
          }}
          ref={(el) => {
            if (el) requestAnimationFrame(() => grow({ currentTarget: el } as unknown as Event));
          }}
        />
      ) : (
        <input class="input" value={props.value} placeholder={props.placeholder} onInput={(e) => props.onInput((e.currentTarget as HTMLInputElement).value)} />
      )}
      {def.hint && <small>{def.hint}</small>}
    </label>
  );
}

/** Los datos de la sección 1 del documento: sobre ti, tu inglés, lo que te cuesta, tu tiempo. */
export function ProfileForm(props: { draft: Profile; onChange: (p: Profile) => void }) {
  const set = (k: keyof Profile, v: string) => props.onChange({ ...props.draft, [k]: v });
  return (
    <div class="stack" style={{ '--gap': '22px' }}>
      {PROFILE_SECTIONS.map((sec) => (
        <section key={sec.title} class="stack" style={{ '--gap': '12px' }}>
          <h3>{sec.title}</h3>
          {sec.fields.map((f) => (
            <TextField key={f.key} def={f} value={String(props.draft[f.key] ?? '')} onInput={(v) => set(f.key, v)} />
          ))}
          {sec.title === 'Tu inglés y tu objetivo' && (
            <div class="field">
              <span>Formato del examen</span>
              <Segmented
                label="Formato del examen"
                value={props.draft.examFormat}
                options={EXAM_FORMATS}
                onChange={(v) => props.onChange({ ...props.draft, examFormat: v })}
              />
              <small>Si aún no lo sabes, practicarás en pantalla y en papel.</small>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

export function ExtrasForm(props: { draft: Profile; onChange: (p: Profile) => void; which: 'languages' | 'fun' }) {
  const set = (k: keyof Profile, v: string) => props.onChange({ ...props.draft, [k]: v });
  if (props.which === 'languages') {
    return (
      <div class="stack" style={{ '--gap': '14px' }}>
        <TextField
          def={{ key: 'otherLanguages', label: 'Otros idiomas que hablas', long: true, hint: 'Theo los usará para buscar parecidos y contrastes (y avisarte de falsos amigos).' }}
          value={props.draft.otherLanguages}
          placeholder="Por ejemplo: euskera (nivel medio), algo de francés del instituto…"
          onInput={(v) => set('otherLanguages', v)}
        />
        <TextField
          def={{ key: 'interests', label: 'Temas que te interesan', long: true, hint: 'Saldrán en textos, audios y conversaciones, mezclados con los temas típicos del examen.' }}
          value={props.draft.interests}
          placeholder="Economía y finanzas, tecnología e IA, fútbol, viajes y Erasmus…"
          onInput={(v) => set('interests', v)}
        />
      </div>
    );
  }
  return (
    <TextField
      def={{ key: 'funDetails', label: 'Detalles divertidos sobre ti', long: true, hint: 'Aficiones, comidas, manías, bromas, tu equipo, tu compañero de piso… Theo los usará en ejemplos y enunciados, con humor.' }}
      value={props.draft.funDetails}
      placeholder="Por ejemplo: no perdono el café de la mañana, soy del Athletic, siempre llego tarde a clase de 8…"
      onInput={(v) => set('funDetails', v)}
    />
  );
}
