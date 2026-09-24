# 21 · Disponibilidad y cobro desde el sitio del hotel

> **Objetivo:** `Sitio web → elegir fechas → pagar → la reserva aparece en el calendario`, sin
> sobreventa, y **instalable en el sitio de cualquier hotel** que llegue de Cloudbeds, Mews o
> WordPress.
>
> Este documento **verifica primero y propone después**. Todo lo que dice «ya existe» está
> comprobado en el código, con archivo y línea. Todo lo que falta está marcado como falta.
>
> Fecha del análisis: **2026-09-24**. Rama base: `main`.

---

## 1 · Lo primero: buena parte ya está construida

La suposición de partida era que «para las OTAs ya tenemos algo con Channex, pero para un website
no». **Es inexacta y conviene corregirla antes de planear nada**, porque cambia el tamaño del
trabajo de «construir un motor» a «conectar y cobrar».

| Pieza | Estado | Dónde |
|---|---|---|
| Disponibilidad por tipo y rango | ✅ **Existe** | `GET /api/v1/public/properties/:slug/availability` |
| **Calendario noche a noche para pintar el date-picker** | ✅ **Existe** | `GET …/availability-calendar`, máx. 62 noches |
| Tarifas públicas con impuestos | ✅ **Existe** | `GET …/rates` · `public-pricing.service.ts` |
| Crear reserva desde el sitio del hotel | ✅ **Existe** | `POST /api/v1/public/reservations` + `X-API-Key` |
| Crear reserva desde página alojada | ✅ **Existe** | `POST …/properties/:slug/reservations`, sin llave |
| **Guardia anti-sobreventa** | ✅ **Existe y está endurecida** | `public-reservations.service.ts:196-260` |
| CORS abierto para el prefijo público | ✅ **Existe** | `main.ts:97-106` |
| Límite de peticiones por IP | ✅ **Existe** | `ThrottlerGuard`, 60/min |
| Idempotencia | ✅ **Existe** | `Idempotency-Key` bajo el mismo cerrojo |
| Empuje de inventario a las OTAs | ✅ **Existe** | `availability.service.ts:462-670` |

### 1.1 · La guardia anti-sobreventa, en concreto

No es una comprobación optimista. Dentro de **una sola transacción**:

1. `pg_advisory_xact_lock('booking:<propertyId>')` — serializa el motor público consigo mismo y
   protege el contador del `bookingRef`.
2. **Y además** `pg_advisory_xact_lock('walk-in:<roomId>')` por cada habitación candidata — que es
   la familia de claves que usan **recepción** (`guest-stays.service.ts`) y **Channex**
   (`booking-new.handler.ts`).
3. Con ambos cerrojos tomados, se vuelve a llamar a `AvailabilityService.check`, que mira
   `GuestStay` + `StaySegment` + `RoomBlock`.
4. Y por debajo, la restricción de exclusión `stay_segments_sin_solape`
   (`EXCLUDE USING gist` sobre `(room_id, daterange(check_in, check_out, '[)'))`) impide el solape
   aunque el código se equivoque.

🔴 **El punto 2 es reciente**: lo encontró la auditoría del 2026-09-22. El motor público tomaba
sólo el cerrojo de *property*, y recepción tomaba el de *habitación* — **dos familias de claves
distintas no se bloquean entre sí**, así que el único camino abierto a internet era justamente el
que no se serializaba con el mostrador. Está corregido y comentado en el propio código.

**Conclusión verificada:** si el manager bloquea habitaciones en Zenix, el motor público **no
puede** vender esas fechas. La garantía dura existe hoy.

---

## 2 · Lo que falta, y qué tan grave es cada cosa

### 2.1 · 🔴 Falta el cobro. Es el hueco real

`public-reservations.service.ts:320` crea la reserva con `paymentStatus: 'PENDING'` y
`paymentModel: 'HOTEL_COLLECT'`, y `BookingEngineConfig.paymentPolicy` está **fijado a
`PAY_AT_HOTEL`** con este comentario en el esquema:

> *Opción B: locked a PAY_AT_HOTEL en Fase 1 (los demás requieren PAY-CORE).*

Los valores `FULL_PREPAY`, `DEPOSIT_30` y `DEPOSIT_50` están declarados y **ninguno funciona**.
Sin esto no hay «aunque sea un adelanto», que es el objetivo declarado.

### 2.2 · 🔴 Falta la retención con caducidad (*hold*)

`BookingEngineConfig.holdTtlMinutes` existe, con valor por omisión **1440 minutos (24 h)**, y
**nada lo lee**. Buscado en todo `apps/api/src`: cero usos fuera del esquema.

Esto no es un detalle: **es la pieza que decide si cobrar es seguro**. Sin ella sólo hay dos
caminos, los dos malos:

| | Qué sale mal |
|---|---|
| **Cobrar y luego crear** | El huésped paga y la habitación ya no está. Hay que devolver el dinero: soporte, comisión perdida y una reseña. |
| **Crear y luego cobrar** | La habitación queda retenida por un carrito abandonado. Sin caducidad, para siempre. |

La salida estándar de la industria es la tercera: **crear en estado retenido, que cuenta contra el
inventario, con caducidad corta, y confirmar cuando el pago avisa**.

⚠️ **Y el valor por omisión de 24 h es incorrecto para tarjeta.** Veinticuatro horas de inventario
retenido por cada carrito abandonado vacía la disponibilidad de un hotel pequeño en un fin de
semana. 24 h es el número correcto para **otro** medio de pago —el vale de OXXO o la transferencia
SPEI, que tardan—, no para una tarjeta que responde en segundos. **La caducidad depende del medio
de pago, no de la propiedad.**

### 2.3 · ⚠️ El aviso de «cambió la disponibilidad» sólo lo dispara una reserva web

Comprobado en el código: `booking.availability.changed` se emite **en un único sitio**,
`public-reservations.service.ts:425`, cuando el motor público crea una reserva. El oyente
(`webhook-events.listener.ts:49-50`) también espera `channex.availability.changed`, y **nadie lo
emite**.

Conviene ser exacto sobre la consecuencia, porque es fácil exagerarla:

- **No causa sobreventa.** La guardia de §1.1 lee la base en vivo en el `POST`.
- **Sí causa un fracaso en el último paso.** El manager bloquea la Suite hoy; el calendario del
  sitio la sigue pintando disponible —su caché vive 60 s y nadie la invalida—; el huésped elige
  esas fechas, llena sus datos, **paga**, y recibe un 409.

Con el cobro por delante, ese 409 deja de ser una molestia y pasa a ser **una devolución**. Por eso
esto hay que arreglarlo *antes* de cobrar, no después.

### 2.4 · ⚠️ La llave se llama `pk_` pero es un secreto

`booking-api-key.service.ts:43` genera `pk_{env}_{keyId}{secret}` y guarda `bcrypt(secret)`. El
prefijo `pk_` es, en el vocabulario de Stripe que todo el mundo conoce, **«publishable»: seguro en
el navegador**. Aquí es exactamente lo contrario: es una credencial portadora que crea reservas.

El día que un desarrollador de un hotel vea `pk_live_…` en la documentación, lo va a pegar en el
JavaScript de su página. Hoy eso se mitiga porque `ApiKeyGuard` comprueba `allowedOrigins`
(`api-key.guard.ts:34-38`) — pero **sólo si el hotel configuró la lista**, y la lista vacía
significa «sin restricción».

Es un problema de nombres, y por eso es barato arreglarlo y caro dejarlo.

### 2.5 · El sitio de Azucar parte de otra arquitectura

`site/src/booking/` es un **formulario de solicitud** que manda un correo: `solicitud.ts`,
`FormularioSolicitud.astro`, más una paridad en PHP porque en el *jail* de HostGator no hay Node.
No hay calendario, y es deliberado — **ADR-0003** del repositorio `azucarWebSite` lo prohíbe:

> *«El sitio no muestra disponibilidad. No hay calendario que diga "libre" u "ocupado", porque no
> tenemos el dato y mostrar disponibilidad falsa es peor que no mostrarla.»*

🔴 **La premisa de ese ADR era «no hay PMS». Esa premisa ya es falsa: el PMS es Zenix.** ADR-0003
no estaba equivocado — era correcto en abril, cuando el dato no existía. Lo que cambió es que
construimos la fuente del dato.

**Consecuencia formal:** hace falta un ADR que **sustituya** a ADR-0003 en dos puntos —mostrar
disponibilidad y decir «confirmada»—, dejando el resto en pie. Y hay un guardián en
`verificar-todo.sh:318` que falla el build si aparece «reserva confirmada» en el HTML: ese guardián
tendrá que cambiar de regla **en el mismo commit que el ADR**, nunca antes.

---

## 3 · El diseño propuesto

### 3.1 · La secuencia, con el estado del inventario en cada paso

```
  Sitio del hotel                    Zenix                         Pasarela
  ───────────────                    ─────                         ────────
  1. pinta el calendario   ──GET──►  availability-calendar
                                     (consejo, caché 60 s)
  2. elige fechas          ──GET──►  rates  (total con impuestos)
  3. «reservar»            ──POST─►  RETENER  ◄── inventario ocupado
                                     · cerrojo + re-comprobación
                                     · caduca en N minutos
                           ◄─────── clientSecret + expiresAt
  4. paga                  ───────────────────────────────────────►  cobra
                                     ◄────── webhook firmado ───────
  5. CONFIRMAR                       · reserva firme en el calendario
                                     · empuje a las OTAs
                                     · correo al huésped
```

**Tres decisiones que sostienen todo esto:**

**a) La confirmación la dispara el webhook de la pasarela, nunca el navegador.** Si se confirma
cuando el navegador vuelve a la página de «gracias», basta que el huésped cierre la pestaña para
que un pago cobrado no tenga reserva. El redirect es una cortesía visual; **el webhook es el
hecho**.

**b) La retención ocupa inventario de verdad.** Un «hold» que no descuenta no es un hold: es una
nota. Ocupa, y por eso tiene que caducar.

**c) La caducidad la fija el medio de pago.** Tarjeta: 15 minutos. Vale OXXO o SPEI: 24–72 h, y en
ese caso hay que decirle al hotel que esas noches están retenidas y por qué.

### 3.2 · Qué hay que construir en Zenix

| # | Qué | Por qué no se puede saltar |
|---|---|---|
| **A1** | Estado `HOLD` con `expiresAt`, que cuenta en `AvailabilityService` y en el empuje a OTAs | Sin esto no hay forma segura de cobrar |
| **A2** | Liberador de retenciones caducadas (tarea periódica) | Un hold que no caduca es inventario perdido |
| **A3** | Emitir `availability.changed` **también** al bloquear, cancelar, mover y al entrar una reserva de OTA | §2.3 — evita la devolución |
| **A4** | `paymentPolicy` de verdad: `DEPOSIT_30`, `DEPOSIT_50`, `FULL_PREPAY` | Es el objetivo: cobrar el adelanto |
| **A5** | Cobro por **Stripe Connect**, con la cuenta destino en `LegalEntity` | El dinero es del hotel, no de ZaharDev; y el CFDI lo emite la entidad legal |
| **A6** | Confirmación por webhook firmado, idempotente | §3.1 a) |
| **A7** | Renombrar la llave a `sk_` y exigir `allowedOrigins` no vacío para llaves de navegador | §2.4 |

### 3.3 · Qué hay que construir para el sitio del hotel

El requisito que manda es el de venta: *«cuando vendamos Zenix a un hotel que viene de Cloudbeds,
pedimos las credenciales del sitio e instalamos esto»*. Eso descarta que el motor sea parte del
sitio. Tiene que ser **un módulo que se pega**.

```html
<div data-zenix-booking data-slug="hotel-tulum"></div>
<script src="https://cdn.zenix.com/motor.js" async></script>
```

**Por qué así, y no de otra manera:**

- **Sin dependencias del servidor del hotel.** El de Azucar no tiene Node —está medido, es un
  *jail* de HostGator— y el de un hotel que viene de Cloudbeds va a ser WordPress. Un guion que
  corre en el navegador funciona en los dos sin tocar su hosting.
- **Sin llave secreta en la página.** El `slug` ya es público; se usa la ruta
  `POST /properties/:slug/reservations`, que **no pide llave** y está protegida por límite por IP e
  idempotencia — el mismo patrón que Cloudbeds y Mews usan en su página alojada.
- **Aislado del estilo del hotel.** Dentro de un *shadow root*, para que su CSS no lo rompa ni el
  nuestro les rompa la página.
- **Marca blanca.** Colores, tipografía y textos salen de `BookingEngineConfig`, que ya los tiene:
  `logoUrl`, `primaryColor`, `accentColor`, `fontFamily`, `heroTitle`.

**Y una salida de emergencia que no hay que despreciar:** para el hotel que no quiera tocar su
código, la página alojada `book.zenix.com/{slug}` ya existe. El enlace desde su botón «Reservar» es
la instalación de cinco minutos; el módulo pegado es la buena.

### 3.4 · Lo que NO hay que construir

- **No hay que reimplementar disponibilidad en el sitio.** La única fuente es Zenix. El sitio pinta
  lo que le dicen y nunca decide.
- **No hay que guardar datos de tarjeta en ninguna parte.** Los recoge la pasarela en su propio
  campo. Es lo que mantiene a Zenix y al hotel fuera del alcance completo de PCI-DSS, y es
  literalmente el hallazgo crítico del sitio anterior de Azucar.
- **No hay que esperar a Channex.** Nada de esto lo necesita: el inventario es de Zenix. Channex
  reparte el mismo inventario a las OTAs cuando llegue.

---

## 4 · Orden propuesto

El criterio es el de [`20-criterios-de-decision.md`](20-criterios-de-decision.md) §8 —
**coste de equivocarse ÷ rapidez en enterarse**— y da un orden poco intuitivo: *el aviso va antes
que el cobro*.

| Orden | Qué | Por qué ahí |
|---|---|---|
| **1** | **A3** · emitir `availability.changed` en bloqueo, cancelación y OTA | Barato, y sin él cobrar produce devoluciones. Es el único que **empeora** si se pospone |
| **2** | **A1 + A2** · retención con caducidad y su liberador | Es el cimiento del cobro. Se prueba sin pasarela |
| **3** | **A7** · renombrar la llave y exigir orígenes | Cambio incompatible: cuanto antes, menos hoteles afectados |
| **4** | **A4 + A5 + A6** · cobro real con Stripe Connect | Sobre cimiento firme, no antes |
| **5** | El módulo pegable | Cuando hay algo que vale la pena enseñar |
| **6** | El ADR que sustituye a ADR-0003 + el cambio del guardián | **En el mismo commit** que el primer calendario publicado en Azucar |

---

## 5 · Lo que este documento NO pudo verificar

Se declara, en vez de rellenarlo con suposiciones:

- **Si Stripe Connect está disponible para la cuenta de ZaharDev con entidades mexicanas.** Requiere
  entrar al panel de Stripe; no se hizo. El uso actual de Stripe es otro —Zenix cobrándole al
  hotel, modelo `Subscription`— y el cobro huésped→hotel está marcado en el esquema como «sprint
  futuro» desde el 2026-05-29.
- **Cuánto tarda de verdad un hotel de Cloudbeds en darnos acceso a su sitio.** Es el supuesto
  comercial del que depende que el módulo pegable sea la vía principal y no la página alojada.
- **Si `PAY_AT_HOTEL` es aceptable para el piloto de Azucar.** El hotel no ha dicho si quiere
  cobrar por adelantado; es la pregunta **B4**, que sigue abierta.
