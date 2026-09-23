---
paths:
  - "packages/shared/**"
---

# Reglas de los tipos compartidos (`packages/shared/`)

- **Todos los enums** en `src/enums.ts`.
- **Todos los DTO y tipos de respuesta** en `src/types.ts`.
- 🔴 **NUNCA redefinir un tipo en `apps/web` o `apps/api` si ya existe aquí.**
- **`SseEventType`** es una unión: se amplía aquí al añadir un evento SSE nuevo.
