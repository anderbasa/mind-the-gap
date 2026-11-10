import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { profile, saveProfile } from '../state';
import { parseProfile, type Profile } from '../domain/profile';
import { navigate } from '../router';
import { Band, Page, toast } from '../ui/components';
import { ExtrasForm, ProfileForm } from './ProfileForm';

const STEPS = ['Hola', 'Tus datos', 'Idiomas', 'Tú', 'Listo'];

function StepLine(props: { step: number }) {
  return (
    <div class="row" style={{ '--gap': '0px', margin: '2px 0 4px' } as JSX.CSSProperties} aria-label={`Paso ${props.step + 1} de ${STEPS.length}`}>
      {STEPS.map((s, i) => (
        <div key={s} class="row" style={{ flex: i < STEPS.length - 1 ? 1 : 'none', '--gap': '0px' } as JSX.CSSProperties}>
          <span
            title={s}
            style={{
              width: i === props.step ? '16px' : '12px',
              height: i === props.step ? '16px' : '12px',
              borderRadius: '50%',
              border: '3px solid var(--ink)',
              background: i < props.step ? 'var(--ink)' : i === props.step ? 'var(--signal)' : 'var(--paper-raised)',
              flex: 'none',
            }}
          />
          {i < STEPS.length - 1 && <span style={{ flex: 1, height: '4px', background: i < props.step ? 'var(--ink)' : 'var(--rule-strong)' }} />}
        </div>
      ))}
    </div>
  );
}

export function Onboarding() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Profile>(() => parseProfile(profile.value ?? {}));
  const [saving, setSaving] = useState(false);
  const name = draft.name.trim();

  const next = () => {
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo(0, 0);
  };
  const prev = () => {
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo(0, 0);
  };

  const finish = async () => {
    setSaving(true);
    try {
      await saveProfile({ ...draft, confirmedAt: Date.now() });
      toast(`Welcome aboard${name ? `, ${name}` : ''}!`);
      navigate('/', { replace: true });
    } catch (e) {
      toast('No se ha podido guardar. Revisa la conexión.');
      console.error(e);
      setSaving(false);
    }
  };

  return (
    <>
      <div class="statusbar-shim" />
      <div class="shell no-tabs">
        <Band kicker={`Bienvenida · ${step + 1}/${STEPS.length}`} title={step === 0 ? `Hi${name ? `, ${name}` : ''}. I'm Theo.` : STEPS[step]} />
        <Page gap={20}>
          <StepLine step={step} />

          {step === 0 && (
            <>
              <div class="card stack" style={{ '--gap': '12px' } as JSX.CSSProperties}>
                <p class="read">
                  I'll be your English tutor from here to C1 Advanced. I'll measure your <em>real</em> level, decide what you practise each day based on what's costing
                  you marks, mark you like a Cambridge examiner — no inflated scores — and tell you when you're ready to book the exam.
                </p>
                <p class="read">First, let's check I've got your details right. I'll only ask once.</p>
              </div>
              <p class="muted small">
                Primero, confirma tus datos. Solo te los pregunto esta vez; si algo cambia, lo editas en Ajustes → Tus datos.
              </p>
            </>
          )}

          {step === 1 && (
            <>
              <p class="muted">Lo he rellenado con lo que me contaste. Corrige lo que no cuadre.</p>
              <ProfileForm draft={draft} onChange={setDraft} />
            </>
          )}

          {step === 2 && <ExtrasForm draft={draft} onChange={setDraft} which="languages" />}

          {step === 3 && <ExtrasForm draft={draft} onChange={setDraft} which="fun" />}

          {step === 4 && (
            <div class="stack" style={{ '--gap': '14px' } as JSX.CSSProperties}>
              <div class="card stack" style={{ '--gap': '10px' } as JSX.CSSProperties}>
                <p class="read">
                  Brilliant. One thing before we start: I don't trust certificates, not even yours. The diagnostic test will tell us where you really are — then
                  we'll close the gap, one station at a time.
                </p>
              </div>
              <p class="muted small">Theo no se fía de tu nota del First: el diagnóstico (llega en la Fase 6) medirá tu nivel real en las cuatro destrezas.</p>
            </div>
          )}

          <div class="row" style={{ marginTop: '8px' }}>
            {step > 0 && (
              <button class="btn ghost" onClick={prev} disabled={saving}>
                Atrás
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button class="btn signal" style={{ flex: 1 }} onClick={next}>
                {step === 0 ? 'Revisar mis datos' : 'Siguiente'}
              </button>
            ) : (
              <button class="btn signal" style={{ flex: 1 }} onClick={finish} disabled={saving}>
                {saving ? 'Guardando…' : 'Todo correcto, empezamos'}
              </button>
            )}
          </div>
        </Page>
      </div>
    </>
  );
}
