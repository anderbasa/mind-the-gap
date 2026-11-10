// Voces del sistema (speechSynthesis): gratis, sin conexión, respaldo de Gemini TTS.

export async function systemVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  if (!('speechSynthesis' in window)) return [];
  const now = speechSynthesis.getVoices();
  if (now.length) return now;
  return new Promise((resolve) => {
    const done = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, timeoutMs);
  });
}

export function englishVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
}

/** Elige una voz por acento (en-GB, en-US, en-AU, en-IE…), prefiriendo las «mejoradas». */
export function voiceFor(voices: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | undefined {
  const same = voices.filter((v) => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase());
  return same.find((v) => /enhanced|premium|natural/i.test(v.name)) ?? same[0];
}

export function speakSystem(text: string, opts: { lang?: string; voice?: SpeechSynthesisVoice; rate?: number } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!('speechSynthesis' in window)) return reject(new Error('Este navegador no tiene voces del sistema.'));
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = opts.voice?.lang ?? opts.lang ?? 'en-GB';
    if (opts.voice) u.voice = opts.voice;
    u.rate = opts.rate ?? 1;
    u.onend = () => resolve();
    u.onerror = (e) => (e.error === 'interrupted' || e.error === 'canceled' ? resolve() : reject(new Error(e.error)));
    speechSynthesis.speak(u);
  });
}
