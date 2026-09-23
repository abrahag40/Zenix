---
paths:
  - "**/*.spec.ts"
  - "**/*.test.ts"
  - "apps/api/test/**"
---

# Reglas de las pruebas

```typescript
it('descripción en español — qué debe hacer', async () => {
  // Arrange / Act / Assert
})
```

- **Constructores de datos:** `makeRoom()`, `makeCheckout()`, etc.
- **Mocks:** `prismaMock` con `$transaction` que ejecuta el callback directamente.
- **Limpiar:** `jest.clearAllMocks()` en `beforeEach`.

## 🔴 Lo que la auditoría encontró — 2026-09-22

- **Cero pruebas de concurrencia reales.** En los 105 specs el advisory lock está **siempre
  mockeado** y **no existe un solo archivo e2e**. Borrar la línea del lock deja **1 316 pruebas en
  verde**. Una garantía falsa es peor que ninguna.
- **El CI excluye 32 casos con un diagnóstico que es falso:** 31 de ellos pasan hoy con los seeds
  que el propio CI ya corre. Reactivarlos recupera 21 comprobaciones ya escritas.
- **69 casos se auto-saltan en silencio** por un `describe` condicionado a variables de entorno
  que el CI no tiene: verde que no cubre nada.
- **Prueba de mordida obligatoria:** después de escribir un gate, **rómpelo a propósito y comprueba
  que se pone rojo**. Si no muerde, no cuenta.
