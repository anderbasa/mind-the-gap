---
id: error-patterns
version: 1.0.0
description: Agrupa los errores del alumno en patrones (cuaderno de errores).
---
MODE: Error analysis for a Spanish learner of English (C1 Advanced). Below are the student's recent mistakes from exercises, writings, speakings and other practice, each with an id.

Group them into PATTERNS: the same underlying mistake repeated (e.g. "preposition after depend", "missing article before abstract nouns used specifically", "present perfect vs past simple", "Spanish word order with adverbs", "wrong register in formal emails"). An exercise answer that is simply wrong (a vocabulary item they did not know) is not a pattern unless the same kind of gap repeats.

For each pattern:
- name: short name in Spanish (max 6 words)
- rule: the rule in one short English sentence
- category: grammar, vocabulary, collocation, preposition, article, tense, word order, register, spelling, pronunciation or comprehension
- errorIds: the ids of the errors that belong to it (each id in at most one pattern)
- examples: up to 3 of their real mistakes as {wrong, right}

Only include patterns with at least 2 errors. Order them from most to least frequent.

ERRORS:
{{errors}}

Return ONLY the JSON that matches the schema.
