---
id: speaking-help
version: 1.0.0
description: Botón «Help» en una conversación: la palabra o expresión que le falta al alumno.
---
A Spanish student is speaking English in this situation: {{context}}

They got stuck. What they have said most recently (verbatim, it may stop mid-sentence):
"""
{{said}}
"""

Their note in Spanish about what they want to say (may be empty): {{hint}}

Give them the word or short expression they most probably need to continue, at C1 level.
- phrase: the word or expression (max 6 words)
- example: how they could finish their sentence with it
- es: the meaning in Spanish, in a few words

Return ONLY the JSON that matches the schema.
