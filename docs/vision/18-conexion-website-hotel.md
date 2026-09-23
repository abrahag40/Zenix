# 18 · Conectar Zenix al sitio de un hotel — propuesta de ingeniería

> **El objetivo, sin adornos.** Un hotel nos da las credenciales de donde está alojado su sitio.
> En **una sesión de trabajo** lo conectamos a Zenix: desde ese momento, cambiar una tarifa en
> Zenix cambia el precio que se ve en su web, y el huésped puede reservar sin pasar por una OTA.
>
> **Esto es el desarrollo prioritario** — M5 y M5-bis del [plan vigente](17-puertos-abiertos-y-plan-piloto.md).
> Este documento es su diseño.
>
> **Base:** [`docs/sprints/BOOKING-ENGINE-plan.md`](../sprints/BOOKING-ENGINE-plan.md), que ya
> definió la estrategia de tres niveles copiada de Cloudbeds/Mews/Stripe, más la auditoría
> multi-sombrero del 2026-09-22, que midió qué hay construido de verdad.

---

## 1 · El hallazgo que reordena el trabajo

El plan del booking engine estimaba «5-6 semanas, falta el 30 %». **De sus seis piezas faltantes,
cinco están construidas:**

| El plan decía que faltaba | Estado medido 2026-09-22 |
|---|---|
| Módulo `public-booking/` con endpoints REST | ✅ **2 195 líneas, 18 archivos, 8 endpoints** |
| Modelo `BookingApiKey` | ✅ estilo Stripe, bcrypt en reposo, revocación acotada a la propiedad |
| Modelo `WebhookSubscription` | ✅ HMAC-SHA256, backoff `[1,5,30,300,1800]s`, *dead-letter* |
| CORS dinámico por dominio | ✅ `allowedOrigins` por llave, más CORS abierto en el prefijo público |
| **Hosted UI (`apps/booking-page/`)** | ❌ **no existe** |
| OpenAPI + llaves de sandbox | 🟡 Swagger en `/api/docs`; sin spec versionado ni sandbox |

🔑 **El hueco no es construir el módulo. Es que el módulo publica el número equivocado:**

- **No llama al `rate-resolver`.** Devuelve `RoomType.baseRate` plano — 0 usos medidos del
  resolutor desde el módulo público. Temporadas, día de semana y *overrides* no salen por el puerto.
- **No hay endpoint que ESCRIBA `baseRate`.** El único número que publica no se puede cambiar
  desde el producto.
- **Cero referencias a impuestos** en sus 2 195 líneas, en un estado con dos bases distintas.
- **Publica un campo llamado `totalRate` que NO es el total que paga el huésped.**

---

## 2 · La decomposición que desbloquea el trabajo

El error de encuadre sería tratar esto como un problema. **Son dos, con requisitos opuestos**, y
conflarlos es lo que hace que parezca de seis semanas:

| | **Mostrar el precio** | **Tomar la reserva** |
|---|---|---|
| Lo consume | Google y el visitante | El huésped que ya decidió |
| Frescura exigida | Minutos. Puede ir cacheado | **Tiempo real, sin excepción** |
| Dónde tiene que estar | **En el HTML**, o Google no lo indexa | Puede vivir en otro dominio |
| Si falla | Se degrada a «consultar disponibilidad» | **Se aborta. Nunca se confirma a ciegas** |
| Atomicidad | Ninguna | **Transaccional, bajo cerrojo** |
| Vehículo | **Sobre de tarifas + render en servidor** | **Página alojada (ZBP)** o API (ZBA) |

**Cloudbeds tampoco los confla:** el precio en el sitio del hotel va cacheado y la reserva salta a
`hotels.cloudbeds.com/reservation/{id}`. Copiamos el patrón por la misma razón por la que existe.

> **Consecuencia práctica: la mitad de «mostrar» se puede entregar sin construir la página alojada,
> y es la mitad que da el SEO y el argumento comercial contra la comisión de OTA.**

---

## 3 · La restricción que manda: hosting compartido

Decisión del dueño, 2026-09-23: **la mayoría de los hoteles estará en cPanel sobre Apache** —
HostGator, GoDaddy, Hostinger. De ahí salen dos hechos comprobados en el piloto:

| Hecho | Consecuencia de ingeniería |
|---|---|
| **Hay PHP y NO hay Node** | El sitio **no se puede reconstruir en su propio servidor**. Cualquier vía con `build` exige una máquina externa |
| **No hay *deploy hooks*, ni funciones de borde, ni caché programable** | El disparador no puede ser «webhook que lanza un build» en el caso mayoritario |

**Y una tercera, que es la que decide el diseño del conector:** lo que se instala en el servidor
del hotel tiene que ser **instalable por una sesión de trabajo con credenciales de FTP/SSH, en
minutos, sin dependencias y sin tocar lo que ya funciona.**

---

## 4 · El contrato: el «sobre de tarifas»

Un documento por propiedad, **versionado, firmado y con caducidad explícita**.

```jsonc
{
  "schemaVersion": 1,                    // rompe compatibilidad sólo al subir de entero
  "envelopeId": "01JR8…",                // monótono; sirve de clave de idempotencia
  "issuedAt": "2026-09-23T04:12:00Z",
  "validUntil": "2026-09-24T04:12:00Z",  // 🔴 pasado esto el sitio NO publica precio
  "propertyId": "…", "propertySlug": "…",
  "currency": "MXN",
  "taxPolicy": {                          // las tasas viajan, no se cablean en el sitio
    "displayMode": "TAX_INCLUSIVE",
    "lines": [ { "code": "IVA", "rate": 0.16, "base": "ROOM" },
               { "code": "ISH", "rate": 0.05, "base": "ROOM" } ]
  },
  "roomTypes": [{
    "id": "…", "code": "BUNGALOW_MAR", "name": "Bungalow Mar",
    "maxOccupancy": 2,
    "from": { "net": 286885, "taxes": 63114, "total": 350000 },  // 🔴 enteros, en centavos
    "calendar": [ { "date": "2026-12-20", "net": 320000, "total": 390400, "available": true,
                    "minStay": 2 } ]
  }],
  "bookingUrl": "https://book.zenix.com/{slug}"   // adónde manda el botón
}
```

**Cinco decisiones, cada una con su porqué:**

1. **Enteros en centavos, nunca decimales.** El dinero en coma flotante es un defecto esperando
   fecha. *(La auditoría ya marcó los tipos monetarios del esquema como hallazgo del sombrero A7.)*
2. **El total viaja calculado, no se calcula en el sitio.** Si el sitio calcula impuestos, cada
   hotel acaba con su propia aritmética y la regla «el total incluye impuestos» deja de tener un
   solo dueño. **Zenix es la fuente de verdad del precio, incluida su fiscalidad.**
3. **`validUntil` es obligatorio y el sitio lo respeta.** Un precio caducado no se publica.
4. **`from` y `calendar` separados.** `from` es lo que va en la ficha y en el marcado; `calendar`
   es opcional y sólo para sitios que pinten disponibilidad. Un sobre sin `calendar` sigue siendo
   válido — es la degradación por diseño.
5. **`bookingUrl` viaja en el sobre.** El sitio no cablea a dónde manda el botón: lo dice Zenix.
   Así el mismo sitio sirve si mañana el hotel pasa de página alojada a widget.

### La firma

**HMAC-SHA256 sobre `envelopeId.issuedAt.cuerpoCrudo`**, en la cabecera `X-Zenix-Signature`, con
**tolerancia temporal de 5 minutos** — el esquema de Stripe y de Standard Webhooks.

🔴 **Lo que hoy falta en Zenix y hay que arreglar aquí:** su firma de webhooks **no lleva marca de
tiempo**, así que **no protege contra el reenvío de una entrega capturada**. Este sobre no repite
ese error.

---

## 5 · El conector, del lado del hotel

**Dos archivos PHP, sin dependencias, sin composer, sin base de datos.**

### `zenix-receptor.php` — recibe el sobre

```
POST /zenix-receptor.php
  ← valida firma HMAC con comparación en tiempo constante (hash_equals)
  ← rechaza si issuedAt está fuera de la ventana de 5 min        → 401, sin detalles
  ← rechaza si el cuerpo pasa de 256 KB                           → 413
  ← rechaza si envelopeId <= el guardado (reenvío / desorden)     → 200 idempotente
  → escribe a tmp y hace rename() atómico sobre tarifas.json
  → responde 2xx en <50 ms, ANTES de cualquier otra cosa
```

**Por qué `rename()` y no escritura directa:** es atómico en POSIX. Sin él, una petición del
visitante puede leer un JSON a medio escribir, y el modo de fallo sería un precio truncado — peor
que ningún precio.

### `zenix-precio.php` — lo pinta

Un `include` que el sitio llama **en el servidor**. Devuelve el precio ya formateado y el marcado
de datos estructurados. **Si el sobre falta, está caducado o no parsea, devuelve el estado
`CONSULTAR` y el sitio publica «consultar disponibilidad».**

🔑 **Ese camino de degradación es requisito, no adorno.** Es la regla 3 del hotel piloto —*el total
cotizado incluye impuestos*— llevada a su conclusión: **si no podemos garantizar el total, no
publicamos precio.**

### Datos estructurados: microdata, no JSON-LD

**Contraintuitivo y verificado:** la galería de resultados enriquecidos de Google **no incluye
`Hotel` ni `HotelRoom`**, así que marcar precio ahí no produce resultado enriquecido en la
búsqueda web. **Pero Google sí consume ese marcado para validar la exactitud del precio en Google
Hotels — y para ese uso recomienda MICRODATA y declara JSON-LD DEPRECADO.**

Es decir: el JSON-LD que un sitio ya emita **no sirve para ese canal**. El conector emite
microdata.

---

## 6 · Modelo de amenazas del receptor

Es un endpoint público en el servidor de un tercero. Se diseña como tal.

| Amenaza | Defensa | Comprobable |
|---|---|---|
| **Falsificación del precio** | HMAC-SHA256 con `hash_equals` | Firma inválida → 401 |
| **Reenvío de un sobre viejo** | Ventana de 5 min **+** `envelopeId` monótono | Sobre de ayer → rechazado |
| **Degradación por volumen** | Tope de 256 KB · límite de tasa en el servidor | Cuerpo de 1 MB → 413 |
| **Recorrido de rutas** | Ruta de escritura **fija**, no derivada de la petición | Nada del cuerpo toca el sistema de archivos |
| **Divulgación de información** | Errores sin detalle, sin rutas, sin trazas | 401 no dice por qué |
| **Lectura del sobre desde internet** | `.htaccess` deniega `tarifas.json`; sólo PHP lo lee | `curl` al JSON → 403 |
| **Secreto en el repositorio del hotel** | El secreto vive **fuera del docroot**, patrón ya usado en el piloto | Escaneo del repo → limpio |

---

## 7 · Qué hay que construir en Zenix — y en qué orden

### 🔴 El desbloqueo: separar el CÁLCULO fiscal de la PERSISTENCIA fiscal

El plan vigente pone **M4 (`FolioLine` + `TaxLine`)** antes que **M5 (publicar el total con
impuestos)**, y eso bloquea la prioridad sin necesidad. **Son dos cosas:**

| | Qué es | Qué necesita |
|---|---|---|
| **Cálculo** | Función pura: `(neto, políticaFiscal, canal, fecha) → desglose` | **Sólo configuración.** Ningún cambio de esquema |
| **Persistencia** | `TaxLine` por noche, escrita en la misma transacción que la reserva | Migración, y es lo que el contador necesita |

**Publicar un precio necesita el CÁLCULO. Cobrarlo y declararlo necesita la PERSISTENCIA.**
Separarlos adelanta la prioridad varias semanas y no crea deuda: la persistencia usará la misma
función pura.

### El orden, por dependencia real

| # | Trabajo | Depende de | Prueba que lo cierra |
|---|---|---|---|
| **C1** | **`TaxCalculator`**, función pura, con las tasas en configuración por propiedad | — | Tabla de casos (canal × fecha × ciudad). 🔴 Hoy hay **0 pruebas** sobre la única aritmética fiscal del producto |
| **C2** | **El puerto resuelve con el `rate-resolver`** y devuelve `net`/`taxes`/`total` | C1 | Snapshot de contrato: cambiar un nombre de campo **exige** cambiar el snapshot |
| **C3** | **Endpoint de escritura de tarifa** (`PATCH .../rates`), con auditoría de quién la cambió | — | Prueba de que un cambio se refleja en la lectura pública |
| **C4** | **Emisor del sobre**: firma con marca de tiempo, `envelopeId` monótono, reintentos | C2 | Firma estable byte a byte; sobre caducado rechazado |
| **C5** | **Receptor y renderizador PHP** | C4 | Suite contra `php -S`: firma, reenvío, tamaño, caducidad, escritura atómica |
| **C6** | **La skill de conexión** — lo que corre la sesión con las credenciales | C5 | Instalación en un cPanel de prueba, de principio a fin |
| **C7** | **ZBP, la página alojada** (`book.zenix.com/{slug}`) | C2 | Reserva de punta a punta contra el motor ya construido |

**C1 a C5 entregan «cambio la tarifa en Zenix y el sitio la muestra con su total real».**
**C7 entrega «y el huésped reserva sin OTA».** Son separables, y el primero vale por sí solo.

### 🔑 Y una pieza que no es código: C6

Lo que hace que esto sea un producto replicable y no un favor. La skill:

1. Pide las credenciales por el canal seguro —**nunca por el chat**, `zahardev-secretos`.
2. Reconoce el hosting: ¿PHP? ¿qué versión? ¿docroot? ¿`.htaccess` activo?
3. Sube los dos archivos, escribe el secreto fuera del docroot, y **comprueba que el JSON no es
   legible desde internet**.
4. Da de alta la suscripción en Zenix y **manda un sobre de prueba**.
5. **Verifica de punta a punta:** cambia una tarifa, espera, y **lee el HTML público** para
   confirmar que el número nuevo está ahí.
6. Deja escrito el procedimiento de reversión.

> **El paso 5 es el que separa esto de una promesa.** El piloto ya aprendió que «el panel lo dice»
> no es «funciona», y que un formulario que nadie envió de punta a punta no está terminado.

---

## 8 · Lo que NO se construye, y por qué

- **No se toca la página del hotel más allá de un `include`.** Cuanto menos suyo toquemos, menos
  nuestro es romperlo.
- **No se cachea en el borde ni se invalida por etiquetas.** El sobre ya es el caché, con su
  caducidad explícita. Añadir otra capa es añadir otro sitio donde el precio puede quedarse viejo.
- **No se publica disponibilidad** salvo que el hotel tenga inventario fiable en Zenix. Es la
  regla 2 del piloto, y publicarla sin respaldo reproduce exactamente la sobreventa que M1 acaba
  de cerrar.
- **El widget (ZBW) se pospone.** Es el nivel que menos aporta: no da SEO —el precio va por
  JavaScript— y no es más fácil de instalar que un enlace a la página alojada.

---

## 9 · Lo que este documento cambia del plan vigente

| Historia | Antes | Ahora |
|---|---|---|
| **M4** | Antes de M5 | **Se parte:** el cálculo fiscal (C1) adelanta a M5; la persistencia sigue siendo M4 y va después |
| **M5** | «el puerto resuelve con el rate-resolver y publica el total» | Se concreta en **C1–C3** |
| **M5-bis** | «el sobre de tarifas» | Se concreta en **C4–C6**, con contrato, modelo de amenazas y pruebas |
| **M6** (fugas cross-tenant) | Siguiente tras M1 | **Baja** detrás de C1–C5. Importa, pero no es la prioridad declarada |
| — | — | **Entra C7 (ZBP)**, que el plan del booking engine ya diseñó y nadie había secuenciado |
