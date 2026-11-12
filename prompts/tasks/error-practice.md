---
id: error-practice
version: 1.0.0
description: Frases dirigidas a un patrón de error del alumno (corrige la frase).
---
MODE: Targeted practice. The student keeps making this mistake:

PATTERN: {{name}}
RULE: {{rule}}
THEIR REAL MISTAKES:
{{examples}}

Write 5 NEW, natural sentences (C1 level, varied topics: university, work, finance, travel, everyday life) that each contain exactly this kind of mistake, for the student to correct.
- wrong: the sentence with the mistake (only one mistake per sentence)
- right: the corrected sentence (change as little as possible)
- accepted: other fully correct versions, if any (can be empty)
- why: one short sentence in Spanish explaining the correction

Return ONLY the JSON that matches the schema.
