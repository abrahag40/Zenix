# HTTP Client Standard — `apps/web/src/api/client.ts`

> **Audiencia**: developers de `apps/web` (frontend React).
> **Última actualización**: 2026-05-17 (Sprint EDIT-RESERVATION iter 6).
> **Referencia rápida en CLAUDE.md**: §122.
> **Estado**: no-negociable. Cualquier PR que rompa este contrato no merge.

---

## TL;DR

Toda llamada HTTP del frontend va por `import { api } from '@/api/client'`. El wrapper maneja:

1. **Auth** — `Authorization: Bearer <token>` automático
2. **Timeout** — abort si server no responde en tiempo razonable
3. **401** — logout + redirect a login con `returnTo`
4. **Errores** — `ApiError` con `status`, `code` machine-readable, body parseado
5. **CSRF / Content-Type / FormData** — headers correctos automáticos

Llamar `fetch()` directo fuera de `client.ts` está **prohibido** (única excepción: SSE preflight en `useSSE.ts` — usa EventSource API que no acepta nuestro wrapper).

---

## 1. API pública

```ts
import { api, ApiError } from '@/api/client'

// GET
const data = await api.get<UserDto[]>('/v1/users')

// POST con body JSON
const created = await api.post<UserDto>('/v1/users', { name: 'Ana' })

// PATCH
await api.patch('/v1/users/123', { name: 'Ana López' })

// DELETE
await api.delete('/v1/users/123')

// Upload (multipart)
const form = new FormData()
form.append('file', file)
await api.postForm<{ url: string }>('/v1/photos', form)

// Override timeout para caso especial (upload pesado, reporte largo)
await api.post('/v1/reports/generate', body, { timeoutMs: 60_000 })

// Salida sin auth (login, public docs)
await api.post('/v1/auth/login', creds, { skipAuth: true })
```

---

## 2. Contrato de timeouts

Cualquier `fetch` que NO timeoutea es un foot-gun. El browser por default espera **indefinidamente** una respuesta — esto atrapa al usuario en estado "Cargando…" sin error visible cuando la red glitch o el server crashea mid-request.

### Defaults por verbo

| Verbo HTTP | Default timeout | Razón |
|---|---|---|
| `GET` | **30 000 ms** | Queries puras, tolera congestión |
| `POST` | **20 000 ms** | Mutaciones — perceptible más rápido para feedback de recepción |
| `PATCH` | **20 000 ms** | Idem |
| `DELETE` | **15 000 ms** | Acción simple sin payload |

### Override per-call

```ts
api.post('/v1/heavy-import', payload, { timeoutMs: 120_000 })  // 2 min
api.get('/v1/quick-check', { timeoutMs: 5_000 })               // 5s, falla rápido
```

### Si el timeout vence

Throw `ApiError(0, msg, { code: 'TIMEOUT', timeoutMs: 20000 })`. Mensaje accionable en español:

> *"El servidor tardó más de 20s en responder. Verifica tu conexión y reintenta."*

Cualquier mutation con `onError: (err) => toast.error(err.message)` ya entrega ese mensaje al usuario.

### Implementación interna

`AbortSignal.timeout(ms)` (browser-native, Chrome 103+ / Safari 16.4+ / Firefox 124+ — soportado sin polyfill desde 2023). Si el caller pasa su propio `signal`, ambos se combinan via `AbortSignal.any([callerSignal, timeoutSignal])` — lo primero que aborte cancela.

---

## 3. ApiError — código machine-readable

```ts
class ApiError extends Error {
  status: number         // HTTP status (0 si network/timeout)
  message: string        // texto legible para humano
  body?: unknown         // body parseado del response (preserva NestJS exception shape)
  get code(): string?    // helper que recupera `body.code` o `body.message.code`
}
```

### Códigos que pueden aparecer

| `err.code` | Significado | UI típica |
|---|---|---|
| `TIMEOUT` | Server no respondió en N ms | Toast: usar `err.message` (ya accionable) |
| `NETWORK_ERROR` | Connection refused / offline / CORS preflight fail | Toast: pedir reintentar |
| `CHECKIN_ALREADY_CONFIRMED` | Idempotency: otra sesión ya confirmó | Toast info + refetch silencioso (no error rojo) |
| `BALANCE_UNPAID` | Saldo pendiente bloqueante | Banner ámbar inline en el modal |
| `BALANCE_OVERPAID` | Pago > saldo | Error inline en input |
| `NOSHOW_LOCKED` | Reserva en flujo no-show | Modal info |
| `FUTURE_CHECKIN` | Check-in con fecha futura | Modal info |
| `STAY_CANCELLED` | Reserva cancelada — edición bloqueada | Banner gris |
| `STAY_CHECKED_OUT_IMMUTABLE_FIELD` | Campo fiscal bloqueado post-checkout | Inline lock |
| `RATE_CHANGE_REQUIRES_APPROVAL` | (obsoleto §120-bis — ya no se lanza) | — |
| `NOTE_NOT_OWNER` | Solo autor puede editar nota | Toast |
| `NOTE_EDIT_WINDOW_EXPIRED` | >5min desde creación | Toast |

### Pattern en mutation hooks

```ts
onError: (err: Error) => {
  const code = err instanceof ApiError ? err.code : undefined
  if (code === 'CHECKIN_ALREADY_CONFIRMED') {
    toast('Otra sesión confirmó el check-in', { icon: 'ℹ️' })
    qc.invalidateQueries(...)
    return
  }
  // mensajes traducidos per código si UX específico
  const map: Record<string, string> = {
    STAY_CANCELLED: 'Esta reserva está cancelada — campo bloqueado',
    // ...
  }
  toast.error(code && map[code] ? map[code] : err.message ?? 'No se pudo procesar')
}
```

---

## 4. Estado terminal garantizado (por qué importa)

El cliente HTTP **garantiza** que toda mutation termina en uno de dos estados:

```
mutation.mutate(payload)
  ├─ SUCCESS path → onSuccess → toast green → component cleanup (cerrar modal, refetch, etc.)
  └─ ERROR path
       ├─ HTTP 4xx/5xx → ApiError(status, msg, body) → onError → toast.error
       ├─ Network glitch → ApiError(0, 'No se pudo conectar', code: NETWORK_ERROR)
       ├─ Timeout (>N ms) → ApiError(0, 'El servidor tardó…', code: TIMEOUT)
       └─ 401 → handleUnauthorized() → logout + redirect a /login
```

**No hay tercer camino.** El estado `isPending` siempre termina en `false` después del timeout. Modales que dependen de `isPending` para deshabilitar Cancel/X tienen ciclo terminal seguro.

### Anti-pattern: "Cancel habilitado durante isPending"

Tentación natural cuando se ve un modal trampado: habilitar Cancelar incluso cuando `isPending`. **Eso oculta el problema real** (no hay timeout en el fetch). Cancelar mid-mutation deja al usuario sin saber si la operación se completó server-side → riesgo de duplicar acción al reintentar.

**Cura correcta**: configurar timeout. La mutation siempre resuelve (success o error), `isPending` siempre vuelve a `false`, el usuario nunca queda atrapado.

Si un endpoint legítimo necesita >30s (e.g., generar reporte), pasar `timeoutMs` explícito y mostrar progreso intermedio (`useMutation` con `onMutate` para spinner, polling para status).

---

## 5. Anti-patterns que NO usar

### ❌ Raw fetch fuera del cliente

```ts
// MAL
const res = await fetch('/api/v1/users')
const data = await res.json()
```

```ts
// BIEN
const data = await api.get<UserDto[]>('/v1/users')
```

Razón: no tiene auth, no tiene timeout, no tiene 401-handling, no produce ApiError compatible con onError handlers existentes.

**Única excepción aceptada**: `useSSE.ts` necesita `fetch` para preflight porque `EventSource` no acepta headers customs. Documentado explícitamente en código.

### ❌ Swallowing errors silenciosamente

```ts
// MAL
try { await api.post(...) } catch { /* nothing */ }
```

```ts
// BIEN — usar onError del useMutation, o re-throw + log
try { await api.post(...) }
catch (e) {
  console.error('[Feature] failed:', e)
  throw e
}
```

### ❌ Timeout extremadamente alto "por si acaso"

```ts
// MAL
api.post('/v1/users', body, { timeoutMs: 5 * 60_000 })  // 5 min
```

Si necesitas 5 minutos, probablemente el endpoint debería ser async (return job-id + polling para status). Mutations síncronas de UI nunca deberían tolerar >60s.

### ❌ Construir URLs sin `/api` prefix

```ts
// MAL — el wrapper agrega /api/ automáticamente
api.get('/api/v1/users')   // → /api/api/v1/users
```

```ts
// BIEN
api.get('/v1/users')       // → /api/v1/users
```

---

## 6. Migración para código existente

Si encuentras `fetch()` raw en archivos legacy del repo:

1. Identifica el método HTTP, path y body.
2. Reemplaza con `api.<method>()`.
3. Borra el manejo manual de headers/auth/parsing.
4. Si había `.catch()` custom, conviértelo a `onError` del mutation/query.
5. Verifica que el error message del backend (que viene en `body.message`) se muestre correctamente.

Ejemplo de migración:

```diff
-  const res = await fetch(`/api/v1/users/${id}`, {
-    method: 'PATCH',
-    headers: {
-      'Content-Type': 'application/json',
-      Authorization: `Bearer ${token}`,
-    },
-    body: JSON.stringify({ name }),
-  })
-  if (!res.ok) throw new Error(await res.text())
-  return res.json()
+  return api.patch<UserDto>(`/v1/users/${id}`, { name })
```

---

## 7. CI / lint enforcement

Future: agregar regla ESLint `no-restricted-syntax` que prohíba `CallExpression[callee.name="fetch"]` salvo en `apps/web/src/api/client.ts` y `apps/web/src/hooks/useSSE.ts` (whitelist).

Mientras tanto, el reviewer humano verifica en PR: `git diff` no debe introducir `fetch(` fuera de los archivos permitidos.

---

## 8. Cambios al estándar

Modificar el contrato (defaults, timeouts, comportamiento de error) requiere:

1. Edit `apps/web/src/api/client.ts` + este documento en mismo PR.
2. Actualizar la entrada CLAUDE.md §122 con la nueva versión y fecha.
3. Validar que ninguna mutation existente se rompe (especialmente las que asumen timeouts específicos).
4. Comunicar el cambio al equipo en standup / changelog.

---

## 9. Referencias

- [MDN — AbortSignal.timeout()](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static)
- [MDN — AbortSignal.any()](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any_static)
- [Stripe SDK timeout docs](https://stripe.com/docs/api/expanding_objects#timeout) — pattern equivalente con default 80s
- [Apple HIG — Modality](https://developer.apple.com/design/human-interface-guidelines/modality) — modales con ciclo terminal claro
- CLAUDE.md §122 — anclaje principal del estándar
- CLAUDE.md §121 — fix relacionado de `useSSE.ts` (también AbortController)

---

**Fin del estándar.** Cualquier cambio requiere update simultáneo de este doc + CLAUDE.md §122 + código.
