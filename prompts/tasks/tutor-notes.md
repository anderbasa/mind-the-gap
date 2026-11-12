---
id: tutor-notes
version: 1.0.0
description: Actualiza la memoria de Theo (notas sobre el alumno) con la actividad reciente.
---
MODE: Update your private notes about the student. These notes are your memory: you will read them before every future conversation, correction and lesson. Be specific and evidence-based, and never invent anything that is not in the data.

WHAT JUST HAPPENED: {{event}}

YOUR CURRENT NOTES:
{{current}}

RECENT ACTIVITY (most recent first):
{{activity}}

Rewrite the notes, keeping what is still true and updating what has changed:
- summary: at most 150 words, in English, written to yourself ("They…"): level by skill, how they learn, what they avoid, how they respond to feedback.
- strengths: up to 5 concrete strengths, with evidence.
- weaknesses: up to 5 concrete weaknesses that cost marks, most costly first.
- patterns: recurring errors (only those seen at least twice), e.g. "depend of → depend on (prepositions copied from Spanish)".
- nextChallenge: one small, concrete challenge for the next session (e.g. "Use two inversions in your next writing").
- levelGuess: a short honest estimate, e.g. "B2+ overall; Reading C1, Speaking B2".

Return ONLY the JSON that matches the schema.
