// Un speaking ya evaluado (simulacro, parte, long turn o conversación).
import { useEffect, useState } from 'preact/hooks';
import { navigate, route } from '../../router';
import { store } from '../../state';
import type { SpeakingDoc } from '../../speaking/data';
import { Band, Page, Spinner } from '../../ui/components';
import { SpeakingFeedbackBody } from './SpeakingUI';
import { DiagContinue } from '../DiagContinue';

export function SpeakingFeedback() {
  const id = route.value.query.get('id') ?? '';
  const [doc, setDoc] = useState<SpeakingDoc | null | undefined>(undefined);
  useEffect(() => {
    if (!id) return setDoc(null);
    store()
      .get<SpeakingDoc>(`speakings/${id}`)
      .then(setDoc)
      .catch(() => setDoc(null));
  }, [id]);

  if (doc === undefined) return <Spinner />;
  if (!doc) {
    return (
      <>
        <Band back="/practicar/speaking" kicker="Speaking" title="No encuentro ese speaking" />
        <Page>
          <button class="btn" onClick={() => navigate('/practicar/speaking', { replace: true })}>
            Volver
          </button>
        </Page>
      </>
    );
  }
  return (
    <>
      <Band
        back="/practicar/speaking"
        kicker={`Speaking · ${new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(doc.at)}`}
        title={doc.title}
        line="var(--line-speaking)"
      />
      <Page>
        {route.value.query.get('diag') === '1' && <DiagContinue />}
        <SpeakingFeedbackBody doc={doc} />
      </Page>
    </>
  );
}
