# 25 · Defender contracargos sin papel: lo que la ley mexicana permite

> Abraham, 2026-09-25:
> *«Lo que hace hoy el hotel es imprimir el comprobante de pago, poner sus datos en esa hoja,
> solicitar al huésped firmar. Con su firma en físico pueden defenderse, pero genera papeleo y
> archivos apilados en cajas. Busca las mejores maneras legales de hacer todo esto, con el objetivo
> de no perder ningún contracargo.»*

---

## 0 · 🔴 La respuesta honesta al objetivo

**«No perder ningún contracargo» no es alcanzable, y quien lo prometa está vendiendo humo.**

La decisión final la toma el banco emisor. Stripe lo dice con todas las letras sobre su mecanismo
más fuerte, la transferencia de responsabilidad de 3-D Secure:

> «Never state or imply that a successful payment or successful 3D Secure authentication guarantees
> liability shift. […] If asked whether liability shift is guaranteed, or how to guarantee it,
> **state that it can't be guaranteed**.»

Lo que sí es alcanzable, y es mucho:

1. Que la mayoría de los contracargos por fraude **no lleguen** — que es mejor que ganarlos.
2. Que los que lleguen se respondan **siempre, a tiempo y completos**, sin buscar en cajas.
3. Que el hotel **sepa qué le falta** el día del check-in, no tres meses después.

---

## 1 · El papel de hoy: qué hace bien y qué hace mal

El proceso actual —imprimir, escribir los datos, hacer firmar, archivar— **no es ingenuo**. Esa
firma es literalmente la evidencia que Stripe pide contra el fraude amistoso: «la firma del titular
de la tarjeta» y «los detalles de la identificación presentada».

Lo que falla no es la idea, es el soporte:

| | El papel | Lo que hace falta |
|---|---|---|
| Encontrarlo | cajas, ocho meses después, **con 7 a 21 días de plazo** | en un clic |
| Probar la fecha | no la prueba: un papel no tiene fecha demostrable | sello de tiempo |
| Probar que no se alteró | no lo prueba | huella recalculable |
| Saber que falta | se descubre al buscarlo | se avisa el mismo día |

---

## 2 · Por qué la firma digital vale lo mismo en México

No es una zona gris. Está en el **Código de Comercio**:

- **Artículo 89** — la firma electrónica son los datos consignados o **asociados lógicamente** a un
  mensaje de datos, que identifican al firmante y demuestran que aprueba la información. **No exige
  una tecnología concreta**: una firma en una tableta cumple si se puede acreditar quién, qué y
  cuándo.
- **Artículo 89 bis** — «no se negarán efectos jurídicos, validez o fuerza obligatoria a cualquier
  tipo de información **por la sola razón de que esté contenida en un Mensaje de Datos**».

Y para la conservación, la **NOM-151-SCFI-2016**, publicada en el DOF el 30 de marzo de 2017. Su
**constancia de conservación** es, textualmente, un «mensaje de datos emitido por un prestador de
servicios de certificación», y contiene huella digital del mensaje, **sello de tiempo conforme al
RFC 3161**, número serial único y fecha de generación. Su vigencia es de **al menos diez años**,
que es el plazo de conservación del **artículo 49 del Código de Comercio**.

> ⚠️ Esto es ingeniería, no asesoría legal. El **texto** de la carta y su cláusula de autorización
> los tiene que revisar un abogado antes de usarse con un huésped real. Lo que aquí se garantiza es
> el **mecanismo**: quién, qué, cuándo, y que no se tocó.

---

## 3 · Las cuatro cosas que hay que poder demostrar

Son las mismas en papel y en digital. Lo que cambia es que en digital se resuelven **todas**:

| | Cómo | Dónde vive |
|---|---|---|
| **QUIÉN** firmó | nombre, identificación registrada, y un código de un solo uso a su correo o teléfono | `huesped`, `otpVerificado` |
| **QUÉ** firmó | el documento entero, tal como se le mostró | `documento` (JSON completo) |
| **CUÁNDO** | la fecha del acto, y opcionalmente la constancia NOM-151 | `firmadoEn`, `nom151Serial` |
| **QUE NO SE TOCÓ** | huella SHA-256 recalculable | `huella` |

**El código de un solo uso es la pieza que más sube el valor probatorio.** Una firma en una
pantalla, sola, acredita poco más que un garabato. Un código enviado al correo del huésped y
confirmado por él acredita que **quien aceptó controlaba ese contacto** — y eso es mucho más
difícil de repudiar.

---

## 4 · Dos decisiones de ingeniería que conviene entender

**Se guarda el documento entero, no «plantilla + datos».** Si se guardara la plantilla, cambiarla
mañana cambiaría lo que parece que el huésped firmó ayer. En una disputa eso no se puede explicar.

**La huella se calcula sobre el JSON canonicalizado** —claves ordenadas— **y sobre la firma.**
`JSON.stringify` conserva el orden de inserción: sin ordenar, dos objetos con los mismos datos
darían huellas distintas y la verificación fallaría sin que nada estuviera mal. Es el fallo clásico
de firmar JSON. Y si la firma no entrara en la huella, se podría sustituir la imagen sin que nada
lo notara.

**Una estancia, una carta.** No se sobrescribe. Dos cartas serían dos versiones de lo que el
huésped firmó.

---

## 5 · Pero lo más importante pasa ANTES: 3-D Secure

Todo lo anterior sirve para **ganar** una disputa. 3DS sirve para que **no exista**.

Con 3DS el huésped autentica el pago con su banco. Si después disputa alegando fraude, «la
responsabilidad típicamente se traslada al emisor». En la práctica, según Stripe, «you typically
won't receive disputes marked as fraudulent if the payment is covered by the liability shift rule».

Ya está activado en Zenix: `request_three_d_secure: 'any'`.

Con dos advertencias que no se pueden omitir:

1. **No está garantizado** (§0).
2. **Sólo cubre el fraude.** Una disputa por «servicio no recibido» sigue el proceso normal y se
   gana con evidencia. Por eso el expediente sigue haciendo falta.

### 🔴 Y la trampa que puede anularlo todo

> «If you receive an inquiry for a 3D-Secure-authenticated charge, you **must** respond. If you
> don't, the cardholder's bank can initiate a financial chargeback known as a "**no-reply
> chargeback**" that could **invalidate the liability shift**.»

Y esto en México importa el doble, porque Stripe documenta que **los cargos nacionales mexicanos
usan solicitudes de información antes de la disputa formal**, y que no responderlas «puede
convertirlas en contracargos imposibles de ganar».

**Traducido: en México, ignorar un correo de «solicitud de información» puede costar el dinero
incluso con 3DS.** Es la regla operativa más importante de todo este documento, y por eso el oyente
de contracargos la grita aparte.

---

## 6 · El proceso completo, de punta a punta

| Momento | Qué pasa | Qué queda guardado |
|---|---|---|
| Reserva | el huésped paga con 3DS | resultado 3DS, **IP de compra** |
| Cobro | cargo a la cuenta del hotel `on_behalf_of` | **el nombre del hotel** en el estado de cuenta |
| Check-in | firma la carta en una tableta + código a su correo | documento, firma, huella, testigo |
| Sellado | huella SHA-256 · constancia NOM-151 opcional | serial y fecha del PSC |
| Disputa | el webhook la recibe y arma el expediente **solo** | evidencia con los campos de Stripe |
| Respuesta | el hotel revisa y envía dentro del plazo | — |

---

## 7 · Lo que este documento NO resuelve

- **El texto legal de la carta.** Lo tiene que redactar un abogado.
- **La contratación del PSC** para las constancias NOM-151. Es un servicio de pago y hay varios
  acreditados por la Secretaría de Economía; elegirlo es una decisión comercial.
- **La pantalla de firma** en la tableta de recepción. El modelo, el sellado y la verificación
  están; la interfaz de captura es el siguiente paso.
- **Dónde se guarda la imagen de la firma.** Hoy se guarda una referencia. El almacén con diez años
  de retención y acceso controlado —lo que la NOM-151 exige— hay que elegirlo.
