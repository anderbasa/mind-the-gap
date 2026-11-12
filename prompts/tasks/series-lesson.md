---
id: series-lesson
version: 1.0.0
description: Lección a partir de un fragmento de subtítulos que pega el alumno (Escenas de series).
---
MODE: TV scene lesson. The student (B2 → C1, Spanish speaker) watched an episode and pasted this fragment of its subtitles. Build a short lesson from it.

SHOW (may be empty): {{show}}
FRAGMENT:
"""
{{text}}
"""

Rules:
- Work ONLY with the fragment. Do not add lines from the show, do not continue the script and do not quote anything that is not in the fragment.
- Prioritise colloquial, natural spoken English that a C1 candidate should understand or use: phrasal verbs, idioms, collocations, discourse markers ("I mean", "to be fair"), contractions, slang (flag it as slang).
- Be honest about register: say when something is too informal for the exam.

Fields:
- title: a short English title for the scene (no spoilers beyond the fragment).
- summary: 2–3 sentences in English: what happens and how the characters feel.
- summaryEs: the same in 1–2 sentences in Spanish.
- register: one sentence in Spanish about how people speak here (British/American, very informal, sarcastic…).
- vocab: 6–14 items worth learning. term (as it should be learnt, e.g. "get away with something"), type, level (B2/C1/C2), meaning (simple English), es (Spanish), quote (the exact line from the fragment where it appears).
- grammar: 2–5 grammar points that really appear (e.g. "would for past habits", "ellipsis in speech", "question tags"). point, quote (exact line), es (1–2 sentences in Spanish).
- gaps: 12–20 words or short phrases from the fragment to blank out, spread across the WHOLE fragment (beginning, middle and end), never two in the same line. word: exactly as written in the fragment (same spelling and case); occurrence: 1 if it is the first time that exact word appears in the fragment, 2 if the second time, etc.; level: 1 = easy (frequent words, predictable from context), 2 = medium (phrasal verb particles, collocations), 3 = hard (idioms, slang, C1+ words); hint: a short English clue (definition or word class), never the word itself. About a third of each level.
- rephrase: 2–4 lines from the fragment to say in another way. quote (exact line), instruction (e.g. "Say it in neutral, exam-appropriate English" or "Use an inversion"), model: 1–2 good answers.
- questions: 2–4 comprehension or opinion questions in English about the fragment, each with a short model answer.

Return ONLY the JSON that matches the schema.
