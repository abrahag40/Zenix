# 17 · Puertos abiertos — arquitectura de apertura y plan del primer hotel real

> **Qué decide este documento.** Zenix tiene que dejar de ser un PMS que se despliega y pasar a ser
> **un producto con puertos**: independiente de cualquier cliente, capaz de hablar con sitios web
> ajenos, con canales de OTA y con servicios de terceros, sin que el núcleo conozca a ninguno.
> Aquí está el estado **medido** del código, las decisiones de arquitectura con su evidencia, y el
> corte mínimo que pone al primer hotel real en producción.
>
> **Sustituye como plan de trabajo vigente** a las fechas de `16-version-roadmap.md` y
> `03-roadmap-v1-v2.md`, que quedaron caducadas: el último commit de producto es del 2026-06-21 y
> los roadmaps apuntaban a v1.0.0 para jul–ago 2026.
>
> **Base de evidencia:** auditoría multi-sombrero del **2026-09-22** sobre el código, con los nueve
> sombreros del método de la casa y **verificación adversarial de cada hallazgo bloqueante**.
> **148 hallazgos · 40 críticos sometidos a verificación · 13 confirmados, 27 matizados, 0
> refutados.** Que ninguno cayera, con escépticos instruidos para desconfiar por defecto y abrir el
> código ellos mismos, dice que se midió en vez de opinar.
>
> ⚠️ **Este repositorio es PÚBLICO.** Aquí no aparece el nombre del hotel piloto, ni sus tarifas,
> ni sus dominios. Se le llama «el hotel piloto».

---

## 1 · El objetivo que manda, y por qué hoy no se cumple

> **Cambiar una tarifa en Zenix y que el sitio web del hotel la refleje, con su total real, para
> competir con las OTAs sin pagar comisión.**

Ese objetivo **no funciona hoy**, por tres razones encadenadas, todas medidas y todas de código:

| # | Qué | Dónde |
|---|---|---|
| 1 | **El puerto público no llama al motor de tarifas.** Devuelve `RoomType.baseRate` plano. El `rate-resolver` existe y tiene **0 usos** desde el módulo público, así que temporadas, día de semana y *overrides* no salen por el puerto | `public-booking.service.ts:118-119` |
| 2 | **El único número que sí publica no tiene ningún endpoint que lo escriba.** No hay forma de cambiar `baseRate` desde el producto | — |
| 3 | **Ese número no lleva impuestos**, en un estado con dos bases distintas. **Cero referencias a impuestos en las 2 195 líneas del módulo público** | `public-booking/` completo |

**Las tres son acotadas y se arreglan en días, no en sprints.** Ése es el corte mínimo del §8.

---

## 2 · Lo que YA existe — y es mucho más de lo que el roadmap admite

El puerto público **no es andamiaje**: son **2 195 líneas en 18 archivos**, con 8 endpoints bajo
`/api/v1/public/*`.

| Pieza | Estado | Dónde |
|---|---|---|
| 8 endpoints públicos (6 GET + 2 POST) | ✅ completo | `public-booking.controller.ts:55-141` |
| API keys estilo Stripe: `pk_{env}_{keyId}{secret}`, **bcrypt** en reposo, plaintext devuelto una sola vez | ✅ completo | `booking-api-key.service.ts:34-61` |
| Revocación **idempotente y acotada a la propiedad** — una llave de otro hotel no se puede revocar | ✅ completo | `booking-api-key.service.ts:64-72` |
| CORS por llave (`allowedOrigins`) + CORS abierto para el prefijo público | ✅ completo | `api-key.guard.ts:34-39` · `main.ts:97-106` |
| **Escritura atómica anti-sobreventa con advisory lock**, re-chequeo dentro del lock, rechazo de la reserva entera si una línea no cabe | ✅ completo | `public-reservations.service.ts:193-246` |
| **Idempotencia persistida** por `(scope, Idempotency-Key)` con hash del cuerpo, comprobada dos veces | ✅ completo | `public-reservations.service.ts:93-213` |
| Webhooks salientes con **HMAC-SHA256**, reintentos `[1,5,30,300,1800]s`, dead-letter al quinto | 🟡 parcial | `webhook-dispatcher.service.ts` |
| Swagger en `/api/docs` | ✅ | `main.ts` |

🔑 **Y la respuesta a la pregunta que manda: SÍ, un sitio estático ajeno puede pintar un precio HOY,
sin llave y desde el navegador.** La llamada exacta es
`GET {BASE}/api/v1/public/properties/{slug}/room-types`, con `Access-Control-Allow-Origin: *` y
`Cache-Control: public, max-age=30`. **Lo que falta no es el puerto: es lo que sale por él.**

**Y una pieza de tenencia que conviene subrayar porque ya está bien hecha:** toda escritura deriva
la propiedad **de la llave**, no del cuerpo (`public-reservations.service.ts:59-65`). Un sitio no
puede reservar en otro hotel aunque lo intente.

### Lo que existe y está apagado

- **`reservation.cancelled` está declarado como evento válido y NADIE lo emite.** Medido: aparece
  sólo en la línea de la constante.
- **Los webhooks tienen 0 pruebas.**
- **No hay versionado real**: `enableVersioning` no existe y `v1` es literal en la ruta.
- **No hay caducidad ni límite de tasa por llave**, ni SDK, ni cliente.
- El módulo **lleva sin tocarse desde el 2026-06-11**.

---

## 3 · Decisión 1 · Cómo publica Zenix un precio a un sitio ajeno

### La opción que hay que descartar primero, y con fuente

**No se carga el precio con JavaScript del cliente.** Google confirma que renderiza e indexa JS y
que lee JSON-LD inyectado en el DOM, pero **en la misma página advierte que el marcado generado
dinámicamente degrada el rastreo justo para precio y disponibilidad**, y declara el renderizado en
una cola de duración no garantizada. Además Google **declaró el *dynamic rendering* un parche, no
una solución**, así que esa puerta también está cerrada.

> Funciona para indexar. Es malo exactamente para el dato que nos importa.

### 🔑 La restricción que manda, decidida el 2026-09-23

> **La mayoría de los hoteles tendrá su sitio en hosting compartido** —cPanel sobre Apache: tipo
> HostGator, GoDaddy, Hostinger—, **no en una plataforma de despliegue moderna.** Decisión del
> dueño, y no es un detalle de infraestructura: **cambia cuál es el mecanismo por defecto.**

De esa restricción salen dos hechos que deciden el diseño, y los dos están comprobados en el
piloto:

| Hecho | Consecuencia |
|---|---|
| **En un jail de cPanel hay PHP y NO hay Node** | **El sitio no se puede reconstruir en su propio servidor.** Cualquier vía que dependa de un `build` exige una máquina externa (CI, o la del consultor) y un `rsync` después |
| **No hay *deploy hooks*, ni funciones de borde, ni caché programable** | El disparador «Zenix cambió una tarifa» **no puede ser un webhook que dispare un build** en el 100 % de los casos |

### Las cuatro vías, revaluadas contra esa restricción

| Vía | Qué es | En hosting compartido | Veredicto |
|---|---|---|---|
| **(a) Fetch del cliente** | El navegador pide el precio | Funciona, pero Google degrada el rastreo del precio | 🔴 **descartada** para el precio indexable |
| **(b) Rebuild por webhook** | Zenix emite `rate.changed` → el sitio se reconstruye | **Exige Node fuera del servidor.** Viable con CI, no dentro del jail | 🟡 **sólo donde haya CI o plataforma moderna** |
| **(c) Renderizado bajo demanda** | *Live content collections* de Astro | **Imposible sin Node** | 🔴 descartada en el caso mayoritario |
| **(d) Documento de tarifas + render en servidor** | Zenix publica un **sobre firmado** por propiedad; el sitio lo lee **con PHP** y lo imprime en el HTML | ✅ **Funciona en cualquier cPanel** | 🟢 **POR DEFECTO** |

### 🟢 Decisión: el «sobre de tarifas», y el render lo hace el servidor del hotel

**(d) pasa a ser la vía por defecto y (b) el refuerzo donde exista CI.** El diseño:

1. **Zenix publica un documento de tarifas por propiedad** — JSON pequeño, **versionado**, con
   fecha de emisión y **firmado con HMAC-SHA256 sobre `id.timestamp.cuerpo`**, siguiendo el
   esquema del §6. Contiene el precio **ya resuelto por el `rate-resolver`** y **con impuestos
   desglosados**, que es lo que el §1 dice que hoy falta.
2. **Un receptor mínimo en PHP** en el servidor del hotel valida la firma y **escribe el documento
   en disco**. No construye nada. Es el mismo patrón que el piloto ya usa para su formulario,
   precisamente porque no hay Node en el jail.
3. **El sitio imprime el precio desde ese archivo, en el servidor.** Va en el HTML que Google
   recibe — sin JavaScript, sin cola de renderizado, sin la degradación que Google advierte.
4. **Respaldo por tirón (*pull*)**: si el servidor del hotel no puede recibir —firewall, política
   del proveedor—, un cron tira del endpoint público de Zenix con su llave. El mismo documento, al
   revés.

**Lo que esta decisión compra, y es lo que la justifica:**

- **Funciona en el 100 % de los hoteles**, no sólo en los que estén en una plataforma moderna.
- **El puerto no supone nada del consumidor.** Zenix publica un documento; cómo lo pinte cada
  sitio es problema del sitio. Eso es literalmente «no casarse con un cliente».
- **Sobrevive a que el sitio cambie de tecnología.** Un WordPress puede leer el mismo sobre.
- **El precio queda indexable** sin depender de JavaScript.
- **No consume presupuesto de builds.** Cambiar una tarifa cuesta una petición, no un despliegue.

⚠️ **Y lo que cuesta, dicho antes de construirlo:** hay que escribir y mantener un receptor por
pila de sitio (PHP primero; WordPress después si aparece), la firma tiene que validarse **bien**
—una firma mal comprobada es peor que ninguna— y hay que decidir qué pasa cuando el sobre llega
viejo o no llega: **el sitio debe poder decir «consultar disponibilidad» en vez de publicar un
precio caducado.** Ese caso de degradación es requisito, no adorno.

### Los límites de la vía (b), para cuando sí se use

1. **Cloudflare Pages Free da 500 builds/mes y 1 build concurrente, con timeout de 20 min — y los
   dos límites son POR CUENTA, no por proyecto.** En un ecosistema de varios hoteles **el
   presupuesto de builds se reparte entre todos**.
2. **La Cache API de Cloudflare Workers NO es un caché global**: el contenido no se replica fuera
   del centro de datos de origen y `cache.delete` sólo purga ahí. La invalidación global dirigida
   se hace con **Cache-Tag**, con límites duros (16 KB de cabecera agregada, 1 024 caracteres por
   etiqueta, 100 etiquetas por purga).

### 🔴 Y un hallazgo sobre datos estructurados que corrige una creencia del ecosistema

La galería de resultados enriquecidos de Google **no incluye `Hotel` ni `HotelRoom`**: marcar
precios ahí **no produce un resultado enriquecido de precio en la búsqueda web**.

**Pero no es cierto que ese marcado sea inútil.** Google **lo consume para validar la exactitud del
precio en Google Hotels**, y **para ese uso recomienda MICRODATA y declara JSON-LD DEPRECADO**. Es
decir: si Zenix llega a publicar tarifas, **el JSON-LD de `Hotel` que un sitio ya emita no sirve
para ese canal**. Es un cambio de formato, no de contenido, y hay que saberlo antes de prometerlo.

**Y la vía oficial para que un precio de hotel llegue a Google es un feed asociado a Hotel Center**,
con integrador autorizado — que es lo que Zenix aspira a ser.

---

## 4 · Decisión 2 · La bandera por cliente — el mecanismo existe y está roto

La petición es legítima y tiene nombre en la literatura: Hodgson la clasifica como
***permissioning toggle*, la categoría MÁS dinámica y MÁS longeva de las cuatro — vive años, no
semanas**. Es también **la más cara**.

### Lo que hay hoy: 258 líneas, 1 consumidor, 0 pruebas

`FeatureFlag` está **bien documentado**, tiene *audit log* append-only dentro de la misma
transacción, caché de 30 s y convención de nombres validada por DTO. Y es **andamiaje**: **un solo
consumidor en toda la API**, **una sola clave en la lista blanca de la interfaz** y **cero
pruebas**.

### 🔴 Cuatro defectos medidos, y el primero invalida el caso de uso entero

| # | Defecto | Evidencia |
|---|---|---|
| **1** | **`key` es `@unique` GLOBAL y no existe `@@unique([key, propertyId])`.** El `upsert` resuelve `where: { key }` **ignorando `propertyId`**, así que **la segunda propiedad que active el mismo flag SOBRESCRIBE la fila de la primera**, incluido su `propertyId` y su `config` | `schema.prisma:3450` · `feature-flags.service.ts:120,138,147-153` · migración línea 18 |
| **2** | **El comentario dice lo contrario de lo que hace el código.** `orderBy: { propertyId: 'desc' }` lleva el comentario «property-specific gana sobre global», pero **en PostgreSQL `DESC` es `NULLS FIRST` por omisión: gana el GLOBAL**. El propio repo sabe arreglarlo — `tasks.service.ts:136` usa `{ sort: 'asc', nulls: 'last' }` | `feature-flags.service.ts:73` |
| **3** | **Las variables de entorno NO «siempre ganan»**, como afirma el esquema. Sólo pueden **apagar** (`=== 'false'`), no encender, y sólo para las claves del mapa `ENV_KILL_SWITCH`, **que tiene exactamente una entrada** | `schema.prisma:3433` vs `feature-flags.service.ts:36-41,57-65` |
| **4** | 🔴 **Fuga entre inquilinos.** `list()` es un `findMany` **sin `where`**: un SUPERVISOR ve las banderas de **todas** las propiedades y organizaciones. `deleteFlag(key)` borra por clave global **sin comprobar de quién es**. Y el controlador **no lleva `@TenantResource`**, así que el guard de inquilino —que es *opt-in* por decorador— **ni siquiera se ejecuta** | `feature-flags.service.ts:93-101,180-203` · `feature-flags.controller.ts:17-42` |

### ✅ Y la buena noticia, que es la que salva el diseño

**No existe una sola bifurcación por cliente escrita a mano en el código de producción.** Medido:
cero comparaciones contra un `propertyId` literal, cero ramas por *slug* de organización, cero
UUID literales en `src/`, y **ninguna mención del hotel piloto en código de producción**.

**El producto no está bifurcado. Estamos a tiempo de hacerlo bien.**

### Lo que se decide

**La bandera NO es el mecanismo para «funcionalidad a la medida de un cliente». Los entitlements
sí.** Razones, con evidencia:

1. **Con la clave única global, el flag ES el producto entero, no un cliente.** Es literalmente
   incapaz de expresar lo que se pide.
2. **El catálogo de capacidades ya está vendido y nada lo aplica.** El asistente le enseña al
   consultor «Channex 2 canales» y «Sin USALI / ADR» para STARTER — y **no hay límite de canales en
   el código** (0 aciertos), y **`planTier` no lo lee ningún guard ni servicio**: sólo alimenta
   Stripe, precios y correos. `BillingPricingConfig.features`, descrito como «array of feature
   flags», **no lo lee nadie**.
3. **`EntitlementService` está prometido por escrito en `12-infrastructure-devops.md:327-332` y no
   existe**: 0 aciertos en el código. La deuda venció y se reporta como incumplimiento, no se
   recicla.

**Diseño acordado:**

| Concepto | Para qué | Regla |
|---|---|---|
| **Entitlement** | Qué capacidades tiene un inquilino, por contrato | Por organización. Lo escribe el asistente de alta. **Es lo que se cobra** |
| **Feature toggle** | Despliegue gradual y kill-switch de una funcionalidad **del producto** | Corta vida. **Con fecha de caducidad obligatoria** |
| **Tier** | Empaquetado comercial | Deriva entitlements, no los sustituye |

**Y las cuatro defensas contra la bifurcación silenciosa**, que la literatura documenta y aquí se
adoptan: **tarea de retirada en el backlog** al crear cada toggle, **fecha de caducidad**,
***time bombs* que rompen los tests** cuando el toggle caduca, y **tope duro al número de
toggles vivos** — un gate que se pone rojo al pasarlo.

> **El antipatrón tiene caso documentado por un regulador:** Knight Capital reutilizó una bandera
> que activaba código latente y lo desplegó a **7 de 8 servidores**. La orden de la SEC es fuente
> primaria. *(Las cifras de pérdida difieren entre fuentes —440 o 460 millones de USD—, así que no
> se cita ninguna a ciegas.)*

Microsoft añade el argumento comercial que cierra el círculo: **un despliegue dedicado por cliente
se puede cobrar más caro**, y sirve para recuperar el sobrecoste. Es decir, lo «a la medida» se
factura; no se regala dentro del producto.

---

## 5 · Decisión 3 · El aislamiento entre inquilinos, antes de abrir más puertos

**Hoy el aislamiento depende de que cada desarrollador escriba el `where` a mano.** Medido: **373
rutas, de las cuales 338 no llevan decorador de inquilino** — cobertura del **9,4 %**. No hay RLS,
ni extensión de Prisma, ni repositorio base, ni regla de lint. `PrismaService` son **13 líneas**.

AWS lo describe con nuestras palabras: **sin RLS «a menudo la única opción es confiar en que los
desarrolladores implementen las comprobaciones correctas en cada sentencia SQL»**. Y eleva el
aislamiento a asunto existencial: cruzar la frontera es *«significativo y potencialmente
irrecuperable»* para un negocio SaaS.

**Y ya se encontraron dos instancias reales**, no hipotéticas:

- **`PATCH /discrepancies/:id/acknowledge` y `/resolve`**: un `HOUSEKEEPER` —el rol de menor
  privilegio— puede resolver una discrepancia de inventario **de otro hotel** y recibe 200. **Y el
  comentario del código afirma un control que no existe.**
- **`compset` y `local-events`** toman el `propertyId` del path y **no lo validan** contra la
  organización del actor; su comentario invoca un `TenantContextGuard` **que no existe**.
- Y el único guard de inquilino **falla ABIERTO** cuando `organizationId` es cadena vacía — **y el
  esquema permite que lo sea**.

### 🔴 Las tres trampas de RLS que hay que resolver ANTES de escribir la primera política

1. **El DUEÑO de la tabla ignora las políticas.** PostgreSQL lo documenta: hay que usar
   `FORCE ROW LEVEL SECURITY`, y AWS recomienda explícitamente **conectarse con un rol distinto del
   propietario**.
2. **La integridad referencial SIEMPRE salta RLS.** Es un canal encubierto documentado: una clave
   foránea puede confirmar la existencia de una fila de otro inquilino.
3. 🔴 **PgBouncer en modo transacción marca `SET`/`RESET` como «Never».** La variable de sesión
   `app.current_tenant` que usan todos los tutoriales **no sobrevive a ese pooler**. Si Zenix va a
   usar *pooling* de transacción, el tenant se fija **por transacción con `SET LOCAL`**, no por
   sesión.

**Decisión: RLS en los 46 modelos con `propertyId` y los 41 con `organizationId`, con
`FORCE ROW LEVEL SECURITY`, rol de aplicación distinto del propietario, y `SET LOCAL` por
transacción desde `PrismaService`.** Y mientras llega, **un gate de lint que ponga rojo cualquier
ruta nueva sin decorador de inquilino** — el trinquete del método: no obliga a arreglar lo
existente, **impide que crezca**.

---

## 6 · Decisión 4 · Los webhooks — el estándar y las dos brechas

El consenso de **Stripe** y de **Standard Webhooks** es: firma **HMAC-SHA256 sobre
`id.timestamp.cuerpo crudo`**, **tolerancia temporal** contra reenvío, 2xx inmediato **antes** de
la lógica, reintentos con backoff por días, **sin garantía de orden**, y **deduplicación por id**.
Stripe además dice expresamente **que no se use `created` para ordenar ni deduplicar**.

**Zenix firma con HMAC-SHA256 sobre el cuerpo crudo, pero SIN marca de tiempo ni ventana de
tolerancia.** Consecuencia: **la firma sola no protege contra el reenvío de una entrega
capturada.** Es la brecha 1, y se cierra copiando el esquema de Stripe.

🔴 **Brecha 2, del lado entrante: Channex NO firma criptográficamente sus webhooks** — recomienda
una cabecera secreta propia. **Es nuestro puerto hacia las OTAs y queda fuera del estándar.** Zenix
tiene que tratar ese canal como **no autenticado criptográficamente**: validar por origen, por
forma y por reconciliación, no por firma. *(Channex sí documenta reintentos serios: hasta 11
intentos, de 1 minuto a 10 horas, cerrando cerca de 24 h.)*

**Y un defecto propio ya medido:** el reintento **no reclama la fila** ni evita el solape de ticks,
así que **el contador de intentos se pisa y la misma entrega puede salir dos veces**. Con **0
pruebas** en todo el subsistema.

**Para la consistencia PMS ↔ canales se adopta el patrón *Transactional Outbox***: escribir en
Postgres y publicar atómicamente sin 2PC, conservando el orden a cambio de duplicados — que es
justamente el intercambio correcto cuando el receptor deduplica por id.

---

## 7 · Decisión 5 · El contrato del puerto, para no casarse con nadie

**Hoy el contrato del puerto no está pinneado por nada:** 0 esquemas de respuesta, 0 spec
versionado, 0 test de forma, `v1` literal en la ruta. Y hay algo peor que el auditor no usó: **las
respuestas se construyen como literales anónimos sin tipo de retorno**
(`public-booking.service.ts:172-202`), **así que TypeScript tampoco pinnea el contrato**.

El sitio del hotel **no se despliega con el API**: no existe un build conjunto que se ponga rojo.
Un sprint futuro que conecte el `rate-resolver` y aproveche para renombrar un campo **rompe el
sitio en producción, en silencio**.

**Se adoptan cuatro cosas, en orden de costo:**

1. **Snapshot de contrato** — un spec que genere el documento OpenAPI del módulo público y lo
   compare contra un archivo versionado. Cambiar un nombre de campo **exige cambiar el snapshot**,
   y eso se ve en la revisión. *Un día de trabajo.*
2. **Versionado por fecha, al estilo Stripe** — el consumidor queda anclado a la versión de su
   primera llamada; los cambios se encapsulan en módulos de transformación.
3. **Consumer-driven contracts (Pact)** — el contrato se genera **ejecutando los tests del
   consumidor**, no escribiendo un documento. Libera al proveedor para cambiar lo que nadie usa, y
   es la respuesta a por qué un proveedor sin contratos acaba paralizado.
4. **Tolerant Reader en cada consumidor** — la regla barata que debe seguir **cada sitio web**:
   tomar sólo lo que necesita, ignorar el resto, y encapsularlo en un solo sitio.

> Y un cambio de nombre que cuesta cinco minutos y evita una disputa: **el puerto publica un campo
> llamado `totalRate` que NO es el total que paga el huésped.** Se renombra.

---

## 8 · El corte mínimo — lo que pone al piloto en producción

De la auditoría, el gate de cada sombrero. **Seis de los nueve dicen NO hoy.**

| Sombrero | Hallazgos | Gate |
|---|---|---|
| A1 Arquitecto | 14 · 0 bloq · 5 altos | Informativo — *«la estructura aguanta; sus límites no se respetan solos»* |
| A2 Dominio y fiscalidad | 23 · **7 bloq** · 7 altos | 🔴 **NO** — *«el producto no sabe cobrar»* |
| A3 QA/SDET | 13 · **2 bloq** · 5 altos | 🔴 **NO** |
| A4 Seguridad | 17 · **3 bloq** · 5 altos | 🔴 **NO** |
| A5 UX/UI | 22 · **5 bloq** · 9 altos | 🔴 **NO** |
| A6 DevOps/SRE | 16 · 2 bloq · 5 altos | Informativo — *«más construido de lo que su operación soporta»* |
| A7 Datos/DBA | 16 · **3 bloq** · 6 altos | 🔴 **NO** |
| A8 PM/PO | 15 · **4 bloq** · 5 altos | 🔴 **NO** |
| A9 Tech Lead | 12 · 2 bloq · 4 altos | Informativo — *«el CI tiene dos pasos y uno es un placebo»* |

### MUST — sin cualquiera de estos, el piloto no sale

| # | Qué | Por qué |
|---|---|---|
| **M1** | **Unificar la clave del advisory lock** del motor público con la de recepción y la de OTAs | 🔴 **El único camino abierto a internet es el que NO se serializa contra el mostrador.** La regla existía escrita —`OVERBOOKING-HARDENING-plan.md:11`, «misma key en TODOS los flujos»— y la auditoría que declaró cubrir «toda escritura de inventario» dejó fuera el único flujo público |
| **M2** | **Constraint `EXCLUDE` sobre `(room_id, rango)`** con `btree_gist` | Convierte «no sobrevendemos si el código está bien» en **«no se puede sobrevender»**. Es lo único que sobrevive al día que alguien escriba un quinto flujo |
| **M3** | **Prueba e2e web-vs-recepción con dos conexiones reales a Postgres** | **Cero pruebas de concurrencia reales**: en los 105 specs el advisory lock está siempre mockeado y **no existe un solo archivo e2e**. Borrar la línea del lock deja 1 316 pruebas en verde |
| **M4** | **`FolioLine` + `TaxLine`**: línea de cargo y línea de impuesto persistidas | **Una estadía sólo puede costar tarifa × noches.** Sin folio no se carga un consumo a la habitación, **y no se pueden separar las dos bases fiscales** |
| **M5** | **Escritura de tarifa desde el producto** + **el puerto resuelve con el `rate-resolver`** + **publica el total con impuestos**, con las tasas en configuración y no en literales | Es el objetivo que manda |
| **M5-bis** | **El «sobre de tarifas»**: documento por propiedad, versionado y firmado, + **receptor en PHP** para hosting compartido + **camino de degradación** cuando el sobre llega viejo o no llega | La mayoría de los hoteles está en cPanel, donde **hay PHP y no hay Node**. Sin esto, el objetivo del M5 sólo llega a los hoteles que estén en una plataforma moderna |
| **M6** | **Cerrar las dos fugas cross-tenant confirmadas** y **el guard que falla abierto** | Un rol de menor privilegio escribe en otro hotel y recibe 200 |
| **M7** | **`@@unique([key, propertyId])` en FeatureFlag**, `nulls: 'last'` en el orden, y filtro de inquilino en `list()` y `deleteFlag()` | El mecanismo de «a la medida» hoy **sobrescribe la configuración de un cliente con la de otro** |
| **M8** | **Error boundaries en `apps/web`** y **el gate de contraste** | **Cero error boundaries**: una excepción de render deja **pantalla blanca en el mostrador**. Y **661 usos** de colores por debajo de AA (2,56:1) |
| **M9** | **Persistencia real de las fotos del pre-check-in** | Hoy se escriben en un disco que **el siguiente despliegue borra**. Es pérdida de datos personales, silenciosa y garantizada |
| **M10** | **Arreglar el CI: `turbo build` como paso, `extends` en las tres configuraciones de ESLint, quitar el `--fix` del lint** | **Un CI que reescribe el árbol no es un gate, es un editor.** Hoy los 76 010 líneas de `apps/web` entran a `main` sin que nada las mire |
| **M11** | **Reactivar `channex-crud-schema.spec.ts` en el CI** | Una línea de YAML y un paso de siembra. **Recupera 21 comprobaciones escritas y apagadas**, y el diagnóstico que las excluía es falso: 31 de los 32 casos pasan hoy con los seeds que el propio CI ya corre |
| **M12** | **Acuerdo escrito con el hotel** sobre los dos huecos de alcance —se cobra en recepción y la factura se emite fuera de Zenix— y decisión sobre la **taxonomía de tipos operativos frente a comerciales** | No es código. Es la Definition of Ready |

### SHOULD — entra en el sprint siguiente

RLS con sus tres trampas resueltas · outbox · marca de tiempo en la firma de webhooks · snapshot
de contrato del puerto · `reservation.cancelled` emitido de verdad · la noche de salida que se
cuenta como vendida *(infla ocupación, ADR y RevPAR: 3 noches donde el huésped durmió 2)* · el
ISH al 6 % aplicado al canal directo cuando la matriz del propio repositorio dice 5 % · la
capacidad vendible que ignora los bloqueos · el reporte del móvil que cuenta **canceladas como
ingreso**.

### WON'T — lo que NO se construye todavía, y por qué

**CFDI** *(es un sprint entero; el acuerdo del M12 lo cubre mientras tanto)* · **entitlements
completos** *(primero la bandera correcta, después el catálogo)* · **certificación Channex**
*(decisión del dueño: va al final)* · **el segundo hotel** *(hasta que el primero opere)* ·
**accesibilidad completa del móvil** *(7 etiquetas accesibles para 286 elementos pulsables — es
real y es deuda declarada, no bloquea al piloto)*.

---

## 9 · Lo que esto obliga a corregir en los documentos de visión

| Documento | Qué cambia |
|---|---|
| `16-version-roadmap.md` · `03-roadmap-v1-v2.md` | **Fechas caducadas.** Este documento es el plan vigente |
| `12-infrastructure-devops.md:327-332` | Promete `EntitlementService` **para v1.0.5 y no existe**. Se reetiqueta como pendiente con su costo |
| `14-payment-currency-tax-architecture.md` | Contiene **dos definiciones incompatibles de la base fiscal** y nadie ha decidido cuál rige. Es decisión del contador, no del programador |
| `13-consultant-setup-wizard.md` | Describe entitlements por contrato que **el DTO implementado no tiene** |
| `docs/prices-packages.md` vs `02-product-family.md` | ✅ **RESUELTO el 2026-09-23: manda `prices-packages.md`** ($149/$299/$499, flat, por capacidad). `02-product-family.md` conserva su familia de producto; sus cifras dejan de ser contrato comercial |
| `docs/ops/capacity-planning-and-observability.md` · `zero-downtime-deployment.md` | Describen **Sentry, respaldos probados y health check contra la base**. **Ninguna de las tres existe.** El caso más nítido: la línea 230 manda comprobar que el health check «incluye DB ping», contra un controlador de **21 líneas sin constructor** |

> **La regla del método aplicada aquí: 848 líneas de documentación de operación describen un
> sistema instrumentado que no existe. Quien las lea creerá que está cubierto. Eso es una garantía
> falsa, y una garantía falsa es peor que ninguna.**

---

## 10 · Lo que esta auditoría encontró BIEN, y no hay que rehacer

Se dice porque un informe que sólo enumera defectos no se distingue de uno que no miró.

- **La criptografía está bien hecha:** AES-256-GCM correcto, bcrypt en llaves y contraseñas,
  tokens de 256 bits hasheados en reposo, comparaciones en tiempo constante, TOCTOU cerrado dentro
  de transacción.
- 🔑 **El repositorio público está LIMPIO.** Se escaneó el contenido de **los 3 687 blobs de todo
  el historial**: **no hay un solo secreto real**.
- **Los webhooks entrantes de Stripe y de Channex fallan cerrados.**
- **El producto no está bifurcado por cliente.** Ni una comparación contra un `propertyId` literal.
- **El módulo de operación diaria está notablemente bien construido:** no-show con cargo y
  reversión, cancelación con tramos y retención, walk-in, *room move* con segmentos, bloqueos con
  las cuatro semánticas y aprobación, housekeeping, grupos OTA y arqueo de caja multidivisa.
- **El código es sano:** complejidad contenida, cero duplicación grande, filtro de errores
  correcto, logging consistente, **1 316 pruebas**.
- **El CI corre contra Postgres real en 2,5 minutos.**

**Nada de esto es habitual en un producto de este tamaño, y nada de esto hay que rehacerlo. Lo que
está peor de lo que aparenta no es el código: son los gates.**

---

## 11 · Fuentes

**Arquitectura:** Ford, Parsons, Kua & Sadalage, *Building Evolutionary Architectures* (2.ª ed.,
2023) — de donde salen las *architecture fitness functions* · Hodgson, *Feature Toggles*
(martinfowler.com) · Fowler, *Consumer-Driven Contracts* y *Tolerant Reader* · Newman, *BFF* ·
microservices.io: *Transactional Outbox*, *Saga*, *API Gateway* · Golding, *Building Multi-Tenant
SaaS Architectures* (O'Reilly, 2024).

**Primarias técnicas:** documentación de Astro (*on-demand rendering*, *content collections*,
*live content collections*, adaptador de Cloudflare) · Cloudflare (Deploy Hooks, límites de Pages,
Cache API, purga por etiqueta) · Google Search Central (JavaScript SEO, datos estructurados con
JS, *dynamic rendering*, galería de resultados enriquecidos, políticas de datos estructurados) ·
Google Hotel Center · Stripe (webhooks, idempotencia, versionado de API) · Standard Webhooks ·
Channex (colección de webhooks) · PostgreSQL (*Row Security Policies*) · PgBouncer (*features*) ·
AWS (*Multi-tenant data isolation with PostgreSQL RLS*, *SaaS Tenant Isolation Strategies*) ·
Microsoft Azure (*Tenancy models*) · Pact · SEC, orden administrativa 34-70694 (Knight Capital).
