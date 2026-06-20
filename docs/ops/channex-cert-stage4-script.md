# Channex Cert — Stage 4 Live Walkthrough Script (2026-06-20)

> Guion paso a paso para el screenshare en vivo con el revisor de Channex.
> Propiedad de cert: **Test Property - Zenix** (`94d70281-07a8-4e6b-9273-724fa3b725dd`, USD).
> Objetivo: demostrar que las acciones del PMS producen los llamados ARI correctos
> a Channex (delta), que recibimos reservas + ack, y que respetamos rate limits.

## 0. Pre-call (antes de la llamada)
- [ ] API + Web corriendo (local o prod). Login como **supervisor** de la propiedad de cert.
- [ ] Top-bar muestra **"Test Property - Zenix"** (no el hotel de trabajo).
- [ ] Abrir en una 2ª pestaña el panel de Channex (`staging.channex.io`) en esa propiedad,
      para mostrar que los cambios aterrizan (ARI / Live Feed).
- [ ] Tener a mano la pestaña **Settings → Channex** del PMS (`/settings/channex`):
      muestra estado de la cola outbound, token bucket, último webhook, full-sync.

## 1. Update de TARIFA (delta) — Tests 2/3/4
1. Ir a **Configuración → Tarifas → Calendario de tarifas** (o pestaña **Restricciones**).
2. Cambiar una tarifa (ej. Twin / Best Available, una fecha) y **Aplicar**.
3. Mostrar el toast "Sincronizado con el canal".
4. En `/settings/channex`: la fila outbound pasa a SUCCEEDED con su **task id**.
5. En Channex: la tarifa actualizada en esa fecha.
> Hablar: "Se dispara por un **evento de cambio** (delta), no por timer. Va a la cola,
> el worker respeta el **rate limit** y hace **1 POST /restrictions**."

## 2. RESTRICCIONES (min-stay / stop-sell / CTA-CTD) — Tests 5/6/7
1. **Configuración → Tarifas → Restricciones.**
2. Armar 2-3 filas (hab · plan · rango · min-stay / cerrar venta / CTA / CTD).
3. **"Aplicar N cambios"** → se envían en **UNA** sola sincronización.
4. Mostrar task id en `/settings/channex` + el cambio en Channex.
> Hablar: "min-stay se envía como **min_stay_through** (lo que soporta la propiedad).
> Todas las filas válidas = **1 llamada batched** (no per-date)."

## 3. DISPONIBILIDAD (al reservar) — Tests 9/10
1. En el calendario (`/pms`), crear una reserva (walk-in o nueva reserva) en una hab.
2. Mostrar que se encola un push **AVAILABILITY** → task id.
3. En Channex: la disponibilidad del room type **baja en 1** (ej. 5 → 4) en esas noches.
> Hablar: "Empujamos el **conteo absoluto** del room type (cuartos libres), recalculado
> agregando todos los cuartos del tipo — no un 0/1."

## 4. FULL SYNC — Test 1
1. `/settings/channex` → botón **"Full sync"** (manual trigger).
2. Mostrar que produce **2 llamadas**: 1 AVAILABILITY (500 días, todas las habs) +
   1 RATES_RESTRICTIONS (500 días, todas las tarifas), con sus 2 task ids.
> Hablar: "El full sync es **1×/24h en horario off-peak** (03:00-05:00), nunca por timer.
> El día a día es **solo delta**."

## 5. RECIBIR RESERVA + ACK — Test 11
1. En Channex (Applications → **Booking CRS**), crear una reserva de prueba (Booking.com)
   para la propiedad de cert. (Modify y Cancel para el ciclo completo.)
2. En el PMS: el **feed/webhook** la recibe → aparece en el calendario.
   - Usar el **buscador global** (nombre o código OTA) → abre el `BookingDetailSheet`
     con guest + canal Booking.com + **código OTA** + **CHANNEX ID** + "Última sync OTA".
3. En Channex: el booking muestra **Acked ✓** (el PMS mandó el acknowledge).
> Hablar: "Recibimos vía `GET /booking_revisions` (no `GET /bookings`), creamos la
> reserva y mandamos el **ack** de cada revisión (new/modified/cancelled)."

## 6. Rate limits & update logic — Tests 12/13
- **Rate limits:** token bucket **10/min por (propiedad, tipo)** = 10 availability + 10
  rates/restrictions, igual a los límites de Channex. 429 → backoff (Retry-After / exp).
- **Delta-only:** el outbound se dispara por **eventos de dominio** al guardar un cambio;
  NO hay polling por timer. Full sync solo 1×/24h off-peak.
- Mostrar en `/settings/channex` el token bucket con su capacidad/refill.

## Notas honestas para el revisor
- La disponibilidad refleja el **inventario real** de la propiedad de cert (5 Twin + 5
  Double), por eso los números difieren del ejemplo del doc (que asume 8/1).
- **Booking CRS write** (crear/cancelar reservas OTA *desde* el PMS) requiere habilitación
  de cuenta (hoy 403); **no es parte de la cert** (la cert valida recibir + ack + push ARI).
