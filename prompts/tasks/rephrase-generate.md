---
id: rephrase-generate
version: 1.0.0
description: Reformular — escribe frases nuevas con su instrucción (solo cuando el alumno lo pide).
---
MODE: Rephrasing generator for a Spanish learner preparing for C1 Advanced.

Write 5 NEW rephrasing items. Each item has:
- topic: one of {{topics}}
- sentence: a natural, original sentence (8–20 words) about everyday life, university, work, finance, travel or sport. British English.
- instruction: a short instruction that forces a C1 structure, e.g. "Start with “Not only…”.", "Use “despite”.", "Make it passive.", "Use “wish”.", "Start with “Had…”.", "Start with “What…”.", "Make it formal, for a report."
- models: 1–3 correct rewrites that keep the meaning and follow the instruction exactly.

Rules:
- The rewrite must be possible without changing the meaning.
- Vary the vocabulary and situations; do not reuse these sentences: {{avoid}}
- Everything must be original (do not copy published exam material).

Examples of the style:
{{examples}}

Return ONLY the JSON that matches the schema.
