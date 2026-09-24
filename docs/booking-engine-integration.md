# Zenix Booking — Integra tu sitio web en 5 minutos

> Guía para developers (BOOKING-ENGINE B6). Conecta el sitio web de un hotel a
> **Zenix Booking** por HTTP para mostrar disponibilidad y crear reservas directas
> (sin comisión OTA). El sitio es independiente y se adapta a esta API.
>
> **Doc interactiva (Swagger UI):** `GET /api/docs` · **Spec OpenAPI:** `GET /api/docs-json`

---

## 0. Conceptos

- **Slug** — identificador público del hotel en la URL (`hotel-tulum`). Lo da el consultor.
- **API key** (`sk_live_…` / `sk_test_…`) — un **secreto de servidor**, como el `sk_` de Stripe. Crea reservas a nombre del hotel, así que vive en tu backend y nunca en el navegador. La genera el consultor en el panel Nova.
  > 🔴 **Antes se llamaban `pk_`, y era un error nuestro.** En el vocabulario de Stripe `pk_` significa *publishable*: seguro en el navegador. Esta llave es justo lo contrario. Las `pk_` ya emitidas **siguen funcionando**; pide una `sk_` y revoca la vieja cuando puedas. Y desde el 2026-09-24, una llave usada **desde un navegador** debe declarar sus dominios autorizados o recibe un 403 — antes, una lista vacía dejaba pasar a cualquier sitio.
- **Hosted page** — si no quieres programar, usa `https://book.zenix.com/{slug}` (la renderiza Zenix). Esta guía es para integración custom.

Base URL (dev): `http://localhost:3000` · (prod): `https://api.zenix.com`

---

## 1. Mostrar disponibilidad (READ — sin auth)

```bash
# Tipos de habitación
curl "$BASE/api/v1/public/properties/hotel-tulum/room-types"

# Disponibilidad por tipo en un rango
curl "$BASE/api/v1/public/properties/hotel-tulum/availability?checkIn=2026-08-10&checkOut=2026-08-13&adults=2"

# Calendario por noche (para pintar en gris las fechas sin cupo en tu date-picker)
curl "$BASE/api/v1/public/properties/hotel-tulum/availability-calendar?from=2026-08-01&to=2026-08-31"
```

Estos endpoints son cacheables (`Cache-Control: max-age=30`) y rate-limited per-IP (60/min).

---

## 2. Crear una reserva (WRITE — requiere API key)

```bash
curl -X POST "$BASE/api/v1/public/reservations" \
  -H "X-API-Key: sk_live_xxxxx" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{
    "guest": { "name": "María González", "email": "maria@example.com", "phone": "+52..." },
    "rooms": [
      { "roomTypeId": "<id de /room-types>", "checkIn": "2026-08-10", "checkOut": "2026-08-13", "adults": 2 }
    ]
  }'
```

**`rooms[]` es un array** — cada línea con su propio `roomTypeId` + fechas + huéspedes. Varias líneas = un grupo (varias habitaciones / fechas distintas) en una sola reserva.

Respuesta `201`:
```json
{
  "reservationRef": "MX-W-000-2608-0001",
  "paymentPolicy": "PAY_AT_HOTEL",
  "totalAmount": 210, "currency": "MXN",
  "rooms": [{ "bookingRef": "MX-W-000-2608-0001", "roomType": "Estándar", "roomNumber": "103", "total": 210 }],
  "message": "Reserva confirmada. El pago se realiza al llegar al hotel."
}
```

### Reglas que tu código debe manejar

| Situación | Respuesta | Qué hacer |
|-----------|-----------|-----------|
| Doble click / retry | mismo `Idempotency-Key` → **misma respuesta** | reusa el UUID por intento de reserva |
| Última habitación tomada por otro | `409 Conflict` | "esas fechas se acaban de ocupar, elige otras" |
| Capacidad excedida | `400` con mensaje | valida `adults+children ≤ maxOccupancy` |
| Origen no autorizado | `403` | tu dominio debe estar en `allowedOrigins` de la key |
| Llave inválida/revocada | `401` | revisa la key |

> **Pago:** en Fase 1 la política es `PAY_AT_HOTEL` (el huésped paga en recepción). El prepago online llega con PAY-CORE.

Consultar estado: `GET /api/v1/public/reservations/{reservationRef}` (con `X-API-Key`).

---

## 3. Recibir cambios en tiempo real (webhooks)

El consultor registra tu URL en el panel. Zenix te hace `POST` firmado cuando ocurre un evento:

- `reservation.created` — se creó una reserva.
- `availability.changed` — el inventario cambió (otra reserva, cancelación, bloqueo) → **invalida tu calendario cacheado**.

Verifica la firma HMAC-SHA256 (header `X-Zenix-Signature: sha256=...`) con el `secret` que te dio el consultor:

```js
import { createHmac } from 'crypto'
const expected = 'sha256=' + createHmac('sha256', SECRET).update(rawBody).digest('hex')
if (req.headers['x-zenix-signature'] !== expected) return res.status(401).end()
```

Reintentos con backoff exponencial (1s/5s/30s/5m/30m); tras 5 fallos → dead-letter + alerta al hotel.

---

## 4. Frontend sin backend (hosted page)

Si el hotel no tiene equipo técnico, no necesita la API key: la **hosted page** crea reservas por slug:

```
POST /api/v1/public/properties/{slug}/reservations   (sin X-API-Key, rate-limited)
```

O simplemente enlaza a `https://book.zenix.com/{slug}` y listo.

---

## 5. Sandbox / testing

- Pide al consultor una key de **test** (`sk_test_…`). Opera igual que `sk_live_` contra el entorno de pruebas. 🔴 Una llave `_test_` **no** abre una property `live`, y al revés tampoco.
- Las reservas de prueba aparecen en el calendario del hotel — el hotel las cancela tras probar.
- Explora todo en la Swagger UI: `GET /api/docs` (botón "Authorize" para pegar tu `X-API-Key`).
