# 23 · ¿Hace falta el booking engine? Y qué falta para cobrar

> Dos preguntas de Abraham del 2026-09-24:
> *«¿Entonces no vamos a usar el booking engine en Azucar? ¿Va a ser directo con la pasarela?»* y
> *«¿Qué falta para que Azucar en dev use Stripe y podamos simular una reserva que se refleje en
> Zenix?»*
>
> Este documento responde las dos, y **corrige una confusión de vocabulario que yo mismo
> introduje**.

---

## 1 · La confusión: «booking engine» son dos cosas distintas

🔴 **Ya estás usando el booking engine.** El calendario del sitio llama a
`GET /api/v1/public/properties/:slug/availability-calendar` — **eso es el motor**. Lo que yo
llamé «página alojada» es sólo **una de sus caras**, no el motor.

| | Qué es | ¿Azucar la usa? |
|---|---|---|
| **El motor** (`public-booking`) | La API: disponibilidad, tarifas con impuestos, crear reserva, guardia anti-sobreventa, idempotencia, webhooks | ✅ **Sí, desde hoy** |
| **La página alojada** (`book.zenix.com/{slug}`) | Una interfaz que sirve Zenix, para el hotel que no quiere tocar su sitio | ❌ No, y no le hace falta |
| **El módulo pegable** (`site/src/zenix/motor/`) | Nuestra interfaz, dentro del sitio del hotel, con su marca | ✅ Es lo que acabamos de construir |

**La respuesta corta:** el motor es obligatorio; la página alojada es opcional y Azucar no la
necesita porque tiene la suya.

---

## 2 · ¿Por qué no hablar directo con la pasarela desde el sitio?

Porque el navegador decidiría **cuánto** se cobra y **a dónde** va el dinero. Está desarrollado en
el [documento 22 §B](22-agotamiento-de-retenciones-y-cuenta-destino.md), y se resume en una línea:

> El `client_secret` **no es un dato, es una capacidad**: ya lleva dentro el importe, la moneda y
> la cuenta destino, fijados por el servidor. El navegador puede **usarlo** y no puede
> **modificarlo**.

**Lo malo no es el JavaScript.** Es que el JavaScript **decida** algo con consecuencias de dinero.
El calendario que acabamos de montar es JavaScript, pide, pinta, y no decide nada — por eso está
bien.

### Lo que el motor aporta y no es fácil de replicar

No es una lista de funciones: es una lista de cosas que **ya fallaron una vez** y ahora están
resueltas en un solo sitio.

| Pieza | Por qué duele replicarla por cada sitio |
|---|---|
| **Guardia anti-sobreventa** | Toma dos familias de cerrojos y vuelve a comprobar bajo transacción, con una restricción de exclusión debajo. La auditoría del 2026-09-22 encontró que faltaba una familia; arreglarlo en cinco sitios es arreglarlo mal en cuatro |
| **Cálculo fiscal** | IVA + ISH en centavos enteros, con catálogo nacional, vigencias y fundamento. Un sitio que lo recalcule acabará mostrando un total distinto al cobrado |
| **Idempotencia** | `(scopeId, Idempotency-Key)` bajo el mismo cerrojo. Sin esto, un doble clic son dos reservas |
| **Inventario compartido** | El mismo dato que ven recepción, las OTAs y el sitio. Es lo que hace que bloquear una habitación en Zenix la retire de la web |
| **Retención con caducidad** | Sin ella, cobrar no es seguro — documento 21 §2.2 |

**El argumento decisivo no es técnico, es de negocio:** ese motor es **lo que se vende**. Un
calendario bonito lo tiene cualquiera; un calendario que no sobrevende porque comparte inventario
con el mostrador y con Booking.com, no.

---

## 3 · Qué falta para simular una reserva de verdad

### 3.1 · 🟢 Primero, la noticia buena: se puede **hoy, sin Stripe**

Para ver una reserva entrar en el calendario de Zenix desde el sitio **no hace falta cobrar nada**.
La política actual es `PAY_AT_HOTEL`, que es un flujo legítimo y completo.

Falta **una sola cosa**: que el botón «Solicitar estas fechas» llame al motor. Hoy sólo rellena el
formulario de correo.

| Paso | Estado |
|---|---|
| Elegir fechas contra inventario real | ✅ |
| `POST /api/v1/public/properties/:slug/reservations` | ✅ existe |
| Que el botón lo llame | ❌ **es lo único que falta** |
| Que aparezca en el calendario de Zenix | ✅ automático — es la misma base |

> **Estimación honesta: una tarde.** Y es lo que yo enseñaría primero, porque una reserva real
> entrando en el calendario impresiona más que una pantalla de pago de prueba.

### 3.2 · Y ahora Stripe: **no hace falta Connect para la demostración**

🔴 **Esto desbloquea el calendario del proyecto y conviene decirlo claro.**

Connect sirve para que el dinero **llegue a la cuenta del hotel**. En **modo de pruebas**, con la
cuenta de ZaharDev, se puede demostrar el flujo entero —autorizar, retener, capturar, confirmar—
**sin Connect y sin mover un peso real**.

O sea: la pregunta de «¿Connect admite entidades mexicanas?» **bloquea la producción, no la
demostración**. Se puede avanzar mientras se resuelve.

### 3.3 · La lista, ordenada por dependencia

| # | Qué falta | Dónde | Coste |
|---|---|---|---|
| **1** | El botón llama al motor y crea la reserva | Sitio | ~1 día |
| **2** | Publicar la propiedad en el Zenix de la nube | `publicar-propiedad.ts` | **minutos** |
| **3** | Claves de Stripe **de prueba** en Zenix | Render · variables | minutos |
| **4** | `POST …/reservations/:ref/pago` → crea el PaymentIntent y devuelve **sólo** el `client_secret` | Zenix | ~1 día |
| **5** | Stripe Elements en el módulo, con el tema del hotel | Sitio | ~1 día |
| **6** | Webhook firmado `payment_intent.succeeded` → confirma la reserva | Zenix | ~1 día |
| **7** | La autorización crea la **retención** (doc 22 §L2) y el **mamparo** (§L4) | Zenix | ~1 día |
| **8** | `paymentPolicy` deja de estar fijado a `PAY_AT_HOTEL` | Zenix | horas |

**Total hasta una reserva pagada en modo de pruebas: unos cinco días de trabajo**, ninguno
bloqueado por Connect.

### 3.4 · 🔴 Lo que NO puede faltar cuando entre el dinero

Tres cosas que no son «mejoras» sino condiciones, y están documentadas:

1. **La confirmación la dispara el webhook, nunca el redirect del navegador.** Si el huésped
   cierra la pestaña, el pago existe y la reserva no.
2. **El mamparo del 20 %** ([doc 22 §A.4 L4](22-agotamiento-de-retenciones-y-cuenta-destino.md)).
   Es el único control que acota el daño aunque el atacante tenga mil direcciones.
3. **El importe y la cuenta destino se fijan en el servidor.** Ya hay
   [13 pruebas adversariales](https://github.com/abrahag40/Zenix/pull/160) que se pondrán rojas
   si alguien añade ese campo al cuerpo.

---

## 4 · Lo que este documento NO pudo verificar

- **Si Stripe Connect admite entidades mexicanas** en la cuenta de ZaharDev. Sigue sin
  comprobarse, y ahora se sabe que **bloquea la producción, no la demostración**.
- **Las estimaciones de días** son juicio, no medición. La única medida real es que el calendario
  —cálculo, cliente, capa visual, tema y pruebas— salió en una sesión.
- **Si el plan gratuito de Render aguanta una demostración con el cliente delante.** Duerme a los
  ~15 minutos y despierta en ~50 segundos; no se ha probado con tráfico real.
