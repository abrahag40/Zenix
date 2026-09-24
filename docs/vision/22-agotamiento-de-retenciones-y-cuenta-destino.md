# 22 · Dos criterios de diseño: agotar retenciones, y dónde vive la cuenta destino

> Nacen de dos preguntas de Abraham del 2026-09-24. Las dos son de diseño, no de implementación,
> y las dos se contestan **antes** de escribir el código que las necesita.
>
> **Estado de la amenaza en A:** 🟢 **no está viva.** Comprobado hoy en `apps/api/src`: **ningún
> camino de código escribe `holdExpiresAt`**. Existen la columna, la política de caducidad y el
> liberador; falta quien cree la retención, y eso llega en H6.5/H6.6. Estos criterios aterrizan
> **antes de que se abra la puerta**, que es la única vez que sale barato.

---

# A · Agotar el inventario con retenciones

## A.1 · La pregunta, en sus términos

> *«¿Qué tal si hay dos personas: la persona A entra pero no compra nada, y la persona B sí tenía
> pensado comprar pero no pudo porque A tenía bloqueada la habitación?»*

No es un caso teórico ni hace falta un atacante. **Es el comportamiento normal de quien compara
precios**, y a escala se convierte en una negación de servicio sin que nadie se lo proponga.

## A.2 · La aritmética, para el hotel piloto

Azucar tiene **24 unidades**. Con la retención de tarjeta de 15 minutos:

| | |
|---|---|
| Coste para quien retiene | **1 petición HTTP** |
| Daño causado | 1 habitación × N noches, invendible 15 min |
| Para bloquear el hotel entero | **24 peticiones** |
| Para mantenerlo bloqueado una hora | ~96 peticiones |
| Límite por IP que ya existe | 60/min — **no lo roza** |

🔴 **Ahí está el problema, y no es «nos falta un límite de peticiones»: es que el coste es
asimétrico.** Retener es gratis para quien retiene y caro para el hotel. Todo control que
funcione tiene que atacar esa asimetría; los que sólo la disimulan —límites por IP, CAPTCHA—
fracasan en cuanto el atacante rota direcciones, y **no ayudan nada** con el caso honesto de la
persona A, que no está atacando.

## A.3 · Cómo lo resuelve la aviación — que lleva décadas con esto

La industria aérea tiene nombre propio para el problema y para la función que lo combate.

**1 · No se retiene durante la compra.** El inventario no se decrementa mientras alguien busca.
La disponibilidad que se ve es un **consejo**; el compromiso ocurre al crear el registro de
reserva (**PNR**) con nombre y contacto — o sea, **cuando hay identidad e intención**, no cuando
hay curiosidad. Es exactamente lo que ADR-0009 §2 ya decide para nosotros.

**2 · Lo retenido caduca solo: *Ticketing Time Limit*.** Un PNR sin emitir lleva fecha límite
(`ADTK`, `ATL` en Amadeus) y **se cancela automáticamente** al vencer. Cathay Pacific lo explica
con el motivo en la mano: los plazos estrictos *«prevent passengers from holding seats and
shopping around»*, y sin ellos aparece *«seat blockage which adversely impacts both customers and
travel agents»* — que es, palabra por palabra, la persona A y la persona B de la pregunta.
([Cathay · Ticket Time Limit FAQ](https://www.cxagents.com/content/dam/cathay-agents/us/documents/agents-resources/Ticket_Time_limit_FAQ.pdf) ·
[Amadeus · Automated Ticketing Limits](https://servicehub.amadeus.com/c/portal/view-solution/808091/automated-ticketing-limits-atl-overview-and-troubleshooting-guide) ·
[GSA · Auto-cancellation rule](https://www.gsa.gov/travel/plan-a-trip/transportation-airfare-rates-pov-rates/airfare-rates-city-pair-program/autocancellation-rule))

> Eso es **exactamente** nuestro `holdExpiresAt` + el liberador. La diferencia es que ellos le
> pusieron nombre hace treinta años y nosotros lo redescubrimos ayer.

**3 · Y hay una función dedicada a cazar al que abusa: *Revenue Integrity*.** American Airlines
la llama **RIPA** (*Revenue Integrity and PNR Automation*). No es un límite de peticiones: es un
sistema que **detecta patrones** —reservas duplicadas, *churning* (crear y recrear para renovar
el plazo), nombres ficticios, segmentos inactivos— y cancela.
([AA · RIPA](https://saleslink.aa.com/en-US/resources/html/ripa-revenue-integrity-pnr-automation.html) ·
[Lufthansa Group · Booking & Ticketing Policy](https://business.lufthansagroup.com/content/dam/b2b/experts/files/LHG_BookingTicketing_Policy.pdf))

🔑 **La lección de fondo:** la aviación no resolvió esto con una defensa, sino aceptando que
**una retención gratuita siempre se abusa** y construyendo tres cosas a la vez: plazo corto,
cancelación automática, y detección de patrones. Nosotros tenemos las dos primeras.

**4 · Y cuando quieren dar una retención larga, la cobran.** Varias aerolíneas venden el «hold»
como producto. Es la forma más honesta de romper la asimetría: si retener vale algo, retener de
más sale caro.

> **Lo que NO pude verificar** y por eso no se afirma: los plazos concretos por aerolínea, ni si
> los precios de los productos de retención pagan el coste real del inventario bloqueado. Lo
> verificado es lo enlazado arriba.

## A.4 · La decisión: seis capas, ordenadas por cuánto suben el coste del atacante

### L1 · No se retiene al mirar — sólo al pagar *(ya decidido en ADR-0009)*
El calendario es un consejo. Mirar no retiene nada. Elimina de golpe el caso más común de la
persona A: el que sólo compara.

### L2 · 🔑 La retención de verdad la crea una **autorización de tarjeta**
Es el control decisivo y es lo que hace la industria hotelera. Stripe lo documenta literalmente:

> *«los hoteles suelen autorizar el pago total antes de que llegue el huésped y, luego, capturan
> el dinero cuando termina la estadía»* — [Stripe · Retener fondos](https://docs.stripe.com/payments/place-a-hold-on-a-payment-method)

Con `capture_method: manual` se **autoriza sin cobrar**: los fondos quedan retenidos en la
tarjeta del huésped (7 días para tarjeta en línea; Visa 5 en transacción iniciada por el
comercio) y se capturan o se liberan cancelando el PaymentIntent.

**Lo que esto cambia para el atacante:** cada retención le cuesta **una tarjeta válida y una
autorización real**. Y nos da algo que el atacante no puede rotar barato —la **huella de la
tarjeta**— para bloquearlo. El coste deja de ser asimétrico.

**La secuencia queda así:**

```
  elegir fechas ──► (sin retener)
  meter tarjeta ──► autorizar (manual capture) ──► ✅ auth
                                                    │
                        AQUÍ se crea la retención ──┘  ← segundos, no minutos
                        cerrojo + recomprobar disponibilidad
                                                    │
                    ¿ya no hay? ──► anular la autorización · nadie pagó nada
                    ¿sí hay?    ──► capturar ──► reserva firme
```

> 🔴 **Esto invierte el orden que escribí en el documento 21** («crear retenido → pagar →
> confirmar»). Aquel orden es correcto contra la carrera entre dos compradores honestos, y
> **malo** contra el agotamiento: regala retenciones gratis. Se corrige aquí.
>
> La anulación tras una autorización correcta es una **transacción compensatoria** del patrón
> *Saga* (Garcia-Molina & Salem, 1987): no se puede deshacer dentro de una transacción de base de
> datos porque el dinero vive en otro sistema, así que se deshace con una operación inversa
> explícita. Anular una autorización en Stripe es inmediato y gratuito.

### L3 · Una retención «de tecleo» corta, con cuota estricta
Entre elegir fechas y terminar de escribir la tarjeta pasan uno o dos minutos, y perder la
habitación ahí es una experiencia horrible. Se concede una retención breve —**2 a 3 minutos**—
pero con freno: **una sola activa por actor**, y renovarla exige avanzar en el pago.

### L4 · 🔑 El mamparo: un tope de inventario retenido por propiedad
El control que **acota el daño pase lo que pase**, incluso con mil IPs distintas:

> **Como máximo el 20 % del inventario de una propiedad puede estar retenido a la vez por
> tráfico no autenticado.** Pasado ese punto, una petición de retención se **rechaza con
> cortesía** —«vuelve a intentarlo en un momento»— en vez de concederse.

Es el patrón **bulkhead** (Michael Nygard, *Release It!*): se parte el recurso para que un
consumidor no pueda vaciarlo. Sacrifica al huésped 21 para salvar a los huéspedes 1–20 y, sobre
todo, para que el hotel **siempre tenga algo que vender**.

**Antipatrón evitado:** confiar en el límite por IP. Es el control que todo el mundo pone primero
y el único que un atacante evita gratis.

### L5 · Fricción progresiva
Al actor que ya abandonó una retención se le deja de conceder la de tecleo: pasa directo a tener
que autorizar. Sin CAPTCHA y sin castigar a nadie por su primera vez.

### L6 · Observabilidad: la proporción retención → captura
Un ataque tiene una firma inconfundible: **muchas retenciones, cero capturas**. Se vigila esa
proporción por propiedad y se avisa cuando se desploma. Es nuestra versión modesta de
*Revenue Integrity* — sin ella, los cinco controles de arriba funcionan y **nadie se entera de si
están funcionando**.

## A.5 · Lo que NO vamos a hacer, y por qué

| | Por qué no |
|---|---|
| **CAPTCHA antes de retener** | Castiga al 100 % de los huéspedes honestos para molestar al 1 % que lo resuelve con un servicio de 1 USD el millar. Y no hace nada contra la persona A, que es humana y sólo estaba comparando |
| **Exigir cuenta para reservar** | Es el mayor abandono conocido en comercio electrónico. Pagaríamos en ventas perdidas mucho más de lo que cuesta el abuso |
| **Sobreventa deliberada** | La aviación la usa con estadística de no-presentados. Es una **decisión de negocio del hotel**, no nuestra, y con 24 unidades el error absoluto es pequeño pero el relativo es enorme: una sobreventa sobre 24 es el 4 % de tu inventario y un huésped en la calle |
| **Alargar el plazo «por si acaso»** | Es la dirección equivocada: cada minuto extra multiplica el daño de A.2 |

---

# B · Dónde vive la cuenta destino del pago

## B.1 · La propuesta, y qué parte de ella es correcta

> *«Zenix manda el dato de la cuenta destino al website, el website lo guarda internamente (como
> Redux), y al reservar se lo mandamos a la pasarela… ese dato no es información delicada; si lo
> fuera, lo encriptamos.»*

**Lo correcto de la intuición:** pedir una vez y reutilizar es la decisión acertada para todo lo
que sea **presentación** — el nombre del hotel, su logotipo, sus colores, la moneda que muestra.
Eso es exactamente lo que ya hace `BookingEngineConfig`, y está bien.

**Dónde se rompe:** la cuenta destino **no es presentación. Es una instrucción sobre a dónde va
el dinero.**

## B.2 · El problema no es la confidencialidad: es la integridad

El razonamiento «no es sensible, y si lo fuera lo encriptamos» resuelve **quién puede leerlo**.
El riesgo aquí es otro: **quién puede cambiarlo.**

Si el navegador sostiene la cuenta destino y se la pasa a la pasarela, entonces **quien controle
el navegador controla a dónde va el dinero**. Abrir las herramientas de desarrollo y cambiar un
valor en Redux no requiere ser nadie especial.

🔴 **Y cifrarlo no ayuda**, porque el cliente tiene que poder usarlo: hay que darle también la
forma de descifrarlo. Un secreto que el atacante puede descifrar porque está en su propia máquina
no es un secreto. Peor: el atacante **no necesita leerlo, necesita sustituirlo** — y un valor
cifrado se sustituye igual de fácil por otro valor cifrado que él mismo genere.

Esto tiene nombre desde 1988: el **problema del diputado confundido** (Norm Hardy). Un componente
con autoridad —nuestro servidor, que puede mover dinero— recibe de un tercero sin autoridad —el
navegador— **el nombre del objeto sobre el que actuar**, y ejecuta con su propia autoridad. En la
clasificación de OWASP es *A01: Broken Access Control*, en su forma más directa.

## B.3 · La respuesta de Stripe: el cliente nunca ve la cuenta destino

No hay que diseñar nada: Stripe ya resolvió esto, y su propio diagrama de flujo dice
literalmente

> `[Servidor] -- Devolver client_secret del PaymentIntent --> [Cliente]`
> — [Stripe · Cargos a un destino](https://docs.stripe.com/connect/destination-charges)

**En el servidor**, al crear el PaymentIntent:

```bash
-d amount=719950 \
-d currency=mxn \
-d application_fee_amount=123 \
-d "transfer_data[destination]={{CUENTA_CONECTADA}}"
# y `on_behalf_of` cuando la plataforma y la cuenta están en regiones distintas
```

**Al navegador** se le devuelve **una sola cosa**: el `client_secret`.

## B.4 · Por qué eso es mejor que cualquier cosa que guardemos nosotros

El `client_secret` **no es un dato: es una capacidad**. Ya lleva dentro, fijados por el servidor
y firmados por Stripe, el **importe**, la **moneda** y el **destino**. El navegador puede
*usarlo* para confirmar ese pago concreto, y **no puede modificar nada de lo que lleva dentro**.

Es *seguridad basada en capacidades* (Dennis & Van Horn, 1966; Mark Miller, *Robust Composition*,
2006), y su regla práctica cabe en una línea:

> **No le pases al cliente el nombre de lo que debe hacerse. Pásale un permiso para hacer
> exactamente una cosa.**

**Corolario que vale la pena decir aparte: el importe tampoco puede venir del cliente.** Por la
misma razón exacta. Si el navegador manda «son $7 199.50», manda «son $1.00». El importe lo
calcula el servidor con el mismo cálculo fiscal que ya existe, y viaja dentro del
`client_secret`.

## B.5 · Entonces, ¿qué sí guarda el sitio?

| Dato | ¿En el cliente? | Por qué |
|---|---|---|
| Logotipo, colores, nombre, tipografía | ✅ Sí | Presentación. Si alguien los cambia en su propio navegador, se estropea su vista y nada más |
| Moneda de exhibición | ✅ Sí, para pintar | Pero el cobro usa la del servidor |
| `slug` de la propiedad | ✅ Sí | Es público por definición: va en la URL |
| **Cuenta destino** | ❌ **Nunca** | Es una instrucción sobre el dinero |
| **Importe a cobrar** | ❌ **Nunca** como fuente | Se muestra, no se obedece |
| `client_secret` | ✅ Sí, y sólo eso | Es una capacidad de un solo uso, atada a un pago |

**Y sobre Redux en concreto:** es una herramienta excelente para el estado de la interfaz, y el
problema no es Redux. El problema sería el mismo con `useState`, con una cookie o con
`localStorage`. La línea no está entre tecnologías de almacenamiento: está entre **presentación y
autoridad**.

---

## Qué se implementa y cuándo

| Capa | Dónde |
|---|---|
| L1 · no retener al mirar | ✅ ADR-0009 §2 |
| `holdExpiresAt` + caducidad por medio de pago + liberador | ✅ [Zenix#156](https://github.com/abrahag40/Zenix/pull/156) |
| L2 · la autorización crea la retención · L3 · retención de tecleo · L4 · **mamparo** | **H6.6**, con el cobro |
| L5 · fricción progresiva · L6 · proporción retención→captura | **H6.6**, misma historia |
| B · cuenta destino sólo en el servidor, `client_secret` al cliente | **H6.6** |

🔴 **El mamparo (L4) es el único que no puede quedarse fuera de H6.6.** Los demás suben el coste
del atacante; **ése acota el daño pase lo que pase**, y es el que salva al hotel de amanecer sin
nada que vender.
