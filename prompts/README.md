# Prompts de Theo

Todos los prompts de la app viven aquí, versionados con git, para poder ajustarlos sin tocar el código.

- `tutor-system.md` — la personalidad y las reglas de Theo (en inglés). Lo usan todas las tareas.
- `tasks/*.md` — una instrucción por tarea (chat, explicar en castellano, transcribir…).

## Formato

Cada archivo empieza con una cabecera:

```
---
id: chat
version: 1.0.0
description: Para qué sirve.
---
```

Al cambiar un prompt de forma que cambie el resultado, sube la `version`: cada resultado de IA guarda qué prompt y versión lo produjeron.

Los huecos `{{así}}` se rellenan en tiempo de ejecución (perfil, notas de Theo, palabras en aprendizaje, fecha…).
**No escribas aquí datos personales**: el repo es público. Tus datos viven solo en Firestore.
