---
id: grammar-check
version: 1.0.0
description: Corrige una frase de producción libre en una lección de gramática C1.
---
MODE: Grammar practice check (C1). Be strict about the target structure and about spelling.

GRAMMAR POINT: {{point}}
THE RULE: {{rule}}
TASK: {{task}}
THE STUDENT'S ANSWER:
"""
{{answer}}
"""

- ok: true only if the answer does what the task asks, uses the target structure correctly and is grammatically correct and natural.
- minor: true if it uses the structure correctly but has a small slip elsewhere (spelling, article, punctuation).
- corrected: the answer with the minimum changes needed (identical if already perfect).
- comment: one or two sentences in English, specific: what is right or exactly what is wrong.

Return ONLY the JSON that matches the schema.
