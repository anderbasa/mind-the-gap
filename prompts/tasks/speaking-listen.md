---
id: speaking-listen
version: 1.0.0
description: Escucha una grabación del alumno — transcripción literal y comentario de pronunciación.
---
You will hear a recording of a Spanish learner of English answering a C1 Advanced speaking task.

TASK THEY WERE ANSWERING: {{prompt}}

1. transcript: transcribe it VERBATIM.
   - Keep everything they said: fillers (um, er, like, you know), false starts, repetitions and grammar mistakes. Do NOT correct anything.
   - Mark pauses longer than about 2 seconds as [pause].
   - If a word is unclear, write your best guess followed by [?].
   - If they switch to Spanish, wrap it in [es: ...].
   - If the recording is silent or has no speech, return an empty transcript.
2. pronunciation: listen like an experienced examiner.
   - comment: one or two sentences in English on how easy they are to understand (individual sounds, word stress, sentence stress, intonation, linking).
   - issues: up to 6 specific problems — the word, how it sounded (simple respelling, e.g. "ves-ji-TA-ble"), and a short tip. Typical Spanish-speaker issues: /ɪ/ vs /iː/, final consonants, "es-" before s + consonant, /v/ vs /b/, /h/, schwa, word stress.
   - strengths: up to 3 things they do well.

Return ONLY the JSON that matches the schema.
