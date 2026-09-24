# 24 · Pasarelas de pago: el puerto, y lo que Banorte obliga a cambiar

> Dos preguntas de Abraham del 2026-09-24:
> *«La función de modificación de precios es ajena a la plataforma de pago, ¿correcto?»* y
> *«¿Deberíamos tener pre-desarrolladas conexiones con diferentes plataformas? Zenix va a usar
> siempre Stripe, pero Azucar probablemente pida Banorte.»*
>
> La primera tiene respuesta corta y comprobada. La segunda destapó un defecto de diseño.
>
> 🔴 **Y una tercera del 2026-09-25 obligó a corregir este documento:** *«la idea es usar la
> plataforma de pago de Banorte pero con la finalidad de automatizar… sin la dependencia de un
> humano»*. La primera versión se apoyaba demasiado en Liga de Pago, que es justo la que necesita
> una persona. Ver §7.

---

## 1 · Sí: el precio no sabe quién cobra — medido

```
apps/api/src/pms/room-types/*.ts                      → 0 menciones de Stripe
apps/api/src/pms/rates/rates.service.ts               → 0
apps/api/src/public-booking/public-pricing.service.ts → 0
apps/api/src/public-booking/public-booking.service.ts → 0
```

Stripe vive en `billing/` —la suscripción del hotel a ZaharDev— y en `public-booking/pago/`. La
cadena precio → impuestos → total → cotización no lo toca.

**Pero eso era un hecho, no una garantía.** Nada impedía que el próximo cambio metiera un
`import` de Stripe en el cálculo fiscal «ya que está ahí». Ahora hay una función de aptitud
—`precio-sin-pasarela.spec.ts`— que lo afirma sobre el código real, con su mordida.

La regla, en una línea: **el precio se calcula igual lo cobre quien lo cobre.**

---

## 2 · 🔴 El defecto: `clientSecret` no era una abstracción

La primera versión del cobro devolvía un `clientSecret` y poco más. Eso **es la forma de Stripe**,
no un puerto. Al investigar Banorte quedó claro por qué importa.

### Lo que dice la documentación oficial de Banorte

| Hecho | Fuente |
|---|---|
| Su portal de desarrolladores expone **una sola API pública: «API ATM»**, para localizar cajeros. **No hay API de pagos autoservicio ni sandbox público** | [developers.banorte.com/es/apis](https://developers.banorte.com/es/apis) |
| Sus productos de cobro: «Terminal Punto de Venta, Terminal Personal Banorte, Interredes, **Comercio Electrónico**, **Ventana de Comercio Electrónico**, **Cargos Periódicos**, **Liga de Pago**, MO-TO y CAT» | [Guía de meses sin intereses](https://www.banorte.com/cms/banorte/pdf/guia-meses-sin-intereses.pdf) |
| **Liga de Pago**: «No requiere de desarrollos web, ya que se provee de una plataforma directa». 3D Secure «operado por Visa Inc.» | [Liga de Pago](https://www.banorte.com/wps/portal/empresas/Home/circulo-pyme/soluciones-de-cobro/productos-adquirente/liga-de-pago) |
| **Comercio Electrónico** corre sobre el motor **Payworks**; la integración es un formulario por **POST a `https://eps.banorte.com/recibo`** | Manuales de integración de Payworks |
| Alta: RFC, alta en Hacienda, comprobante de domicilio, identificación del representante legal, acta constitutiva, contrato de afiliación, **cuenta de cheques Banorte** y certificado SSL | [Centro de ayuda para comercios](https://www.banorte.com/Empresas/Centro-de-ayuda/Comercios/Informacion-general.html) |
| El módulo abierto de Magento requiere **certificación con Banorte antes de producción** | [sixplus1/banorte-magento2](https://github.com/sixplus1/banorte-magento2) |

### Son tres arquitecturas, no tres proveedores

| | Stripe | Payworks | Liga de Pago |
|---|---|---|---|
| **Forma** | capacidad al navegador | redirección con formulario | enlace que crea una persona |
| **Confirmación** | webhook firmado | retorno del navegador | nadie avisa |
| **¿Hay API?** | sí | sí, de formulario | **no** |

Un puerto que sólo sepa decir «aquí tienes un secreto» no admite ninguna de las otras dos.

---

## 3 · El puerto, y las dos cosas que ninguna pasarela puede saltarse

`pago/pasarelas/pasarela.ts` define `InstruccionDeCobro` con tres formas —`elementos-incrustados`,
`redirigir`, `enlace-externo`— y un `ModoDeConfirmacion` explícito.

**Primera regla: el importe y el destino los fija el servidor.**

- Stripe lo cumple porque el `client_secret` los lleva dentro y el navegador no puede editarlos
  —es una *capacidad*, no un dato (Dennis & Van Horn, 1966)—.
- Payworks lo cumple **sólo con la variante cifrada**. Un formulario en claro con el importe en un
  campo oculto es un importe que el navegador edita con dos clics. Por eso `Redirigir` lleva
  `firmado`, y por eso el motor **se niega** a devolver una instrucción con `firmado: false`. Hay
  una prueba de eso **antes** de que exista el adaptador.
- Una liga hecha a mano lo cumple por construcción: el importe lo tecleó una persona.

**Segunda regla: el retorno del navegador no es una confirmación.** Lo controla el navegador. Una
pasarela que sólo ofrezca retorno obliga a **consultar el estado** contra el banco antes de dar
nada por pagado. Por eso el puerto declara `confirmacion` — para que la diferencia esté escrita y
no se descubra en producción.

---

## 4 · Qué falta para Banorte, y qué NO se ha hecho

El adaptador existe, implementa el puerto y **lanza `ServiceUnavailableException`**. No está
fingido a propósito: rellenarlo a ojo produciría código que parece listo, pasa las pruebas contra
dobles escritos por mí, y falla el día de la certificación.

Falta, y no se puede adivinar:

1. **El manual oficial de integración.** Circulan copias en agregadores; no se usan. Un manual de
   pagos desactualizado lo estará justo en el campo que importa, y el campo que importa es el del
   importe.
2. **El algoritmo y la clave de la variante cifrada.** No está publicado.
3. **Si existe aviso servidor-a-servidor.** Mientras no se confirme, el adaptador declara
   `retorno-del-navegador` y el motor está obligado a consultar el estado.

---

## 5 · La recomendación, que puede ahorrar meses

**Empezar por Liga de Pago, no por Payworks.**

No requiere desarrollo: el hotel genera la liga en su consola y se la manda al huésped. Encaja con
`enlace-externo` y **con lo que ADR-0003 ya decidió para Azucar** —enlace de pago del hotel, sin
tocar datos de tarjeta, fuera del alcance de PCI-DSS—.

Es más lento para el huésped y no concilia solo. A cambio se puede tener funcionando en días, sin
certificación bancaria y sin que ZaharDev toque un dato de tarjeta. Payworks se deja para cuando
el volumen lo justifique.

---

## 6 · Lo que este documento NO pudo verificar

- **El manual técnico de Payworks desde una fuente oficial de Banorte.** Lo publicado por el banco
  describe el producto comercialmente; la especificación llega al contratar.
- **Si Banorte ofrece hoy algo más moderno** que Payworks para comercios nuevos. Su portal de
  desarrolladores no lo menciona, pero un portal incompleto no es una negación.
- **Las comisiones.** Banorte dice «tasa de descuento por tipo de tarjeta… puede variar
  dependiendo por giro, ticket y facturación promedio mensual». No hay tarifa pública comparable
  con la de Stripe.


---

## 7 · 🔴 Corrección: sí se puede automatizar, y no era como lo conté

La primera versión de este documento recomendaba **Liga de Pago** como camino rápido. Era una
recomendación coherente con ADR-0003 pero **respondía a otra pregunta**: Abraham no quiere «cobrar
pronto», quiere **cobrar sin que nadie teclee nada**. Y Liga de Pago es precisamente el producto
que exige una persona.

### Lo que sí automatiza, y lo que cuesta

**Comercio Electrónico (Payworks) sí es automatizable.** Es una integración de software: el
servidor arma el cobro y el huésped paga sin que nadie del hotel intervenga. Banorte lo describe
como un motor donde las transacciones «son aceptadas o rechazadas inmediatamente».

Lo que **no** es, y por eso no se puede tener «hoy mismo»:

| | |
|---|---|
| Afiliación por hotel | contrato, RFC, acta constitutiva, **cuenta de cheques Banorte** |
| **Certificación con el banco** antes de producción | lo exige el propio módulo abierto de Magento |
| **Sin sandbox público** | el portal de desarrolladores sólo publica «API ATM» |

Semanas o meses, y el reloj no lo controlamos nosotros: lo controla el banco.

### 🔴 Y el problema de fondo: Banorte no sabe repartir

Aquí está lo que de verdad decide. Payworks **deposita íntegro en la cuenta del comercio**. No hay
ninguna forma documentada de que un tercero —ZaharDev— retenga una comisión dentro de la misma
transacción.

O sea: con Banorte, la comisión de ZaharDev **hay que facturarla aparte** y cobrarla por fuera.
Eso no es un detalle contable: es la diferencia entre un producto que se cobra solo y uno que
exige perseguir a cada hotel todos los meses.

---

## 8 · Lo que la investigación corrigió sobre Stripe — y cambia la recomendación

Iba a escribir que Stripe Connect no sirve para pagar a hoteles mexicanos, porque eso es lo que
afirma más de un artículo. **Lo comprobé contra el endpoint de datos de la propia documentación de
Stripe y es falso.**

```
get-platform-countries                        → 57 países, MX incluido
get-requirement-selections-for-platform-country?platformCountry=MX
  → country_map.MX.capabilities:
       card_payments · transfers · oxxo_payments · link_payments …
```

`transfers` es exactamente la capacidad que permite que el dinero llegue a la cuenta del hotel.

**Con eso, el modelo que Abraham pide funciona hoy:**

1. El huésped paga en el sitio del hotel.
2. El cargo es un *destination charge*: los fondos van a la cuenta de Stripe **del hotel**.
3. `application_fee_amount` retiene la comisión de ZaharDev **en la misma transacción**.
4. La comisión del banco la descuenta Stripe.
5. Nadie teclea nada.

Y ZaharDev **no es custodio de dinero ajeno**, que es una propiedad que conviene no perder: el
dinero del huésped nunca pasa por una cuenta nuestra.

### Lo que NO está verificado, y hay que preguntar

- **Las comisiones exactas** de Stripe en México para este modelo.
- **Si el hotel puede abrir su cuenta conectada** con sus documentos (RFC, acta constitutiva). Es
  muy probable, pero es una cuenta financiera y el alta la resuelve Stripe, no nosotros.
- **Los plazos de depósito** al hotel.

---

## 9 · La recomendación, corregida

**Para Azucar y para todo hotel nuevo: Stripe Connect.** Cumple las cuatro condiciones —automático,
el dinero al hotel, comisión de ZaharDev retenida sola, sin humano— y funciona hoy.

**Banorte sigue siendo un módulo aparte, pre-fabricado, para el hotel que lo pida.** La
arquitectura ya lo permite: una columna en la base decide quién cobra, y Stripe es el valor por
omisión. Pero conviene decirle al cliente lo que compra:

> Con Banorte el cobro se automatiza igual, pero tarda semanas de trámite bancario, no tiene
> entorno de pruebas, y **la comisión de ZaharDev hay que facturarla aparte** porque el banco
> deposita íntegro. Con Stripe funciona hoy y se reparte solo.

Si aun así el hotel prefiere su banco —por relación, por tasa negociada, o porque ya lo tiene
contratado— el módulo está preparado para recibirlo sin tocar nada de lo demás.


---

## 10 · Contracargos: el argumento del cliente, analizado

> *«Si un huésped mete un contracargo, en Stripe no aparece el nombre del hotel, aparece Stripe.»*

**Tenía razón sobre mi código, y se arregla con un parámetro.**

### Qué es un contracargo, en una línea

El huésped llama a su banco y dice que ese cargo no debería estar. El banco **le devuelve el dinero
de inmediato**, se lo quita al hotel, **y encima le cobra una comisión por disputa**. El hotel se
entera cuando ya se lo sacaron.

### El caso que el cliente describe tiene nombre

Se llama **fraude amistoso** (*friendly fraud*, o *first-party misuse* en las reglas de las redes):
el huésped se hospeda, todo va bien, y semanas después disputa alegando que no reconoce el cargo.
Es el más común en hotelería, precisamente porque el servicio ya se prestó y no queda un paquete
que rastrear.

### El descriptor: el cliente tiene razón, y es un parámetro

Stripe lo documenta literalmente:

> «En el extracto del cliente se utiliza el componente estático de **la cuenta conectada**» para
> *cargos Direct* y *cargos a un destino **con `on_behalf_of`***.

Mi implementación hacía cargo a destino **sin** `on_behalf_of` → habría salido ZaharDev. Corregido:
ahora sale **el nombre del hotel**, y el hotel queda como comercio de registro.

No es cosmético. La propia guía de prevención de Stripe abre con: «verifica que la descripción del
cargo sea **fácilmente reconocible** para tus clientes y refleje el nombre de la empresa que ellos
asociarían con su compra».

### Los plazos, que son lo que de verdad pierde casos

| Hecho | Consecuencia |
|---|---|
| El huésped tiene ~120 días… | …**y en servicios futuros el plazo empieza en la FECHA DE LA ESTANCIA, no en la del pago** |
| El hotel tiene **7 a 21 días** para responder | quien empieza a buscar papeles cuando llega el aviso, ya perdió |
| **Sólo hay UNA oportunidad** de responder | no se puede corregir ni añadir después |
| El emisor tarda 60–75 días en decidir | el ciclo completo son dos o tres meses |

### 🔴 Tres cosas que favorecen a México, y que nadie suele saber

De la documentación de Stripe, literales:

1. «Los cargos nacionales de México que se disputan entre marcas de tarjetas usan **las solicitudes
   de información** antes de crear una disputa formal. Si no se responden, algunas disputas pueden
   convertirse en **contracargos imposibles de ganar**.» → Hay una fase previa donde el caso se
   resuelve **sin comisión**.
2. «Para las empresas en México, **es posible que se devuelva la comisión por disputa** si esta se
   resuelve a tu favor o si el titular de la tarjeta retira la disputa.»
3. «La **comisión de impugnación** de disputas **no se aplica** a las empresas de México y Japón.»

O sea: en México, defenderse sale más barato que en casi cualquier otro sitio.

---

## 11 · Lo que se construyó en Zenix

### El expediente de contracargo

Zenix ya guardaba casi toda la evidencia que Stripe pide para un **servicio fuera de línea** —que
es lo que es una estancia—: nombre, correo, **tipo y número de identificación**, check-in y
check-out reales, y quién los confirmó. Faltaban dos, y se añadieron:

- **`purchase_ip`** — la IP desde la que se reservó (`customer_purchase_ip`).
- **`checkin_signature_url`** — 🔴 **la pieza que gana el caso del fraude amistoso.** Stripe pide
  «la firma del titular de la tarjeta» y «los detalles de la identificación presentada». La
  identificación ya estaba; la firma no.

`ExpedienteDeContracargoService` arma la evidencia con **los nombres exactos de la API de Stripe**
—traducirlos al español haría que Stripe los ignorara en silencio— y, sobre todo, **declara lo que
falta**. Un expediente que sólo enseña lo que hay es un informe; lo que le sirve al hotel es saber
que no tiene la firma, y saberlo cuando aún puede pedirla.

> Una prueba encontró un defecto propio: el marcador daba **100 % sin la firma**, porque los datos
> del documento rellenaban el mismo campo. Stripe las lista como dos evidencias distintas y la
> firma es la fuerte. Un marcador que dice 100 % cuando falta la pieza que gana el caso es peor que
> no tener marcador.

### El aviso automático

El webhook atiende `charge.dispute.created`, `updated` y `closed`, y publica el hecho. Un oyente
arma el expediente **en el acto** y grita en el registro con el plazo. Si es una **solicitud de
información**, lo dice explícitamente — porque en México es la fase previa habitual y responderla
evita la comisión y que escale a un caso imposible de ganar.

---

## 12 · Y el argumento de la comisión más barata

Es el argumento fuerte del cliente y **no se lo puede rebatir sin datos**: Banorte negocia tasa por
giro, ticket y facturación, y un hotel con volumen puede conseguir mejor precio que la tarifa de
lista de Stripe.

Lo que sí se puede poner al lado, para que la decisión sea informada:

| | Stripe Connect | Banorte Payworks |
|---|---|---|
| Nombre en el estado de cuenta | el del hotel (con `on_behalf_of`) | el del hotel |
| Comisión de ZaharDev | **retenida sola** | **se factura aparte** |
| Puesta en marcha | días | semanas o meses, con certificación |
| Entorno de pruebas | sí | **no publicado** |
| Expediente de contracargo | **automático, ya construido** | habría que rehacerlo contra su proceso |
| Defensa de disputas | API y plazos documentados | por el portal del banco |

🔴 **Lo que NO está medido:** la tasa concreta que Banorte le ofrecería a este hotel. Sin ese número
la comparación de comisiones es una opinión. Pedirlo por escrito es el siguiente paso, y hasta
tenerlo esta tabla no decide nada por sí sola.
