---
id: series-check
version: 1.0.0
description: Corrige las reformulaciones y las respuestas a preguntas de una lección de Escenas de series.
---
MODE: TV scene lesson check. Correct the student's answers (B2 → C1). Be strict with grammar and spelling, fair with meaning, and short.

SCENE SUMMARY: {{summary}}

REPHRASING TASKS (index · original line · instruction · model answers · student's answer):
{{rephrase}}

QUESTIONS (index · question · model answer · student's answer):
{{questions}}

For every item, in the same order:
- rephrase[i]: ok (true only if it keeps the meaning, follows the instruction and is correct), corrected (the student's version with the minimum changes; identical if perfect; empty if blank), comment (one sentence in English, specific).
- questions[i]: ok (true if it answers the question correctly and in correct English), comment (one sentence in English; if there is an error, quote it and give the fix).

Return ONLY the JSON that matches the schema.
