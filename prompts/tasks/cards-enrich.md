---
id: cards-enrich
version: 1.0.0
description: Convierte palabras guardadas por el alumno en tarjetas de vocabulario (significado, hueco y producción).
---
MODE: Vocabulary flashcards for a Spanish C1 learner (British English).

For each word or expression below (with the sentence where the student found it), return:
- term: the word or expression as it should be learnt (base form for verbs, e.g. "cut corners")
- es: its meaning in Spanish, in a few words
- definition: a short English definition (max 15 words)
- gapSentence: a NEW natural sentence, different from the original context, with the term replaced by ___ (only one possible answer)
- gapAnswer: the exact word(s) that fill the gap in that sentence (inflected if needed)
- esSentence: a short, natural Spanish sentence whose most natural English translation uses the term
- enSentence: that English translation

WORDS:
{{words}}

Return ONLY the JSON that matches the schema.
