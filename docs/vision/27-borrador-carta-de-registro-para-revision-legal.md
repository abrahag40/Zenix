# 27 · Borrador de la carta de registro — para revisión legal

> ⚠️ **ESTO ES UN BORRADOR DE INGENIERÍA, NO ASESORÍA LEGAL.** Lo redacté para que cubra lo que
> las redes de tarjetas esperan encontrar en la evidencia de una disputa y lo que la ley mexicana
> exige al recabar datos. **Quién puede obligar a quién, y con qué palabras, lo dice un abogado.**
>
> Este documento existe para que ese abogado tenga algo concreto que corregir en vez de una hoja
> en blanco.

---

## 1 · Qué firma el huésped, y por qué cada línea está ahí

Ninguna cláusula es relleno. Cada una responde a un motivo de disputa concreto de los que las
redes de tarjetas reconocen:

| Cláusula | Contra qué disputa protege |
|---|---|
| Autorización del cargo | «no reconozco el cargo» (`fraudulent`) — la principal |
| Titularidad de la tarjeta | «no era mi tarjeta» |
| Confirmación de datos | evita discutir después sobre fechas o importes |
| Política de cancelación | «cancelé» (`credit_not_processed`) |
| Política de no presentación | el cargo por no-show |
| Consumos adicionales | disputar un cargo posterior al check-in |
| Aviso de privacidad | LFPDPPP: se recogen identificación y firma |
| Entrega de copia | LFPC, y prueba que se fue sabiendo qué firmó |

🔴 Sobre la de cancelación: Stripe pide como evidencia `cancellation_policy` **y** su
*disclosure*. **No basta tener la política: hay que probar que se le enseñó.** Por eso la cláusula
dice «se me informó… antes de firmar» y no sólo enlaza a un documento.

---

## 2 · El texto

> **CARTA DE REGISTRO Y AUTORIZACIÓN DE CARGO**
>
> *[Nombre del hotel] · [RFC] · [domicilio]*
> *Reserva [referencia] · Entrada [fecha] · Salida [fecha] · [n] noche(s)*
> *Huésped: [nombre] · Identificación: [tipo] ••••[4 dígitos]*
> *Total: [importe] [moneda], impuestos incluidos*
>
> 1. Autorizo a **[hotel]** a cargar a mi tarjeta el importe de **[total] [moneda]**,
>    correspondiente al hospedaje descrito en este documento, impuestos incluidos.
> 2. Reconozco que soy el titular de la tarjeta utilizada o que cuento con su autorización expresa
>    para usarla.
> 3. Confirmo que los datos de la reserva y de mi identificación que aparecen en este documento son
>    correctos.
> 4. Se me informó la política de cancelación antes de firmar: *[política]*.
> 5. Se me informó la política de no presentación: *[política]*.
> 6. Acepto que los consumos y servicios adicionales que solicite durante mi estancia se carguen a
>    la misma tarjeta, previa notificación de su importe.
> 7. Se me puso a disposición el aviso de privacidad de **[hotel]**. Entiendo que se recaban mi
>    identificación y mi firma con la finalidad de acreditar el hospedaje y el consentimiento del
>    cargo.
> 8. Se me entregó copia de este documento en formato electrónico.
>
> *Firma del huésped* · *Fecha y hora* · *Recibió: [nombre del recepcionista]*

El texto vive en `apps/api/src/public-booking/recepcion/clausulas.ts`. Cambiarlo ahí cambia lo que
se firma a partir de ese momento — **nunca lo ya firmado**, que se guarda entero y no se regenera.

---

## 3 · Lo que el abogado tiene que decidir

1. **Si la cláusula 6 (consumos adicionales) es exigible en México** tal como está redactada, o
   necesita un tope o una notificación previa por escrito.
2. **Si la cláusula 2 basta** para el caso de quien paga con la tarjeta de otra persona — habitual
   en viajes de empresa y en familias.
3. **Qué decir exactamente sobre el aviso de privacidad** bajo la LFPDPPP del 20-mar-2025 con su
   reforma del 14-nov-2025. 🔴 **Es ley nueva y el regulador cambió.**
4. **Cuánto hay que conservar y dónde.** El artículo 49 del Código de Comercio habla de diez años;
   la LFPDPPP obliga a no conservar datos personales más de lo necesario. Son dos plazos que hay
   que conciliar, y no lo puedo hacer yo.
5. **Si la firma en tableta necesita algo más** para el criterio del hotel — ver §4.

---

## 4 · Qué tan fuerte es esta firma, sin exagerar

El **artículo 97 del Código de Comercio** define cuándo una firma electrónica es «Avanzada o
Fiable». Son cuatro requisitos, y conviene ser honesto sobre cuáles cumplimos:

| Fracción | Exige | ¿Lo cumple? |
|---|---|---|
| I | Los datos de creación corresponden **exclusivamente** al firmante | ⚠️ Un trazo en pantalla, no del todo. **El código de un solo uso lo acerca mucho** |
| II | Estaban bajo su **control exclusivo** al firmar | ⚠️ Ídem |
| III | Se puede detectar cualquier alteración **de la firma** | ✅ El hash de los bytes |
| IV | Se puede detectar cualquier alteración **de la información** | ✅ La huella del documento |

**Conclusión honesta:** sin certificado digital, esto es una **firma electrónica simple**, no
«avanzada». Y eso **no la invalida**: el artículo **1298-A** dice que para valorar la fuerza
probatoria de un mensaje de datos «se estimará primordialmente **la fiabilidad del método** en que
haya sido generada, archivada, comunicada o conservada».

Es decir: **el juez pesa el método**, y el método es exactamente lo que se construyó — huella
recalculable, testigo, contexto, código al contacto del huésped y, si se contrata, constancia de un
tercero acreditado.

🔴 **Y una distinción que importa más de lo que parece: hay dos audiencias.** El banco emisor que
decide un contracargo **no aplica el Código de Comercio mexicano**: aplica las reglas de su red.
Para él, lo que cuenta es la evidencia con los nombres que Stripe pide. El Código importa si el
asunto llega a un juez en México, que es el escenario raro. **Construir para las dos es lo
correcto, pero optimizar para la primera es lo urgente.**

---

## 5 · Los prestadores acreditados, para cerrar los dos ataques abiertos

El análisis de ataque dejó dos agujeros que sólo cierra un tercero: borrar la carta y rehacerla, y
que la fecha la ponga nuestro propio servidor.

La Secretaría de Economía mantiene el **directorio oficial** de Prestadores de Servicios de
Certificación acreditados en [psc.economia.gob.mx/directorio.html](https://psc.economia.gob.mx/directorio.html).
Entre los acreditados para **conservación de mensajes de datos y sello digital de tiempo** aparecen
**Advantage Security**, **ATEB Servicios** y **Cincel**.

Lo que hay que pedirles, en concreto:

- Emisión de **constancia de conservación NOM-151** por documento.
- **Sello de tiempo RFC 3161**.
- Precio **por constancia** y si hay mínimo mensual.
- API, para que Zenix la pida sola al sellar.

Los campos ya están en la base (`nom151Serial`, `nom151En`, `nom151Psc`). Falta el contrato y una
llamada.
