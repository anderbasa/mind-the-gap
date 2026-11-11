// Voz del examinador y del compañero: el audio pregrabado (GitHub) si existe; si no, la voz del sistema.
import { unitAudio } from '../listening/bank';
import { localeFor } from '../listening/ttsCore';
import { audioEl, unlockAudioEl } from '../screens/listening/AudioPlayer';
import { englishVoices, speakSystem, systemVoices, voiceFor } from '../voice/speech';
import { speakingUnitOf, type SpeakingLine } from './schema';

let cancelled = false;

/** Dice una frase y espera a que acabe. Devuelve 'bank' o 'system' según la voz usada. */
export async function sayLine(line: SpeakingLine): Promise<'bank' | 'system'> {
  cancelled = false;
  const a = await unitAudio(speakingUnitOf(line)).catch(() => null);
  if (a) {
    await unlockAudioEl();
    const el = audioEl();
    el.pause();
    el.src = a.url;
    el.currentTime = 0;
    el.playbackRate = 1;
    await new Promise<void>((resolve) => {
      const done = () => {
        el.removeEventListener('ended', done);
        el.removeEventListener('pause', onPause);
        resolve();
      };
      const onPause = () => {
        if (cancelled) done();
      };
      el.addEventListener('ended', done);
      el.addEventListener('pause', onPause);
      el.play().catch(done);
    });
    return 'bank';
  }
  await sayText(line.text, line.speaker.accent);
  return 'system';
}

/** Voz del sistema (respaldo y conversación por turnos). */
export async function sayText(text: string, accent = 'British'): Promise<void> {
  cancelled = false;
  const voices = englishVoices(await systemVoices());
  const v = voiceFor(voices, localeFor(accent)) ?? voiceFor(voices, 'en-GB') ?? voices[0];
  // Algunos navegadores nunca avisan de que han terminado: tiempo máximo según la longitud.
  const maxMs = 2500 + text.split(/\s+/).length * 450;
  try {
    await Promise.race([speakSystem(text, { voice: v, lang: v?.lang ?? 'en-GB', rate: 0.98 }), new Promise<void>((r) => setTimeout(r, maxMs))]);
  } catch {
    /* sin voz del sistema: se sigue (el texto se ve en pantalla) */
  }
}

export function stopSpeaking(): void {
  cancelled = true;
  audioEl().pause();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}
