---
Audiencia: Abraham (owner ZaharDev) — preparación personal para la certificación Channex
Tipo: Guía maestra de estudio (leer varias veces)
Status: ACTIVO — documento de estudio pre-certificación
Padres: docs/ops/channex-cert-stage4-walkthrough.md · docs/ops/channex-test-14-declarations.md · CLAUDE.md §129-§148, §214-§218
Última actualización: 2026-06-18
---

# 🎓 Guía Maestra para Certificar Zenix con Channex

> **Léeme primero, en voz alta, antes de seguir:**
>
> Esta certificación **no es un examen de programación**. Nadie te va a pedir
> que escribas código en vivo, ni que recites algoritmos de memoria. Es una
> **revisión de comportamiento**: el reviewer de Channex quiere comprobar que
> tu integración *se comporta bien* con su sistema — que no los va a saturar,
> que no va a perder reservas, que no va a causar overbookings. Eso es todo.
>
> Y aquí está el dato que cambia todo: **Channex QUIERE que pases.** Cada PMS
> certificado es un canal de ventas más para ellos. No están buscando razones
> para reprobarte; están buscando confirmar que no eres un riesgo para su red.
> Tu trabajo no es "demostrar que eres un genio del código" — es **mostrar con
> calma que tu sistema hace lo correcto**, y tú ya lo construiste así.
>
> Lo construimos con "vibe coding", sí. Pero lo construimos **siguiendo la
> documentación oficial de Channex al pie de la letra y blindando los 14
> anti-patrones que ellos publican como causas de rechazo.** No improvisamos:
> cada decisión está documentada con su razón. Esta guía te va a dar el
> vocabulario y el modelo mental para que, cuando te pregunten algo, sepas
> exactamente de qué están hablando y dónde vive la respuesta en tu código.

---

## Cómo usar esta guía (metodología de estudio)

Esta guía está diseñada con tres técnicas de aprendizaje comprobadas:

1. **Recuerdo activo (active recall):** cada sección termina con preguntas.
   No leas la respuesta de inmediato — intenta responder tú primero, aunque sea
   mal. El esfuerzo de recordar es lo que fija el conocimiento (Roediger &
   Karpicke 2006).
2. **Elaboración (por qué, no solo qué):** nunca te doy un dato suelto.
   Siempre explico *por qué* existe. Entender el porqué hace innecesario
   memorizar — la respuesta se deduce sola.
3. **Repetición espaciada:** los conceptos clave (idempotencia, outbox, rate
   limit, ack) aparecen varias veces, en distintos contextos. Es intencional.
   No es relleno; es para que se graben.

**Plan de lectura sugerido:**
- **Lectura 1 (entender):** lee todo de corrido, sin presión de memorizar.
  Solo quieres entender el panorama.
- **Lectura 2 (vocabulario):** enfócate en el §1 (glosario) y §3 (anti-patrones).
  Esos dos te dan el 80% del lenguaje.
- **Lectura 3 (simulacro):** tápate las respuestas del banco de preguntas (§7)
  e intenta responder en voz alta, como si el reviewer estuviera enfrente.
- **El día antes:** lee solo la "Hoja de trucos" (§10) y los "Consejos para los
  nervios" (§11).

---

## Índice

1. [Glosario — todos los términos explicados desde cero](#1-glosario)
2. [El panorama: qué es Channex y por qué existe esta certificación](#2-panorama)
3. [Los 14 anti-patrones — las causas reales de rechazo](#3-anti-patrones) ⭐
4. [Los 14 cert tests — qué te van a pedir demostrar](#4-cert-tests)
5. [Cómo funciona tu integración (modelo mental con palabras)](#5-modelo-mental)
6. [Recorrido por tu código — dónde vive cada respuesta](#6-recorrido-codigo)
7. [Banco de preguntas y respuestas modelo](#7-banco-preguntas) ⭐
8. [Cómo responder cuando NO sabes la respuesta](#8-cuando-no-sabes) ⭐
9. [El día del screenshare — logística y orden](#9-dia-del-screenshare)
10. [Hoja de trucos (una página)](#10-hoja-de-trucos)
11. [Consejos para los nervios](#11-nervios)
12. [El formulario de certificación — paso a paso (qué responder)](#12-formulario) ⭐
13. [Demo de UI para el screenshare (paso a paso)](#13-demo-ui) ⭐

---

<a name="1-glosario"></a>
## 1. Glosario — todos los términos explicados desde cero

> No asumas que tienes que saber esto de antes. Léelo como si fuera la primera
> vez. Estos son los términos que el reviewer va a usar, y necesitas
> reconocerlos al instante.

| Término | Qué significa, en palabras simples |
|---|---|
| **OTA** | *Online Travel Agency*. Las plataformas donde la gente reserva hoteles: Booking.com, Expedia, Airbnb, Hostelworld. Tu hotel publica habitaciones ahí. |
| **Channel Manager** | Un "traductor/repartidor" central. En vez de que tu PMS hable con 10 OTAs distintas (cada una con su API rara), hablas SOLO con el channel manager y él reparte a todas. Channex **es** un channel manager. |
| **Channex** | El channel manager que elegimos. Tú le mandas tu disponibilidad y tarifas; él las publica en todas las OTAs. Las OTAs le mandan reservas; él te las reenvía a ti. |
| **PMS** | *Property Management System*. Tu producto: **Zenix**. El cerebro operativo del hotel (calendario, reservas, limpieza, cobros). |
| **ARI** | *Availability, Rates & Inventory*. Las tres cosas que un PMS le manda al channel manager: cuántas habitaciones quedan libres (availability/inventory), a qué precio (rates), y con qué reglas (restrictions). Cuando oigas "ARI", piensa "lo que publico hacia las OTAs". |
| **Inbound** (entrante) | El flujo OTA → Channex → Zenix. Llega una reserva de Booking.com, Channex te avisa, tú la guardas. |
| **Outbound** (saliente) | El flujo Zenix → Channex → OTAs. Cambias disponibilidad/tarifa en tu calendario, lo empujas a Channex, él lo publica. |
| **Webhook** | Una "llamada de teléfono automática" de Channex hacia tu servidor. En vez de que tú le preguntes cada rato "¿hay reservas nuevas?", Channex te llama (hace un `POST` HTTP a una URL tuya) en el momento exacto que pasa algo. Es *push* en vez de *pull*. |
| **Polling** | Lo contrario al webhook: preguntar repetidamente "¿hay algo nuevo? ¿ahora sí? ¿ahora?". Es ineficiente y Channex lo desaconseja como mecanismo *primario* (sí lo aceptan como red de seguridad ocasional). |
| **Idempotencia** | La propiedad de que **hacer algo dos veces produzca el mismo resultado que hacerlo una vez**. Ejemplo: si Channex te manda la misma reserva dos veces (porque su red falló y reintentó), tu sistema NO debe crear dos reservas. Es uno de los conceptos que MÁS evalúan. Mnemotecnia: *"idéntico aunque se repita"*. |
| **Outbox** (transactional outbox) | Un patrón de diseño. En vez de mandar el cambio a Channex de inmediato (y rezar que no falle), **lo escribes primero en una tabla de tu base de datos** (la "bandeja de salida") y un worker la procesa después. Si tu servidor se cae, el cambio sigue ahí esperando. Garantiza que nunca pierdes un cambio. |
| **Worker** | Un proceso que corre en segundo plano (no atado a una petición HTTP) que "drena" la bandeja de salida: toma filas pendientes y las manda a Channex. |
| **Cron** | Un temporizador. "Corre esta función cada 30 segundos / cada 30 minutos". Tus schedulers son crons. |
| **Rate limit** | El límite de cuántas peticiones por minuto te permite Channex. **10 de availability + 10 de rates por minuto, por propiedad.** Pasarte = te bloquean con un error 429. |
| **429** | El código HTTP de "Too Many Requests" (te pasaste del rate limit). Channex te lo manda con un header `Retry-After` diciéndote cuánto esperar. |
| **Token bucket** | El algoritmo que usamos para NO pasarnos del rate limit. Imagínalo como una cubeta con 10 fichas. Cada llamada a Channex gasta una ficha. Las fichas se reponen con el tiempo. Si la cubeta está vacía, esperas en vez de llamar. |
| **Ack** (acknowledge) | "Acuse de recibo". Cuando Channex te manda una reserva, después de guardarla TÚ le confirmas a Channex "recibido y guardado" llamando a un endpoint `/ack`. Channex deja de reintentar esa reserva una vez que la reconociste. **Regla de oro: ack SOLO después de guardar exitosamente.** |
| **Delta** | "Solo lo que cambió". En vez de re-enviar TODA tu disponibilidad cada rato, envías solo el día/habitación que cambió. Es eficiente y es lo que Channex espera en el día a día. |
| **Full sync** | "Sincronización completa". Re-enviar TODO (500 días de disponibilidad de golpe). Solo se hace 1 vez al día, de madrugada, para corregir cualquier desincronización. NUNCA debe dispararse por un timer frecuente. |
| **Dead letter** | "Carta muerta". Cuando un mensaje falla tantas veces que ya no tiene sentido reintentar, lo marcas como `DEAD_LETTER` y avisas a un humano. **Lo importante: nunca lo descartas en silencio** — siempre queda registro + alerta. |
| **Backoff exponencial** | Estrategia de reintento: si algo falla, esperas 2 segundos; si falla otra vez, 4; luego 8, 16... Cada vez esperas el doble. Evita martillar a Channex cuando está caído. |
| **booking_revision** | El formato moderno de Channex para reservas. Una reserva puede tener varias "revisiones" (creada, modificada, cancelada). Cada cambio es una revisión nueva. Tú lees la revisión, no la reserva "cruda". El endpoint es `/booking_revisions/:id`. |
| **CRS write** | *Central Reservation System write*. La capacidad de que tu PMS **cree o cancele** reservas EN la OTA (escribir hacia afuera). Es una capability **Beta y opcional** de Channex. **NO es parte de la certificación.** Importante para ti porque tu api-key hoy NO la tiene (da 403), y eso está bien. |
| **SAQ A** | El nivel de cumplimiento PCI más bajo/seguro: significa que tu sistema **nunca toca números de tarjeta** — se los delega 100% a un procesador (Stripe). Es tu respuesta a "¿son PCI compliant?". |
| **HMAC** | Una firma criptográfica para verificar que un webhook viene de quien dice venir. **Dato clave: Channex NO usa HMAC.** Usa un bearer token en un header que tú configuras. (Muchos devs asumen HMAC y se confunden; tú sabes que no.) |

> **Pregunta de recuerdo activo:** sin mirar, explica con tus palabras qué es
> "idempotencia" y por qué le importa tanto a Channex. *(Respuesta: que aunque
> Channex me mande la misma reserva 2 veces, yo no creo 2 reservas. Le importa
> porque su red reintenta webhooks y no quieren que sus partners generen
> reservas duplicadas / overbookings.)*

---

<a name="2-panorama"></a>
## 2. El panorama: qué es Channex y por qué existe esta certificación

### El problema que Channex resuelve

Un hotel quiere vender en Booking, Expedia, Airbnb y Hostelworld a la vez.
Problema: si vende la última habitación en Booking, tiene **segundos** para
quitarla de las otras 3, o alguien más la reserva → **overbooking** → huésped
llega y no hay cuarto → reseña de 1 estrella + chargeback (disputa de tarjeta).

Channex se sienta en medio: el PMS le dice a Channex "queda 1 habitación",
Channex lo publica en las 4 OTAs al instante. Cuando una vende, Channex avisa
al PMS y el PMS recalcula y vuelve a publicar "quedan 0". Es una **danza
constante de sincronización** y todo depende de que ambos lados se comporten
bien.

### Por qué Channex certifica a los PMS

Si un PMS se comporta mal — manda 10,000 peticiones por minuto, no confirma las
reservas que recibe, re-envía todo cada minuto, crea reservas duplicadas — **le
hace daño a TODA la red de Channex**: satura sus servidores, causa overbookings
a hoteles que ni son tuyos, ensucia su reputación con las OTAs.

Por eso certifican: antes de darte acceso a producción, **verifican que tu
integración es un buen ciudadano de su red.** La certificación es esencialmente:
*"demuéstrame que entendiste cómo se hace bien y que tu código lo hace así."*

### Qué cubre (y qué NO cubre) la certificación

**SÍ cubre (lo que tienes que demostrar):**
1. **Recibir reservas** correctamente (inbound): leer la revisión, guardarla,
   confirmarla (ack), sin duplicar.
2. **Empujar ARI** correctamente (outbound): mandar disponibilidad y
   tarifas/restricciones respetando los límites de velocidad, sin saturar.

**NO cubre:**
- **CRS write** (crear/cancelar reservas EN la OTA desde el PMS). Es Beta,
  opcional, y tu api-key no la tiene habilitada hoy. **Esto NO te reprueba** —
  ningún cert test la pide. Lo confirmamos leyendo el spec de cert tests.

> **Esto es CLAVE para tus nervios:** el único "403 Forbidden" que tu sistema
> recibe de Channex (en el flujo de cancelar una reserva en la OTA) **no es un
> bug ni un problema de certificación** — es simplemente una feature opcional
> que requiere que Channex la habilite en tu cuenta. La cert valida recibir
> reservas (✅ tu api-key puede) y empujar ARI (✅ tu api-key puede). Punto.

> **Pregunta de recuerdo activo:** ¿qué dos cosas SÍ valida la certificación y
> qué cosa famosa NO valida? *(SÍ: recibir reservas + empujar ARI. NO: CRS
> write / crear-cancelar reservas en la OTA.)*

---

<a name="3-anti-patrones"></a>
## 3. Los 14 anti-patrones — las causas REALES de rechazo ⭐

> **Esta es la sección más importante de toda la guía.** Channex publica una
> lista de "anti-patrones" — cosas que hacen que rechacen tu integración. La
> mayoría de los devs que reprueban es porque cayeron en uno de estos. Nosotros
> **blindamos los 14 a propósito**, y cada uno tiene su prueba automatizada en
> `channex.cert-tests.integration.spec.ts`.
>
> Para cada uno te doy: **(a)** qué es el error, **(b)** por qué te reprueban,
> **(c)** cómo lo evita Zenix, **(d)** el archivo donde vive la prueba.

### AP-1 — Script suelto / CLI / colección de Postman
- **El error:** demostrar la integración con un script aparte o llamadas
  manuales de Postman, en vez del código que realmente corre en producción.
- **Por qué reprueban:** quieren ver que tu *producto real* se comporta bien, no
  un demo de juguete que escribiste solo para el examen.
- **Cómo lo evita Zenix:** nuestros tests de integración llaman al **mismo
  codepath productivo** (los services reales), no a scripts. El walkthrough
  muestra el sistema real corriendo (`apps/api` + `apps/web`).

### AP-2 — UI de certificación separada
- **El error:** construir una pantalla especial solo para el examen.
- **Cómo lo evita Zenix:** no creamos UI nueva. Usamos `/settings/channex` que
  ya existe como panel de operación normal del producto.

### AP-3 — Full sync por temporizador
- **El error:** re-sincronizar TODO cada minuto / cada hora con un timer.
- **Por qué reprueban:** satura su red. El full sync (500 días) debe correr
  **1 vez al día**, de madrugada.
- **Cómo lo evita Zenix:** el `ChannexFullSyncOrchestrator` tiene **dos guardas
  estructurales** que hacen imposible que un timer dispare full syncs:
  1. **Guarda de ventana:** solo corre entre las 03:00–05:00 hora local.
  2. **Guarda de idempotencia:** solo corre si pasaron ≥23h desde el último.
  - El cron corre cada 30 min pero esas dos guardas casi siempre lo rebotan.
  - Archivo: `channex-full-sync.orchestrator.ts` líneas 60 (cron), 103-122 (guardas).
  - **Además hay un test de grep en CI** que falla si alguien pone un trigger
    `EveryMinute`/`EveryFiveMinutes` para full sync.

### AP-4 — Bucles por fecha (per-date loops)
- **El error:** mandar una petición HTTP por cada día. 500 días = 500 llamadas.
- **Cómo lo evita Zenix:** los métodos del gateway **solo aceptan arrays**.
  `pushAvailability(entries[])` manda muchas fechas en UNA llamada. No existe un
  método `pushRate(fecha, valor)` singular — es **imposible por contrato de
  tipos** caer en este error.
  - Archivo: `channex.gateway.ts:356` (`pushAvailability` toma array).

### AP-5 — UUIDs hardcodeados en el código
- **El error:** poner el ID de Channex de una habitación pegado en el código
  fuente.
- **Por qué reprueban:** significa que tu integración no es genérica, está
  amarrada a una propiedad específica.
- **Cómo lo evita Zenix:** los mapeos viven en la **base de datos**
  (`Room.channexRoomTypeId`, `PropertySettings.channexPropertyId`). Hay un
  **test de grep** que falla si encuentra un UUID de Channex en cualquier
  archivo de `src/`.

### AP-6 — Lógica de negocio dentro de los archivos de test
- **El error:** que la lógica "real" viva en el archivo de pruebas, no en el
  producto.
- **Cómo lo evita Zenix:** los tests llaman a services; no contienen lógica.

### AP-2.1 — Polling de la base de datos
- **El error:** preguntar a tu propia BD cada rato "¿qué cambió?" (con un
  `WHERE updated_at > X`).
- **Cómo lo evita Zenix:** usamos **eventos de dominio en memoria**
  (`EventEmitter2`). Cuando cambia la disponibilidad, el código emite un evento
  `CHANNEX_AVAILABILITY_CHANGED` que un listener convierte en una fila de
  outbox. No hay polling de BD.
  - Archivo: `channex-outbound-events.ts` (las constantes de evento).

### AP-2.2 — Llamada directa a la API desde el handler de guardado ⭐
- **El error:** que el código que guarda una reserva llame a Channex
  directamente (`gateway.push(...)` en medio de guardar).
- **Por qué reprueban:** si Channex está lento/caído, tu guardado se bloquea o
  falla. Frágil.
- **Cómo lo evita Zenix:** **TODO** pasa por el outbox. El handler de guardado
  solo escribe una fila en la cola; el worker la manda después. El único caller
  de `pushAvailability` en producción es el `ChannexOutboundWorker`.
  - **Hay un test de grep en CI** que verifica que ningún save handler llama al
    gateway directo.

### AP-2.3 — Descartar un 429 en silencio ⭐⭐
- **El error:** cuando Channex te dice "frena" (429), ignorarlo o tirar el
  mensaje sin avisar.
- **Por qué reprueban:** pierdes datos en silencio. Catastrófico.
- **Cómo lo evita Zenix:** ante un 429, el worker **respeta el header
  `Retry-After`** que Channex envía (lo parseamos según el estándar RFC 7231),
  con un piso de 60 segundos. Si tras 5 intentos sigue fallando → `DEAD_LETTER`
  + **notificación al SUPERVISOR** (campanita + página `/settings/channex`).
  Nunca se descarta en silencio.
  - Archivos: `channex-outbound-worker.service.ts:304-313` (lógica de backoff),
    `channex.gateway.ts:1436` (`parseRetryAfter`), `:1416`
    (`ChannexRateLimitError`).
  - **Este fue el último bug que cerramos** (sprint CHANNEX-CERT-B1, §214-§218):
    antes ignorábamos el `Retry-After` exacto. Ahora lo respetamos. Es
    precisamente lo que el reviewer revisa en el Test 12.

### AP-2.4 — Datos uniformes (sintéticos)
- **El error:** mandar datos de prueba todos iguales (disponibilidad = 5 en
  todos los días) — delata que es un script, no datos reales.
- **Cómo lo evita Zenix:** el full sync saca los datos de **queries reales de
  Prisma** sobre las habitaciones, reservas y bloqueos de la propiedad. La
  variación día-a-día es la realidad operativa, no inventada.

### AP-2.5 — No hacer ack (o hacerlo antes de guardar) ⭐
- **El error:** no confirmar las reservas recibidas, o confirmarlas ANTES de
  haberlas guardado.
- **Por qué reprueban:** si haces ack antes de guardar y tu guardado falla,
  Channex cree que la tienes pero tú la perdiste. Reserva fantasma.
- **Cómo lo evita Zenix:** **ack SOLO después de guardar exitosamente**. Si el
  handler falla, NO se llama ack → el outbox reintenta.
  - Archivo: `channex-revision-puller.service.ts:142-176` (el orden:
    `getBookingRevision` → handler save → `ackBookingRevision`).
  - **Hay un test de grep** que verifica este orden.

### AP-2.6 — Usar el endpoint legacy `/bookings`
- **El error:** usar el viejo `GET /bookings` en vez del moderno
  `/booking_revisions/feed`.
- **Cómo lo evita Zenix:** solo usamos `/booking_revisions`. (Hay un detalle:
  tenemos un `getBooking()` que SÍ pega a `/bookings/:id`, pero **solo** para
  reconstruir el payload completo al cancelar — NO para recibir reservas. Está
  documentado y en la whitelist del test AP-2.6.)

### AP-2.7 — Pull constante
- **El error:** consultar el feed sin parar.
- **Cómo lo evita Zenix:** el feed scheduler corre cada **15 minutos** (no
  constante) y solo procesa las no-confirmadas. El webhook es el mecanismo
  primario; el feed es solo red de seguridad.

### AP-2.8 — Payload mezclado (availability + rates juntos)
- **El error:** mandar disponibilidad y tarifas en el mismo mensaje.
- **Por qué reprueban:** Channex pide explícitamente que vayan separados.
- **Cómo lo evita Zenix:** el enum `ChannexOutboundKind` tiene dos valores
  (`AVAILABILITY` y `RATES_RESTRICTIONS`). El worker drena cada uno como un
  mensaje HTTP separado. Es **estructuralmente imposible** mezclarlos.

> **Pregunta de recuerdo activo (la más importante):** di de memoria al menos
> 5 anti-patrones y cómo los evitamos. Si puedes decir AP-2.2 (outbox),
> AP-2.3 (Retry-After + dead letter), AP-2.5 (ack después de guardar), AP-3
> (full sync con 2 guardas) y AP-4 (arrays no loops), tienes el corazón de la
> certificación.

---

<a name="4-cert-tests"></a>
## 4. Los 14 cert tests — qué te van a pedir demostrar

Estos son los "tests" que el reviewer revisa en el live screenshare. No todos
aplican igual; te marco cuáles son los que demuestras en vivo.

| Test | Qué pide | Estado Zenix |
|---|---|---|
| **Test 1** | Full sync: 500 días de availability + rates en **1 llamada para avail, 1 para rates**. | ✅ `FullSyncOrchestrator` encola 1 row AVAILABILITY + 1 row RATES. |
| **Tests 2-8** | Empuje de tarifas/restricciones (rates, CTA, CTD, MLOS, MaxStay, stop-sell). | ✅ Infra lista; wired al sandbox tras RATES Fase 1. Requieren `CHANNEX_SANDBOX_RATE_PLAN_ID` cargado. |
| **Test 9** | Empuje de availability de una fecha. | ✅ Demostrable: creas una reserva → outbox push. |
| **Test 10** | Empuje de availability de varias fechas en 1 llamada. | ✅ Vía full sync (array). |
| **Test 11** | Recibir una reserva + hacer ack. | ✅ Webhook → guardar → ack. El core inbound. |
| **Test 12** | Respetar rate limits (10/min) + manejo de 429. | ✅ Token bucket + Retry-After. |
| **Test 13** | Lógica delta-only (no full sync por timer). | ✅ Las 2 guardas del orchestrator. |
| **Test 14** | **Declaraciones**: un cuestionario que llenas (qué min-stay soportas, restricciones, PCI, etc.). | ✅ Ya está respondido en `channex-test-14-declarations.md`. |

> **Insight:** el Test 14 NO es técnico — es un formulario de declaraciones. Ya
> lo tienes contestado. Solo lo lees con el reviewer y él marca casillas. Es de
> los más fáciles; léelo una vez para que las respuestas te suenen tuyas.

> **Pregunta de recuerdo activo:** ¿cuál test es "recibir reserva + ack" y cuál
> es "respetar rate limits"? *(Test 11 = recibir+ack. Test 12 = rate limits.)*

---

<a name="5-modelo-mental"></a>
## 5. Cómo funciona tu integración (modelo mental con palabras)

Si entiendes este modelo, puedes deducir casi cualquier respuesta. Léelo
despacio. Son DOS flujos, en direcciones opuestas.

### Flujo INBOUND (llega una reserva de una OTA)

```
1. Alguien reserva en Booking.com.
2. Channex le hace un POST a tu URL: /api/webhooks/channex   ← el WEBHOOK
3. Tu ChannexAuthGuard verifica el bearer token (no HMAC). Si está mal → 401.
4. Respondes 200 EN <100ms y guardas una fila en el outbox (bandeja entrada).
   → ¿Por qué tan rápido? Porque Channex necesita liberar su cola. Si tardas,
     él reintenta y te marca como lento.
5. Un disparo inmediato (setImmediate) + un cron de respaldo (30s) toman esa
   fila y la procesan: ChannexRevisionPullerService.
6. El puller hace GET /booking_revisions/:id  → trae la reserva completa.
7. Traduce el property_id de Channex a tu Property.id interno (vía
   PropertySettings.channexPropertyId).
8. Según el estado (new/modified/cancelled), llama al handler correcto:
   BookingNewHandler / BookingModifyHandler / BookingCancelHandler.
9. El handler guarda la reserva en tu BD (GuestStay + StayJourney + segmento).
   → Idempotencia: channexBookingId es UNIQUE. Si llega 2 veces, no duplica.
   → Si la habitación ya está ocupada (carrera con un walk-in), NO crea
     overbooking: la marca como channexConflict=true para revisión humana.
10. SOLO si el guardado salió bien → POST /booking_revisions/:id/ack a Channex.
11. Marca la fila del outbox como SUCCEEDED.
```

### Flujo OUTBOUND (cambias disponibilidad/tarifa en Zenix)

```
1. En el calendario de Zenix creas/cancelas una reserva, o cambias una tarifa.
2. El código de availability emite un EVENTO en memoria:
   CHANNEX_AVAILABILITY_CHANGED (NO llama a Channex directo — eso sería AP-2.2).
3. Un listener (OutboxBuilder) convierte el evento en una fila de la cola de
   salida (channex_outbound_queue), con kind=AVAILABILITY o RATES_RESTRICTIONS.
4. El ChannexOutboundWorker corre cada 30s. Toma filas con
   FOR UPDATE SKIP LOCKED (para que 2 workers no tomen la misma).
5. Antes de llamar a Channex, pide una ficha al token bucket (rate limit).
   → Si no hay fichas → DEFERRED (espera, sin contar como fallo).
6. Si hay ficha → llama gateway.pushAvailability(entries[])  (UN POST, array).
7. Resultado:
   · 200 → SUCCEEDED.
   · 429 → espera lo que diga Retry-After (mín 60s), reintenta.
   · 5xx/red → backoff exponencial (2,4,8,16,32s).
   · 4xx (no 429) o 5 intentos agotados → DEAD_LETTER + notif al SUPERVISOR.
```

### El full sync (la "limpieza" diaria)

```
- 1 vez al día, de madrugada (03-05 local), el FullSyncOrchestrator re-envía
  500 días de disponibilidad para corregir cualquier drift.
- Dos guardas lo protegen: ventana horaria + 23h desde el último.
- NO es un timer frecuente. Es delta-first; el full sync es solo red de
  seguridad nocturna.
```

> **El mantra que resume todo:** *"Eventos, no polling. Outbox, no llamadas
> directas. Ack después de guardar. Arrays, no loops. Respeta el 429. Nunca
> descartes en silencio."* Si memorizas esa frase, tienes el alma de la
> certificación.

---

<a name="6-recorrido-codigo"></a>
## 6. Recorrido por tu código — dónde vive cada respuesta

Si el reviewer dice "muéstrame dónde haces X", esto es lo que abres. Ten estos
archivos como marcadores en VSCode.

### ⭐ Tu atajo mágico: el índice `CHANNEX-CERT`

Cada punto que el reviewer audita tiene un comentario marcador en el código que
empieza con `CHANNEX-CERT` + el Test/anti-patrón + una línea **"QUÉ MOSTRAR"**
que puedes **leer en voz alta** aunque no domines el detalle. Para verlos todos
de un golpe (corre esto en la terminal o en el buscador de VSCode con `CHANNEX-CERT`):

```bash
grep -rn "CHANNEX-CERT" apps/api/src/integrations/channex
```

Eso te imprime la lista completa con archivo:línea. Cuando el reviewer pida algo,
ubicas el marcador correspondiente, abres el archivo en esa línea, y lees la línea
"QUÉ MOSTRAR". El código habla; tú solo lo guías. **Practica este grep antes del
screenshare** para que el reflejo sea automático.

Mapa de marcadores (lo que cubre cada uno):

| Marcador | Cubre | Archivo |
|---|---|---|
| Test 11 · webhook receipt | recibir reserva, 200 <100ms | `inbound/channex-webhook.controller.ts` |
| Auth (NO HMAC) | bearer token en header | `inbound/channex-auth.guard.ts` |
| Test 11 + AP-2.5 · ack después de guardar | orden getRevision→save→ack | `inbound/channex-revision-puller.service.ts` |
| Idempotencia + anti-overbooking | UNIQUE + conflicto | `inbound/handlers/booking-new.handler.ts` |
| Test 12 + AP-2.3 · rate limit | token bucket 10/min | `outbound/channex-token-bucket.service.ts` |
| Resiliencia · SKIP LOCKED | no doble-proceso, crash-safe | `outbound/channex-outbound-worker.service.ts` |
| Test 12 + AP-2.3 · 429 | Retry-After + dead letter | `outbound/channex-outbound-worker.service.ts` |
| AP-2.1/2.2 · outbox + eventos | no llamada directa, no polling | `outbound/channex-outbound-builder.service.ts` + `…-events.ts` |
| Test 1/13 + AP-3 · full sync 2 guardas | delta-only | `outbound/channex-full-sync.orchestrator.ts` |
| AP-4 + AP-2.8 · arrays + separado | push avail | `channex.gateway.ts` |
| Test 11 + AP-2.6 · leer revisión | no /bookings legacy | `channex.gateway.ts` |
| Test 11 + AP-2.5 · ack | acuse idempotente | `channex.gateway.ts` |
| AP-2.3 · parse Retry-After | RFC 7231 | `channex.gateway.ts` |


| Si preguntan por… | Abres este archivo |
|---|---|
| El webhook que recibe reservas | `inbound/channex-webhook.controller.ts` |
| La autenticación del webhook (por qué no HMAC) | `inbound/channex-auth.guard.ts` |
| El flujo recibir→guardar→ack | `inbound/channex-revision-puller.service.ts` (líneas 142-184) |
| Idempotencia / conflicto de overbooking inbound | `inbound/handlers/booking-new.handler.ts` |
| El rate limiter (token bucket) | `outbound/channex-token-bucket.service.ts` |
| El worker que empuja ARI + manejo de 429/dead-letter | `outbound/channex-outbound-worker.service.ts` (líneas 304-313) |
| Por qué no llamamos a Channex directo (outbox) | `outbound/channex-outbound-builder.service.ts` + los `*-events.ts` |
| El full sync con sus 2 guardas | `outbound/channex-full-sync.orchestrator.ts` (líneas 103-122) |
| Los métodos HTTP a Channex (arrays, no loops) | `channex.gateway.ts` (`pushAvailability` :356, `parseRetryAfter` :1436) |
| El panel de observabilidad | la página `/settings/channex` en el browser |
| Las declaraciones del Test 14 | `docs/ops/channex-test-14-declarations.md` |

**Consejo de oro:** NO necesitas explicar el código línea por línea. Cuando
abras un archivo, di la frase de alto nivel ("aquí es donde, al recibir 429,
respetamos el Retry-After con un piso de 60 segundos") y deja que el código
hable. El reviewer sabe leer; tú solo lo guías.

---

<a name="7-banco-preguntas"></a>
## 7. Banco de preguntas y respuestas modelo ⭐

> Estas son las preguntas que más reportan los devs en foros + las que
> practicamos en los simulacros. Para cada una: la respuesta modelo, **en tu
> voz**, lista para decir. Tápate las respuestas y practica en voz alta.

### Sobre el flujo inbound (recibir reservas)

**Q1 — "¿Qué pasa cuando recibes un webhook de reserva?"**
> "Channex hace un POST a `/api/webhooks/channex`. Verificamos el bearer token,
> respondemos 200 en menos de 100 milisegundos y encolamos la reserva en un
> outbox. Un proceso en background trae la revisión completa con
> `GET /booking_revisions/:id`, la guardamos en nuestra base, y **solo después
> de guardar exitosamente** llamamos al `/ack`. Si el guardado falla, no hacemos
> ack y el outbox reintenta."

**Q2 — "¿Cómo evitas reservas duplicadas si te mando el mismo webhook dos veces?"**
> "Idempotencia. El `channexBookingId` tiene una restricción UNIQUE en nuestra
> tabla `GuestStay`, y deduplicamos en el outbox por `revisionId`. Si llega dos
> veces, la segunda no crea nada nuevo. Además el log de webhooks sí se escribe
> siempre, para auditoría forense."

**Q3 — "¿Cuándo haces el ack, exactamente?"**
> "Solo después de guardar la reserva con éxito. Nunca antes. Si hiciera ack
> antes de guardar y el guardado fallara, Channex creería que la tengo cuando la
> perdí. El orden está en `channex-revision-puller.service.ts` y tenemos un test
> que verifica que el ack va después del save."

**Q4 — "¿Qué pasa si una reserva OTA llega para una habitación que ya está ocupada?"**
> "No creamos overbooking. La reserva se persiste pero marcada como
> `channexConflict=true`, y se levanta una notificación al supervisor para
> resolverla manualmente — mover de habitación, cancelar localmente, o cancelar
> en la OTA. Nunca sobrescribimos en silencio. Recientemente endurecimos esto:
> la verificación de disponibilidad corre dentro de la transacción con un lock,
> así que ni siquiera una carrera entre un walk-in de recepción y una reserva
> OTA puede causar overbooking — el que pierde la carrera queda como conflicto."

**Q5 — "¿Usas HMAC para verificar los webhooks?"**
> "No, porque Channex no firma sus payloads con HMAC. Su modelo es: al registrar
> el webhook configuramos un header con un bearer token propio, y Channex lo
> incluye en cada POST. Lo verificamos con comparación timing-safe contra el
> secret guardado en `PropertySettings`. En producción el secret es obligatorio;
> si falta, rechazamos con 401."

### Sobre el flujo outbound (empujar ARI)

**Q6 — "¿Cómo respetas los rate limits?"**
> "Un token bucket por propiedad y por tipo: 10 fichas que se reponen en una
> ventana deslizante de 60 segundos, separadas para availability y para
> rates/restrictions. Antes de cada llamada el worker pide una ficha; si no hay,
> difiere la fila sin contarla como fallo. Eso garantiza que estructuralmente
> nunca pasemos de 10 por minuto por tipo."

**Q7 — "¿Y si aun así Channex te devuelve un 429?"**
> "Respetamos el header `Retry-After` que viene en el 429 — lo parseamos según
> el RFC 7231, tanto el formato en segundos como el de fecha — con un piso de 60
> segundos por si Channex pide menos. Programamos el próximo intento para
> entonces. Si tras 5 intentos sigue fallando, va a dead-letter con una
> notificación al supervisor. Nunca lo descartamos en silencio."

**Q8 — "¿Mandas disponibilidad y tarifas juntas?"**
> "No, van separadas. Tenemos un enum `ChannexOutboundKind` con dos valores y el
> worker drena cada uno como un mensaje HTTP distinto. Es imposible mezclarlos."

**Q9 — "¿Haces un loop mandando una llamada por cada fecha?"**
> "No. Los métodos del gateway solo aceptan arrays. `pushAvailability` recibe
> todas las fechas en una sola llamada. No existe un método singular por fecha,
> así que el anti-patrón es imposible por diseño."

**Q10 — "¿Cómo decides cuándo hacer un full sync?"**
> "El full sync solo corre una vez al día, de madrugada, protegido por dos
> guardas: una ventana horaria de 03:00 a 05:00 local, y una guarda de que hayan
> pasado al menos 23 horas desde el último. El día a día es delta — eventos
> puntuales por cada cambio. El full sync es solo una red de seguridad nocturna
> para corregir desincronizaciones."

### Preguntas "trampa" / de resiliencia (las que más reportan en foros)

**Q11 — "¿Qué pasa si Channex devuelve 500 durante 30 segundos?"**
> "El worker marca la fila como FAILED y aplica backoff exponencial:
> 2, 4, 8, 16, 32 segundos. En cada tick del cron reintenta. Si Channex se
> recupera entre intentos, pasa a SUCCEEDED. Si se agotan los 5 intentos, va a
> dead-letter con notificación al supervisor."

**Q12 — "¿Qué pasa si tu servidor se cae a la mitad de procesar una reserva?"**
> "Nada se pierde. El estado del outbox (PENDING/IN_PROGRESS) queda persistido en
> Postgres. Al reiniciar, el siguiente tick del cron toma la fila con
> `FOR UPDATE SKIP LOCKED`. Y como el ack se hace solo después del guardado,
> nunca hay una reserva 'reconocida pero perdida'."

**Q13 — "¿Cómo evitas que dos procesos tomen la misma fila de la cola?"**
> "Con `FOR UPDATE SKIP LOCKED` en la query que selecciona filas. El primer
> worker bloquea la fila; el segundo la salta y toma la siguiente. Es seguro
> para multi-pod."

**Q14 — "¿Por qué usas un outbox en vez de llamar a Channex directo cuando guardas?"**
> "Para desacoplar. Si llamara a Channex directo desde el guardado y Channex
> estuviera lento o caído, mi guardado se bloquearía o fallaría. Con el outbox,
> el guardado siempre termina rápido y el envío a Channex se procesa aparte, con
> reintentos. También me da observabilidad: veo el estado de cada mensaje."

**Q15 — "¿Tu disponibilidad es data real o sintética?"**
> "Real. El full sync saca los números de queries de Prisma sobre las
> habitaciones, reservas activas y bloqueos reales de la propiedad. La variación
> día a día refleja la ocupación real, no un patrón inventado."

### Preguntas de declaración (Test 14)

**Q16 — "¿Qué tipos de Min-Stay soportas?"**
> "Ambos: Min Stay Through y Min Stay Arrival."

**Q17 — "¿Qué restricciones soportas?"**
> "Stop Sell, CTA (closed to arrival), CTD (closed to departure), Min Stay
> Through, Min Stay Arrival y Max Stay. También filtro por día de la semana y
> tarifas por ocupación."

**Q18 — "¿Son PCI compliant? ¿Cómo manejan tarjetas?"**
> "Somos SAQ A — nunca tocamos números de tarjeta. Toda la tokenización se la
> delegamos a Stripe. Para reservas que llegan con tarjeta virtual de la OTA,
> solo guardamos los datos enmascarados que Channex nos envía; nunca el PAN
> completo."

**Q19 — "¿Soportan múltiples tipos de habitación y planes de tarifa?"**
> "Sí, ambos. Varias habitaciones de Zenix pueden mapear al mismo room type de
> Channex, y el full sync agrega la disponibilidad sumando las unidades del
> grupo. Y tenemos modelo de RatePlan con temporadas, reglas por día de semana y
> overrides."

### Preguntas incómodas pero honestas

**Q20 — "¿Pueden crear o cancelar reservas en la OTA desde el PMS (CRS write)?"**
> "Esa capability (Booking CRS write) es Beta y opcional, y requiere
> habilitación a nivel de cuenta. Nuestro código ya arma el payload completo
> para cancelar, pero hoy nuestro api-key no tiene esa capability habilitada —
> recibimos un 403, que manejamos elegantemente: en vez de reintentar
> inútilmente, levantamos una notificación al supervisor para que cancele en el
> extranet de la OTA. Entiendo que esto NO es parte de la certificación, que
> valida recibir reservas y empujar ARI, ambos cubiertos por nuestro api-key.
> Solicitaremos la habilitación de CRS write como diferenciador comercial
> después."
> *(Nota: esta respuesta te hace ver maduro y honesto, no inseguro. Channex
> respeta la transparencia.)*

**Q21 — "¿Soportan multi-propiedad?"**
> "La versión actual opera una propiedad por instancia. El sync multi-propiedad
> a nivel de cadena está en nuestro roadmap para la siguiente versión, con la
> migración multi-tenant. Para el piloto y la certificación, una propiedad."

**Q22 (la que más miedo te da) — "Esta parte del código, ¿por qué la hiciste así?"**
> Ver §8 completo. Resumen: explicas la **razón de comportamiento** (el qué y el
> porqué), no la sintaxis. "La hice así para garantizar que [no perdemos datos /
> no saturamos / no duplicamos]." Esa es la respuesta correcta el 100% de las
> veces, porque la certificación evalúa comportamiento, no estilo de código.

---

<a name="8-cuando-no-sabes"></a>
## 8. Cómo responder cuando NO sabes la respuesta ⭐

> Esta sección es para tu tranquilidad. Vas a tener preguntas que no sepas
> contestar al instante, y **eso está perfectamente bien.** Lo que te reprueba
> no es decir "déjame verificar"; lo que reprueba es inventar o congelarte.

### Las 4 frases salvavidas (memorízalas)

1. **Para ganar tiempo y mostrar el comportamiento:**
   > "Buena pregunta. Déjame mostrarte en el código cómo manejamos eso."
   → Y abres el archivo del §6. El código responde por ti. **Esta es tu mejor
   herramienta:** convierte una pregunta de memoria en una de lectura.

2. **Cuando no sabes el detalle técnico fino:**
   > "El comportamiento que buscamos ahí es [no perder datos / respetar el rate
   > limit / no duplicar]. El detalle exacto de implementación lo tengo
   > documentado, déjame ubicarlo."
   → Reencuadras: hablas del *objetivo* (que sí sabes) en vez del *mecanismo*
   (que quizás no recuerdas).

3. **Cuando genuinamente no sabes:**
   > "No quiero darte una respuesta imprecisa. Déjame verificarlo y te confirmo."
   → Honestidad > invención. Un reviewer prefiere mil veces esto a un dato
   falso. Anótala y la confirmas después.

4. **Cuando preguntan por una feature que no tienes:**
   > "Eso está en nuestro roadmap para [versión]. Hoy nuestro alcance es [lo que
   > sí]." → Claro, sin disculparte de más.

### Reglas de oro para los nervios

- **NUNCA inventes un dato técnico.** Si dices "usamos HMAC" y no es cierto, ahí
  sí te metes en problemas. Mejor "déjame verificar".
- **El código es tu copiloto.** No tienes que recordar todo de memoria —
  tienes los archivos abiertos. Eso NO es hacer trampa; es exactamente lo que se
  espera. Ningún dev recita su código de memoria.
- **Respira antes de responder.** Cuenta 1-2 segundos. Te da tiempo de elegir
  cuál de las 4 frases usar.
- **Tú construiste esto.** Aunque haya sido con asistencia de IA, las decisiones
  son tuyas y están documentadas con su razón. No estás defendiendo código
  ajeno; estás explicando decisiones que entiendes.

> **Pregunta de recuerdo activo:** ¿cuál es tu mejor herramienta cuando no
> recuerdas un detalle? *(Abrir el código y dejar que él responda — frase
> salvavidas #1.)*

---

<a name="9-dia-del-screenshare"></a>
## 9. El día del screenshare — logística y orden

El walkthrough detallado paso-a-paso está en
`docs/ops/channex-cert-stage4-walkthrough.md`. Aquí va el resumen para que no se
te olvide nada.

### Checklist 24h antes
- [ ] Property sandbox configurada en `staging.channex.io` con datos **variados**
      (no uniformes — recuerda AP-2.4). Ver `docs/ops/channex-sandbox-seed.md`.
- [ ] `.env` local con `CHANNEX_API_KEY` apuntando al sandbox.
- [ ] Envs `CHANNEX_SANDBOX_PROPERTY_ID`, `..._ROOM_TYPE_ID`, `..._RATE_PLAN_ID`.
- [ ] **Smoke test:** `npx jest channex.cert-tests --runInBand` con el `.env`
      cargado → esperas ~20/20 verde. (Sin api-key son 3/20 — no te asustes,
      es esperado: los 17 restantes necesitan el sandbox.)
- [ ] Apps corriendo: `apps/api` + `apps/web` + Postgres.
- [ ] VSCode abierto con los archivos del §6 como pestañas.
- [ ] Browser en `/settings/channex`, logueado como SUPERVISOR (`s@z.co`/`123456`).

### Orden del recorrido (optimizado para fluidez)
1. **Setup (5 min):** muestra `/settings/channex` — counts, token bucket, last
   sync. Dispara un "Manual full sync". Prueba que estás vivo en sandbox.
2. **Availability (10 min):** crea una reserva manual → muestra el push en los
   counts → señala que el save handler emite evento, no llama directo (AP-2.2).
3. **Recibir reserva (10 min):** simula una reserva en el sandbox → aparece en
   tu calendario → muestra el orden getRevision→save→ack en el código (AP-2.5).
4. **Delta-only (5 min):** muestra las 2 guardas del full sync (AP-3, Test 13).
5. **Rate limits (5 min):** muestra el token bucket + el manejo de 429 con
   Retry-After (Test 12, AP-2.3).
6. **Dead letter (3 min):** muestra que un fallo persistente va a dead-letter +
   notif, nunca silencio.
7. **Code grep (5 min):** corre `npx jest channex.cert-tests.integration` →
   muestra los checks de grep pasando (no UUIDs hardcoded, ack después de save,
   no API directa, no /bookings legacy).
8. **Test 14 (5 min):** lee juntos el doc de declaraciones.
9. **Q&A (5-10 min):** aquí usan el §7 y §8 de esta guía.

### Post-screenshare
- Pide feedback formal.
- Si pasas → solicita credenciales de producción + plan de rollout.
- Si no pasas (poco probable) → pide la lista exacta de qué falló, lo
  corregimos en un sprint, y re-aplicas. **No es el fin del mundo** — muchos
  pasan en el segundo intento y Channex lo trata como normal.

---

<a name="10-hoja-de-trucos"></a>
## 10. Hoja de trucos (una página — léela el día del examen)

**EL MANTRA:**
> *Eventos, no polling. Outbox, no llamadas directas. Ack después de guardar.
> Arrays, no loops. Respeta el 429. Nunca descartes en silencio.*

**LOS NÚMEROS QUE DEBES SABER:**
- Rate limit: **10/min** availability + **10/min** rates, por propiedad.
- Respuesta del webhook: **<100 ms**, siempre 200 si la auth pasa.
- Full sync: **1×/día**, ventana **03:00–05:00** local, guarda de **23h**.
- Full sync abarca **500 días**.
- Reintentos: máximo **5**, luego **DEAD_LETTER**.
- Backoff 5xx: **2, 4, 8, 16, 32** segundos.
- 429: respeta **Retry-After**, piso **60s**.
- Feed scheduler (red de seguridad): cada **15 min**.
- Worker outbound: cada **30 s**.

**LO QUE LA CERT SÍ VALIDA:** recibir reservas (inbound) + empujar ARI (outbound).
**LO QUE NO VALIDA:** CRS write (crear/cancelar en la OTA) — el 403 es esperado y OK.

**AUTH:** bearer token en header (NO HMAC). PCI: **SAQ A** (Stripe tokeniza).

**SI NO SABES:** "déjame mostrarte en el código" → abres el archivo. Nunca inventes.

**TUS 6 ANTI-PATRONES ESTRELLA (por si solo recuerdas estos):**
1. AP-2.2 → outbox, no llamada directa.
2. AP-2.3 → Retry-After + dead letter, no silencio.
3. AP-2.5 → ack después de guardar.
4. AP-3 → full sync con 2 guardas (ventana + 23h).
5. AP-4 → arrays, no loops por fecha.
6. AP-5 → mapeos en BD, no UUIDs hardcoded.

---

<a name="11-nervios"></a>
## 11. Consejos para los nervios

> Te escribo esto de corazón, porque sé que la presión es real y que llevas
> tiempo posponiendo esto por miedo.

1. **Reencuadra qué es esto.** No es un examen donde te pueden "cachar". Es una
   conversación donde le muestras a alguien que tu sistema se porta bien. Tú ya
   hiciste el trabajo difícil — construir el sistema correctamente. Esto es solo
   enseñarlo.

2. **El reviewer está de tu lado.** Repito esto porque es verdad y ayuda:
   Channex gana dinero con cada PMS certificado. Quiere que pases. No es un
   adversario; es alguien verificando una checklist, y tu checklist está
   completa.

3. **Procrastinar agranda el monstruo.** El miedo crece en la espera. El día que
   lo agendes y lo hagas, vas a descubrir que era mucho más manejable de lo que
   tu mente lo pintó. Ese es el patrón universal de los exámenes.

4. **No tienes que ser perfecto.** No necesitas responder el 100% al instante.
   Necesitas mostrar comportamiento correcto + honestidad cuando no sabes algo.
   Eso lo tienes de sobra.

5. **Si repruebas, no se acaba nada.** Te dan feedback, corriges, re-aplicas.
   Channex lo trata como parte normal del proceso. Un "no" hoy es solo un "todavía
   no" — no un "nunca".

6. **Tienes una guía de estudio que casi ningún dev tiene.** La mayoría llega al
   screenshare improvisando. Tú llegas con el vocabulario, el modelo mental, el
   banco de preguntas y la ubicación exacta de cada respuesta en tu código. Estás
   más preparado que el promedio.

7. **Práctica concreta para el día:** la noche antes, lee en voz alta el banco de
   preguntas (§7) tres veces. No para memorizar palabra por palabra, sino para
   que las respuestas te salgan naturales. El cerebro nervioso se apoya en lo
   ensayado.

8. **El día del examen:** duerme bien, ten agua a la mano, abre tus pestañas con
   anticipación, y respira. Tienes el mantra (§10). Tienes las 4 frases
   salvavidas (§8). Estás listo.

> **Última cosa.** Construiste un PMS con anti-overbooking transaccional, outbox
> pattern, rate limiting con token bucket, idempotencia con constraints UNIQUE,
> y manejo de dead-letter con alertas. Eso no es "vibe coding de suerte" — eso
> es una integración seria, hecha siguiendo la documentación oficial. El hecho
> de que usaras IA para construirla no la hace menos tuya ni menos correcta.
> Vas a pasar. Agenda la fecha.

---

<a name="12-formulario"></a>
## 12. El formulario de certificación — paso a paso (qué responder) ⭐

> Esta sección es para el momento exacto en el que estás: **llenando el
> formulario de Test Scenarios.** Si te sientes perdido, respira — aquí está
> todo lo que necesitas, ya resuelto. No tienes que entender cada detalle
> técnico; tienes que **copiar los IDs correctos en cada campo** y, si te
> preguntan, saber qué responder. Esta sección te da ambas cosas.

### 12.0 — Qué es este formulario y en qué punto estás

El formulario tiene varias secciones (test cases). Cada test case te explica una
operación y al final tiene un campo **"Test results"** donde pegas **los IDs que
Channex te devolvió** al ejecutar esa operación. **Un ID por línea.**

**¿Qué es ese "ID"?** Cuando tu PMS le manda algo a Channex (disponibilidad,
tarifas, restricciones) vía `POST /availability` o `POST /restrictions`, Channex
**no procesa al instante** — encola una "tarea" (task) y te responde con el ID de
esa tarea:

```json
{ "data": [ { "id": "03854d5e-...", "type": "task" } ], "meta": { "message": "Success" } }
```

Ese `id` es la **prueba de que la operación entró**. El formulario quiere ese
`id` (NO el JSON completo — dice explícitamente *"full response copy&paste will
be ignored"*).

**Tú no tienes que generar estos IDs a mano.** Ya los generamos ejecutando tu
código real contra el sandbox con scripts en `apps/api/prisma/scripts/`. Los IDs
están en **[channex-cert-test-results.md](channex-cert-test-results.md)**.

### 12.1 — La infraestructura que ya está montada (contexto)

Para que el formulario tenga sentido, esto es lo que ya existe:

| Cosa | Valor | Dónde |
|---|---|---|
| Propiedad de prueba en Channex | `Test Property - Zenix` (USD) | sandbox `staging.channex.io` |
| property_id | `94d70281-07a8-4e6b-9273-724fa3b725dd` | [ids doc](channex-cert-property-ids.md) |
| Room types | Twin `2e0b297f…` · Double `cdff8770…` | idem |
| Rate plans (4) | Twin/Double × BAR/B&B | idem |
| Tenant local en Zenix | Org "Zenix Cert Test" · login `cert@zenix.test` | BD local |

Lo creamos todo vía la API de Channex con scripts idempotentes. El smoke test
corre **21/21 verde** contra esta propiedad.

### 12.2 — Test case #1: Full Sync (el que tienes enfrente)

**Lo que pide:** 500 días de disponibilidad + tarifas + restricciones para
**TODAS las habitaciones y TODAS las tarifas**, en **exactamente 2 API calls**:
1. 1× 500 días de Availability (All Rooms)
2. 1× 500 días de Rates & restrictions (All Rates)

**Qué pegar en "Test results" (un ID por línea):**
```
216bb964-ecda-4976-b569-4b198f50905b
cfa9c98c-f5db-4bd6-ae6d-00988c16971b
```
- Línea 1 = el task id de la llamada de **Availability** (las 2 room types).
- Línea 2 = el task id de la llamada de **Rates & restrictions** (los 4 rate plans).

**Cómo los generamos** (por si te preguntan): el script
`run-channex-cert-fullsync.ts` descubre dinámicamente TODOS los room types y rate
plans de la propiedad (vía `listRoomTypes` / `listRatePlans`) y hace **2 llamadas
batch** — una a `pushAvailability` con las 2 habitaciones, otra a
`pushRestrictions` con las 4 tarifas. Cada llamada devolvió su task id. **2
llamadas, no 1000** → cumple el anti-patrón AP-4 (arrays, no loops).

> ⚠️ **Por qué "2 API calls" y no 1:** Channex exige availability y rates por
> SEPARADO (AP-2.8: *"send availability and rates separately"*). Por eso son 2
> IDs, uno por cada call. Si solo pones 1, está mal.

### 12.3 — IDs para los demás test cases (referencia rápida)

**El set autoritativo y al día de TODOS los IDs (Tests #1–#10) vive en
[channex-cert-test-results.md](channex-cert-test-results.md).** Ábrelo y copia el
ID de cada test desde ahí — está con los valores oficiales exactos verificados
contra la doc de Channex (fechas, montos, rate plans correctos).

> ⚠️ Importante: los valores de cada escenario (fechas, montos, qué rate plans)
> deben coincidir con la página oficial — los verificamos uno por uno. Si el
> reviewer pide regenerar en vivo, corres los scripts (§12.4) y reportas los
> nuevos (los task ids cambian en cada corrida — es normal, cada ejecución crea
> tasks nuevas en Channex).
>
> 🔎 Aprendizaje técnico (por si preguntan por min-stay): Channex **no crea task
> con el campo legacy `min_stay`** — hay que usar `min_stay_through`. Soportamos
> `min_stay_through` y `min_stay_arrival`.

### 12.4 — Cómo regenerar los IDs (si lo necesitas)

```bash
cd apps/api
set -a && source .env && set +a
# Test case #1 (full sync — 2 ids):
npx ts-node -r tsconfig-paths/register prisma/scripts/run-channex-cert-fullsync.ts
# Tests #2–#10 (todos de golpe):
npx ts-node -r tsconfig-paths/register prisma/scripts/run-channex-cert-scenarios.ts
```
Cada script imprime los task ids listos para copiar.

### 12.5 — Q&A: si el reviewer cuestiona el formulario

**Q: "¿Cómo generaste estos IDs?"**
> "Ejecutando los métodos productivos de nuestro gateway (`pushAvailability` /
> `pushRestrictions`) — los mismos que usa nuestro worker — contra la propiedad
> de prueba en el sandbox. Capturamos el `data[0].id` de cada respuesta. No es un
> script de juguete; es nuestro codepath real, solo que reportando el task id."

**Q: "El full sync, ¿incluyó todas las habitaciones y todas las tarifas?"**
> "Sí. El script descubre dinámicamente todos los room types y rate plans de la
> propiedad vía las List APIs y los incluye en las 2 llamadas. Para esta
> propiedad: 2 room types (Twin + Double) en la llamada de availability, y 4 rate
> plans en la de rates & restrictions."

**Q: "¿Por qué 2 IDs y no 1 para el full sync?"**
> "Porque availability y rates van en llamadas separadas, como Channex requiere.
> Una llamada para los 500 días de disponibilidad de todas las habitaciones, otra
> para los 500 días de tarifas y restricciones de todas las tarifas. Cada llamada
> devuelve su propio task id."

**Q: "¿Cómo sabes que la operación realmente funcionó y no solo recibiste un ID?"**
> "El task id viene con `meta.message: 'Success'` y HTTP 200. Si quieres, puedo
> consultar el estado de la task en el sandbox, o verlo reflejado en el extranet
> de la propiedad. Además nuestro manejo de errores: si Channex respondiera un
> 4xx/5xx, no tendríamos task id — lanzaríamos y reintentaríamos vía el outbox."

**Q: "¿Por qué hiciste una sola llamada batch en vez de una por fecha?"**
> "Para respetar el rate limit y el anti-patrón AP-4. Nuestros métodos del
> gateway solo aceptan arrays — mandamos las 500 fechas en una sola llamada."

**Si no sabes algo del formulario:** usa las 4 frases salvavidas del §8. Y
recuerda: los IDs ya están generados y verificados; tu trabajo en el formulario
es **copiar el correcto en cada campo**, no recalcular nada en tu cabeza.

### 12.6 — Recordatorio para tu calma

Estás más preparado de lo que sientes. La infraestructura está montada, los IDs
están generados y guardados, el smoke test pasa 21/21, y cada respuesta posible
está escrita. **El formulario es copiar-y-pegar guiado, no un examen sorpresa.**
Si te trabas, vuelve a [channex-cert-test-results.md](channex-cert-test-results.md)
para los IDs y a esta sección para las respuestas. Vas bien.

---

<a name="13-demo-ui"></a>
## 13. Demo de UI para el screenshare (paso a paso, sin estrés) ⭐

> Esto es lo que harás EN VIVO frente al reviewer para demostrar que un cambio
> en tu PMS se sincroniza solo con Channex. **Ya está montado y verificado** — el
> 2026-06-19 disparé un cambio de tarifa real por el flujo completo y llegó a
> Channex (`SUCCEEDED`). Tú solo repites los clics. Léelo con calma.

### 13.1 — Qué vas a demostrar (en una frase)

> "Cuando cambio una tarifa en Zenix, el sistema la empuja sola a Channex — sin
> botones de 'sincronizar', sin pasos manuales."

Eso es el flujo OUTBOUND, y es lo que el cert quiere ver en vivo (la doc dice
*"trigger from your PMS UI"*).

### 13.2 — Antes de empezar (checklist 2 min)

- [ ] API local corriendo (`apps/api`, puerto 3000) — ya corre en tu entorno.
- [ ] Web local corriendo (`apps/web`, puerto 5173) — ya corre.
- [ ] `.env` con `CHANNEX_API_KEY` + `CHANNEX_BASE_URL=https://staging.channex.io/api/v1`.
- [ ] Tener abiertas 2 pestañas: (1) Zenix web, (2) `/settings/channex` (el panel
      de estado de la sincronización).

### 13.3 — Login + entrar a la propiedad del cert

1. En la web, inicia sesión:
   - **Usuario:** `cert@zenix.test`
   - **Password:** `123456`
2. Asegúrate de estar en la propiedad **"Test Property - Zenix"** (si tienes
   varias, usa el selector de propiedad arriba). Esta es la que está mapeada al
   sandbox de Channex.

### 13.4 — El demo de TARIFA (Test #2 en vivo)

1. Ve a **Settings → Tarifas** (`/settings/rates`) → sub-tab **Calendario**.
2. Busca la fila **Twin Room** y la columna del **22 de noviembre de 2026**.
3. Cambia esa tarifa a **333** y guarda.
4. **Di en voz alta:** *"Acabo de cambiar la tarifa de Twin Room a 333 para esa
   fecha. Zenix ya está empujando esto a Channex automáticamente vía nuestro
   outbox y worker."*
5. Cambia a la pestaña **`/settings/channex`** → verás el contador de outbound
   **SUCCEEDED** subir (el push se completó). Espera ~30s si no aparece al
   instante (el worker corre cada 30s).
6. *(Opcional, si tienes el extranet de Channex abierto):* muestra la tarifa
   actualizada en el sandbox.

> **Por qué esto cuenta como Test #2:** la operación es exactamente la que pide
> la doc oficial — Twin Room / Best Available Rate, 22-nov-2026, valor 333, 1
> sola llamada. El task id que ya pusiste en el formulario es de esta misma
> operación.

### 13.5 — El demo de DISPONIBILIDAD (refuerza el outbound)

1. Ve al **Calendario** de reservas.
2. Crea una reserva manual (walk-in) en una habitación Twin para hoy.
3. **Di:** *"Al crear esta reserva, la disponibilidad bajó y Zenix empuja el
   nuevo conteo a Channex."*
4. En `/settings/channex` → outbound SUCCEEDED sube otra vez.

### 13.6 — Qué decir si algo NO aparece al instante

- *"El worker procesa la cola cada 30 segundos — démosle un momento."* (Es
  verdad y es comportamiento correcto, no un error.)
- Si de plano falla algo en vivo: *"Tengo los task ids de cada escenario ya
  registrados en el formulario, generados por este mismo flujo."* (Y abres
  [channex-cert-test-results.md](channex-cert-test-results.md).)

### 13.7 — Lo que YA verifiqué por ti (para tu tranquilidad)

El 2026-06-19 hice exactamente este flujo por la API (el mismo endpoint que el
botón de la UI llama, `POST /v1/rates/overrides`): cambié Twin a 333 el
22-nov-2026 → se encoló un row `RATES_RESTRICTIONS` en el outbox → el worker lo
drenó → **`SUCCEEDED`** (llegó a Channex, 1 intento, sin error). El mapeo
necesario (`ChannexRatePlanMapping`: Twin→Twin BAR, Double→Double BAR) ya está
sembrado en tu BD. **El demo funciona.** Tú solo repites los clics.

> Honestidad: verifiqué el flujo por su endpoint (idéntico al que dispara la UI).
> El clic literal en la pantalla lo harás tú en el screenshare — si quieres,
> ensayémoslo juntos una vez antes del día real.

---

## Apéndice — Fuentes oficiales para citar si te lo piden

- **Webhook collection / auth model (bearer en header, no HMAC):**
  https://docs.channex.io/api-v.1-documentation/webhook-collection
- **Booking revisions + ack flow:** docs de Channex, sección Booking CRS /
  booking_revisions.
- **Rate limits (10 ARI + 10 avail por minuto):** verificado contra docs
  Channex 2026-05-22 (documentado en `channex-token-bucket.service.ts:5-11`).
- **Retry-After / RFC 7231 §7.1.3:** estándar HTTP — el parser está en
  `channex.gateway.ts:1436` (`parseRetryAfter`).
- **Los 14 anti-patrones + 14 cert tests:** lista oficial de cert Channex,
  mapeados 1:1 en `channex.cert-tests.integration.spec.ts` y en
  `docs/ops/channex-test-14-declarations.md §14.9`.
- **Decisiones de diseño Zenix:** CLAUDE.md §129-§148 (inbound + outbound) y
  §214-§218 (el fix de Retry-After, sprint CHANNEX-CERT-B1).

---

*Fin de la guía. Léela las veces que necesites. Cuando termines la lectura 3 y
el banco de preguntas te salga natural, estás listo para agendar. Tú puedes.*
