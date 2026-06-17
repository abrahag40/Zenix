# SEED-CLAUDE.md — Sabiduría de Ingeniería Transferible

> **Qué es esto.** Un documento semilla destilado de meses de trabajo real en un producto SaaS de producción. No contiene una sola línea específica de ese dominio: es **experiencia de ingeniería generalizada** — principios de colaboración humano↔IA, metodología de trabajo, estándares técnicos, enfoque UX/UI y, sobre todo, **anti-patrones que ya pagamos caro y no queremos repetir**.
>
> **Cómo usarlo.** Copia las secciones relevantes al `CLAUDE.md` de un proyecto nuevo y adáptalas al stack/dominio concreto. No es para leer una vez: es para **vivir dentro del `CLAUDE.md`** y gobernar cada decisión. Las reglas marcadas **(NO NEGOCIABLE)** son las que más nos costó aprender — empieza por ellas.
>
> **Por qué existe.** Cada bug que descubre el cliente erosiona confianza comercial. Cada inconsistencia visual hace que el producto "se sienta armado por varios devs". Cada parche de corto plazo deja deuda que reaparece. Este documento es el cortafuegos contra los tres.

---

## 0. La regla madre: pensar a largo plazo, no parchar el síntoma

> Origen: feedback literal del owner — *"no se trata de solucionar solo el problema del momento, se trata de tener visión para predecir eventos futuros tanto técnicos como en el flujo y modelo de negocio"* y *"solo me estás entregando soluciones que parchan el problema inicial, dejando bugs en el proceso y flujo que no revisas"*.

Toda entrega cumple 4 reglas **(NO NEGOCIABLE)**. Violarlas equivale a entregar trabajo incompleto, aunque el síntoma visible esté resuelto:

1. **Verificación funcional end-to-end ANTES de declarar "listo".** Ejecuta el flujo completo (UI dispara → backend procesa → respuesta vuelve → UI actualiza), o explicita qué rama NO pudiste verificar y por qué. Los tests automatizados cubren regresión; el smoke test cubre "esto funciona AHORA". No son intercambiables.
2. **Visión predictiva — anticipa escala y edge cases.** Toda decisión responde: *"¿qué pasa cuando esto escala 10×?"* Si la respuesta es "rompe", es deuda técnica disfrazada de feature. Pregúntate siempre: ¿qué se ve con 2 elementos? ¿con 50? ¿qué pasa cuando este campo es `null` por primera vez? ¿cuando la entidad referenciada se elimina/cancela?
3. **Coherencia sistémica obligatoria.** Prohibido renderizar UI ad-hoc cuando existe un primitive canónico. Antes de escribir un componente/función nueva, busca si ya existe una equivalente. Respeta la escala tipográfica, el color semántico y el spacing del sistema — no inventes valores intermedios.
4. **Honestidad técnica.** Si no pudiste verificar algo (servidor remoto, requiere browser real, requiere datos que no existen), DILO. Si detectas un bug en código preexistente, SEÑÁLALO (no lo silencies para no salir de scope). Si introduces deuda intencional, documéntala con un TODO.

**Checklist mental antes de cada commit:**
- ¿Verifiqué el happy path end-to-end, o solo escribí código sin probarlo?
- ¿Este diseño escala a 10× la cardinalidad esperada?
- ¿Reutilizo un primitive canónico, o estoy reinventando uno?
- ¿Mi tipografía/color/spacing coincide con el sistema?
- ¿Hay algo que no pude verificar y debo señalar?

Si cualquier respuesta es "no" → no se entrega, se reabre el ticket.

---

## 1. Principios de colaboración humano↔IA

### 1.1 Debate epistémico (NO NEGOCIABLE)

**La verdad del usuario es hipótesis, no axioma.** Aceptar pasivamente cada propuesta sin análisis es falta de profesionalismo. Puedes y debes debatir cualquier argumento con justificación sólida, con el fin de construir el mejor producto posible — sin intuición ni suposiciones.

Esto protege al proyecto de dos sesgos simultáneos: el desarrollador puede desconocer procesos estándar del dominio; el asistente puede asumir premisas de UX correctas en general pero equivocadas para el contexto específico. **El debate fundamentado neutraliza ambos.**

### 1.2 Análisis crítico antes de implementar (NO NEGOCIABLE)

Antes de cualquier decisión de implementación, arquitectura o cambio de scope:

1. **Identifica y comunica riesgos detectados** — arquitectónicos, de mantenimiento, de UX, de deuda técnica. Si la propuesta del usuario tiene un riesgo, alértalo explícitamente ANTES de proceder.
2. **Genera contrapropuestas cuando sea pertinente** — especialmente cuando la idea choca con estándares globales o introduce duplicación/fragilidad. La contrapropuesta debe respetar el insight nuclear del usuario y atacar el riesgo concreto.
3. **Justifica TODA recomendación con datos verificables** — estudios, documentación oficial, benchmarks de competidores concretos. Nunca "porque sí" ni por gusto personal.
4. **Educa mientras ejecutas** — cuando introduces una metodología, término o patrón nuevo, explica qué es, de dónde viene y por qué se elige.

**Formato de respuesta cuando hay decisión de diseño:**
- Lo que está bien en la idea (con cita).
- Riesgos detectados (con cita).
- Contrapropuesta (cuando aplica).
- Tabla comparativa cuando hay ≥2 opciones.
- Recomendación final + justificación.

### 1.3 Base de conocimiento para fundamentar

Todo argumento debería apoyarse en al menos una fuente verificable. Categorías útiles:
- **Ingeniería/UX:** Nielsen Norman Group, Baymard Institute, Apple HIG, Material Design, ISO 9241-110, WCAG 2.1 AA.
- **Psicología cognitiva:** carga cognitiva (Sweller 1988), memoria de trabajo 7±2 (Miller 1956), Ley de Hick (1952), Ley de Fitts (1954), pre-atención (Treisman 1980), Sistema 1/2 (Kahneman 2011), efecto de encuadre (Tversky & Kahneman 1981).
- **Estándares del dominio específico** del proyecto (regulatorios, fiscales, de industria) — investígalos, no los inventes.
- **Comportamiento documentado de competidores** — reseñas reales (Capterra, G2, foros), no marketing.

> **Regla de oro de las citas:** si citas un estudio o una cifra, debe ser real y verificable. Inventar una fuente es peor que no citar ninguna. Cuando no estés seguro, dilo.

---

## 2. Principios de diseño UX/UI

### 2.1 Preguntas obligatorias antes de cualquier componente UI

1. **¿Cuántos elementos simultáneos ve el usuario?** Más de ~5 → agrupa o colapsa (Sweller, Miller).
2. **¿El color comunica el estado correctamente?** Usa un sistema semántico, nunca color arbitrario.
3. **¿El flujo requiere Sistema 1 o Sistema 2?** Rutinario → mínima fricción. Destructivo → confirmación explícita (forcing function).
4. **¿El feedback es inmediato?** Toda acción con respuesta visual en ≤100ms.
5. **¿La animación tiene propósito?** Entrada vs. salida con curvas distintas. Nunca animación solo estética.
6. **¿El error es informativo?** Nunca "Error genérico". Siempre: **qué pasó + por qué + qué puede hacer el usuario** (NN/g H1+H9, Norman 1988).

### 2.2 Sistema de color semántico (adáptalo, pero ten uno)

Define tokens semánticos y NO uses color crudo fuera de ellos:
- **Verde/emerald** = positivo / disponible / éxito.
- **Ámbar/amber** = advertencia no bloqueante / en proceso.
- **Rojo/rose** = destructivo / rechazo / error.
- Un color de **acento** reservado para agrupación/identidad (ej. violeta).
- **Neutro/slate** = informativo.

Codifica estado en **canales redundantes** (color + ícono + texto), nunca solo color (WCAG 1.4.1, Treisman 1980 para escaneo pre-atento). Para distinguir N entidades del mismo tipo, deriva un color **estable por hash del ID** (no aleatorio por render) y limita la paleta a ~8 tonos mutuamente distinguibles antes de saturar (Healey & Enns 2012).

### 2.3 Animaciones — fluidez con propósito

- **Entrada** de paneles/sheets/modales: ~360-400ms con curva ease-out (entrada rápida que desacelera).
- **Salida:** ~200-220ms con ease-in (~40% más corta). La salida siempre más rápida que la entrada.
- **Sin overshoot/rebote** en elementos que se deslizan (no `y1 > 1.0` en cubic-bezier para sliding).
- **`prefers-reduced-motion` / `motion-reduce`** en TODO elemento animado (epilepsia/vértigo — WCAG).
- Define las curvas como variables CSS (`--ease-spring`, `--ease-sharp-out`) y reúsalas; no las re-declares inline.
- **Excepción operativa válida:** para herramientas de uso intensivo y rápido (dashboards, recepción, paneles de operador), **el feedback instantáneo puede prevalecer sobre el motion polish** — un operador no debería esperar un fade-in mientras un cliente espera frente a él. Decide conscientemente.

### 2.4 Wizard vs. single-screen

Un wizard multi-paso solo se justifica para tareas **largas (>20min) y poco frecuentes (<1×/semana)**. Para tareas cortas y frecuentes (<2min, muchas veces al día) el wizard es anti-patrón: usa **single-screen con secciones colapsables** (NN/g 2024 "Wizards"). Verifica qué hace la competencia: si 5 de 6 usan single-screen y solo el legacy usa wizard, esa es la señal.

### 2.5 Progressive Disclosure

Muestra lo esencial; revela lo avanzado bajo demanda (Norman 1988, NN/g 1995). Pero **nunca ocultes una advertencia bloqueante** detrás de un colapso. El signifier de "editable" (ej. lapicito) debe ser perceptible sin requerir hover — el patrón "oculto hasta hover" mata el descubrimiento.

---

## 3. Metodología de trabajo

### 3.1 Sprints acotados

Divide el trabajo en **sprints temáticos con scope cerrado**. Cada sprint vive en su propia rama, tiene un plan documentado antes de arrancar, y se cierra con: tests verdes + decisiones documentadas + bitácora actualizada. Versiona por **bloques temáticos** (v1.x.y), no por una línea v1→v2 monolítica.

### 3.2 Decisiones no-negociables numeradas (NO NEGOCIABLE)

El descubrimiento más valioso de este proyecto. Mantén en el `CLAUDE.md` una sección de **"Decisiones No-Negociables §1, §2, …"** — decisiones tomadas deliberadamente que **no se revierten sin discusión documentada**.

Cada decisión:
- Lleva un número estable (`§NN`) que se cita en código y en otras decisiones.
- Explica **qué** se decidió y **por qué** (con cita cuando aplica).
- Es append-only en espíritu: si cambia, se documenta la revisión, no se borra el histórico.

Esto convierte el conocimiento tribal en conocimiento explícito. Cuando alguien (humano o IA) está por reintroducir un patrón que ya descartamos, la decisión numerada lo detiene. **El costo de no tenerlas:** repetir 4 veces el mismo debugging (nos pasó).

### 3.3 Bitácora viva

El `CLAUDE.md` tiene una **cabecera con el estado actual** (sprint activo, rama, pendientes, último merge) y una **bitácora de cambios mayores** al pie. Esto permite recuperar contexto tras un reinicio de sesión. Convierte fechas relativas a absolutas ("la semana pasada" → "2026-06-03").

### 3.4 Separación de documentos

- **`CLAUDE.md`** = decisiones técnicas EJECUTABLES (qué patrón usar, qué no revertir, qué comando correr). Regla: si una sección crece más de ~2 párrafos sobre visión/negocio/pricing, **muévela a `docs/`** y deja un link.
- **`docs/`** = visión estratégica, ADRs, planes de sprint, runbooks de operación. Estructura por audiencia (Diátaxis): tutorial / how-to / referencia / explicación.
- **Documentación consulting-grade:** fuentes verificables, sin afirmaciones sin respaldo.

### 3.5 ADRs (Architecture Decision Records)

Para decisiones arquitectónicas con trade-offs reales (elección de motor, librería, patrón), escribe un ADR (formato MADR sirve): contexto → opciones consideradas → decisión → consecuencias → alternativas descartadas con su porqué. El ADR es permanente; documenta también el "escape hatch" (qué haríamos si la decisión sale mal).

---

## 4. Cómo desarrollar features

1. **Research competitivo primero.** Antes de diseñar un flujo, estudia cómo lo resuelven 3-6 competidores y, sobre todo, **de qué se quejan sus usuarios** (reseñas reales). El diferenciador suele estar en la queja recurrente que nadie resolvió.
2. **Busca el primitive canónico antes de crear UI nueva.** Mantén un inventario de componentes/hooks compartidos (`shared/`, `components/shared/`). Antes de escribir un par botón+modal ad-hoc, busca el `DialogActions`/`ConfirmDialog`/`StyledInput` equivalente. Si no existe el primitive que necesitas, **créalo en `shared/` con doc inline ANTES de usarlo** — no lo improvises en el caller.
3. **Un único source of truth por dato.** Estado de servidor → capa de data-fetching (no dupliques en estado local). Estado de navegación → URL params. Estado efímero → estado local. Auth/sesión → store dedicado. Nunca derives de `useState` algo que el servidor ya sabe.
4. **Usa los primitives del framework como vienen.** No reinventes contenedores/abstracciones que la librería ya provee con comportamiento correcto (ver §8.1 — nos costó 4 iteraciones).
5. **Documenta los límites asumidos** en comentarios ("grupos típicamente 2-10; >20 requiere paginación") y como decisión numerada al cerrar el sprint.

---

## 5. Cómo corregir errores

1. **Root cause, no síntoma.** Cuando un bug aparece, encuentra la causa raíz antes de parchar. Un parche que oculta el síntoma normalmente deja el bug latente y a veces crea otro. Documenta la causa raíz cuando la encuentres.
2. **El bug suele estar una capa más abajo de donde se ve.** Ejemplo real: "modal colgado" parecía un problema del modal; la causa real era un fetch sin timeout que nunca resolvía. La cura es el timeout, no habilitar un botón de escape en el modal.
3. **No silencies bugs fuera de scope.** Si al implementar X detectas un bug en Y, señálalo (y si es trivial, propónlo como tarea aparte). No lo escondas para "no salir de scope".
4. **Tests que mockean la capa equivocada ocultan fallas reales.** Si los tests unitarios mockean el HTTP/IO, un cambio que rompe la integración real pasa verde. Complementa con un smoke test contra el sistema real (o al menos contra un sandbox) para los caminos críticos.
5. **Honestidad sobre lo verificado.** Distingue siempre: "validado end-to-end en navegador" vs. "binding directo a datos verificados por HTTP, UI no capturada" vs. "tests verdes pero no probado en vivo". El owner necesita saber el nivel de confianza real.

---

## 6. Estándares técnicos transferibles

Estos patrones aplican a casi cualquier backend/fullstack. Adáptalos al stack concreto.

### 6.1 Idempotencia
Toda operación que pueda reintentarse (webhooks, jobs, pagos, provisioning) debe ser **idempotente**. Mecanismos: clave única natural en BD + verificación previa al efecto, o token de idempotencia. Verifica el mapeo en BD ANTES de cualquier `POST` a un sistema externo — "post + hope" genera duplicados que requieren limpieza manual.

### 6.2 Append-only para registros con valor legal/auditoría/financiero
Registros fiscales, de pago, de auditoría: **nunca hard-delete ni update**. Un ajuste = una entrada nueva (ej. una línea negativa que anula, con referencia a la que anula). Anonimización de PII permitida (reemplazar el valor), pero la entrada queda. Un trigger a nivel de BD que bloquee `UPDATE/DELETE` es la defensa más fuerte.

### 6.3 Transactional outbox para integraciones salientes
Para empujar cambios a sistemas externos: escribe el evento en una tabla `outbox` en la **misma transacción** que el cambio local; un worker drena la cola con reintentos. Esto garantiza que no pierdes eventos ni duplicas trabajo si el proceso crashea a mitad. Usa `FOR UPDATE SKIP LOCKED` para permitir múltiples workers sin race.

### 6.4 Retry con backoff y dead-letter
- 429 → respeta el header `Retry-After` exacto (parsea ambos formatos de RFC 7231: delta-seconds y HTTP-date), con un floor mínimo defensivo.
- 5xx/red → backoff exponencial (`2^intentos`).
- Errores terminales (401/403/404) → dead-letter inmediato (no reintentar lo que nunca va a funcionar).
- Máximo N intentos → dead-letter + **notificación visible** a un humano. Nunca un drop silencioso.

### 6.5 Strategy pattern para variantes por contexto (país, proveedor, tipo)
Cuando algo varía por país/proveedor/tipo (adaptadores de pago, fiscales, de tipo de cambio, de notificación), usa **Strategy + Registry**: una interfaz común + un registro con auto-discovery. **Agregar una variante = 1 archivo nuevo + 1 línea de registro, sin migración ni `if/else` regados.** Falla rápido (`throw`) si la config apunta a una variante inexistente.

### 6.6 Datos de configuración: seed-driven y versionados, nunca hardcoded
Tasas, catálogos, reglas regulatorias, valores que cambian con el tiempo: viven en tablas **sembradas** con `validFrom`/`validTo`, no en constantes del código. Agregar un caso = 1 fila. Quién puede editar el catálogo base vs. crear overrides debe estar controlado por rol, con `reason` + `approvedById` obligatorios en el override.

### 6.7 Aritmética monetaria con tipo decimal
**Nunca `float`/`number` nativo para dinero.** Usa el tipo `Decimal` de tu ORM/lenguaje. Define la moneda como campo aparte (ISO 4217) — no factorices la moneda dentro del enum de método de pago (`CASH_USD`, `CASH_MXN`… es anti-patrón). El monto + la moneda viajan juntos. Respeta los decimales por moneda (USD/MXN: 2; JPY/CLP: 0; KWD: 3).

### 6.8 Timezone: nunca hardcodear
Toda lógica de "día" / cortes nocturnos / agrupación por fecha usa la **timezone configurada de la entidad** vía `Intl.DateTimeFormat` (o equivalente). Hardcodear timezone o usar `startOfDay` con la TZ local del runtime es bug garantizado en producción. Cuidado con columnas `timestamp` sin tz comparadas contra `NOW()` cuando la sesión de BD no está en UTC — normaliza al mismo frame (`AT TIME ZONE 'UTC'`).

### 6.9 Multi-tenancy estricta (si aplica)
Todo `where` incluye el/los identificadores de tenant. El scope viaja en el token de sesión y se valida en un guard/middleware central, no controlador por controlador. Defense-in-depth contra IDOR: el endpoint re-verifica que el recurso pertenece al tenant activo. Nunca expongas el ID interno en URLs públicas — usa tokens opacos (hash), el ID solo viaja server-side.

### 6.10 Cliente HTTP con timeouts y estado terminal garantizado
Un único punto de entrada para HTTP en el frontend (prohibido `fetch` crudo regado). Timeouts automáticos por verbo. **Toda mutación resuelve OK o ERROR** — el estado `pending` siempre vuelve a `false`. Anti-patrón explícito: habilitar un botón de "cancelar" durante `pending` para "salir de modales colgados" — si un modal se cuelga, el bug es la falta de timeout, no el modal.

### 6.11 Recursos en tiempo real: un solo conexión por cliente
Para SSE/WebSocket: **un único singleton por pestaña**, con subscribers ligeros — nunca cada hook abre su propia conexión. Razón real que sufrimos: 3 conexiones × leaks de hot-reload agotaban el pool de 6 conexiones HTTP/1.1 del browser → los POSTs colgaban. Reconnect con backoff exponencial, cleanup en unmount, y cancelación del preflight con `AbortController` para evitar conexiones huérfanas.

### 6.12 Bounded contexts (Evans 2003)
Cada módulo es un contexto acotado. La comunicación entre módulos es vía eventos (event emitter / cola), **no imports cruzados de servicios**. Esto mantiene los módulos desacoplados y testeables. Define los constants de eventos en un punto importable sin arrastrar dependencias del módulo emisor.

### 6.13 Servicios gruesos, controladores delgados
Toda la lógica de negocio en servicios; los controladores son wrappers delgados (validan DTO, llaman al servicio, devuelven). DTOs validados declarativamente. Errores tipados (`NotFound`, `Conflict`, `Forbidden`).

### 6.14 Orden de rutas: literales antes que paramétricas
En routers donde hay ambigüedad, declara las rutas literales (`/recurso/group-checkin`) **antes** que las paramétricas (`/recurso/:id`), o la paramétrica las sombrea. Verifica esto al agregar cualquier endpoint nuevo.

### 6.15 Códigos de error machine-readable
El backend devuelve códigos de error legibles por máquina (`BALANCE_UNPAID`, `ALREADY_CONFIRMED`, …), no solo mensajes. El frontend ramifica el feedback por código (toast específico, no genérico). Distingue errores de idempotencia (no son "error rojo", son info + refetch silencioso) de errores reales.

### 6.16 Operaciones best-effort no deben bloquear el camino crítico
Si una operación secundaria (email de bienvenida, push a un sistema externo, generación de reporte) falla, **no debe tumbar la operación principal**. Ejecútala fuera de la transacción crítica, captura el fallo, persiste el estado de error para recuperación, y ofrece reintento idempotente. El usuario no debería quedar bloqueado por un 503 transitorio de un tercero.

---

## 7. Patrones UX/UI concretos

### 7.1 Confirmación de acciones destructivas (NO NEGOCIABLE)
Toda operación destructiva o de reasignación (eliminar, cancelar, mover, anular, drag&drop que muta) exige **confirmación explícita con preview** de lo que va a pasar. Nunca dispares la mutación final directo desde un drag. (Baymard: 68% de errores en confirmaciones ausentes.)

### 7.2 Nunca confirmaciones nativas del navegador
Prohibido `window.confirm`/`alert`: look&feel inconsistente por OS, bloquean el hilo, ignoran las guidelines de diseño. Usa un `ConfirmDialog` propio con tonos semánticos (warning/destructive/info/success).

### 7.3 Footer de modal canónico
Un solo primitive para el par de botones de footer: **Cancelar siempre a la izquierda (outline), Confirmar siempre a la derecha (sólido, coloreado por tono)** — flujo de lectura occidental + Apple HIG. Misma altura, mismo tamaño de texto, mismo gap. `pending` deshabilita AMBOS botones.

### 7.4 Modales anidados: usa los primitives del framework
Si un modal vive dentro de otro overlay del framework, **no inventes un contenedor `fixed inset-0` manual** — heredarás el `pointer-events:none`, el focus trap y el dismiss-layer del padre, y fallará en cascada. Usa los primitives de Dialog del framework, que soportan anidamiento nativo. (Ver §8.1.)

### 7.5 Dismiss estándar de modales
Patrón único reusable: backdrop click + Esc cierran. Si el form está "sucio" (cambió respecto al estado inicial) → confirmar antes de descartar. **`isDirty` se computa contra un snapshot del estado inicial, NO contra vacío** — si el modal pre-llena campos, comparar contra vacío da un falso "sucio" desde el primer render.

### 7.6 Feedback informativo obligatorio (NO NEGOCIABLE)
Toda operación rechazada/inválida/fallida comunica: **(1) qué ocurrió, (2) por qué, (3) qué puede hacer el usuario.** Nunca "Error genérico". Nunca fallo silencioso. (NN/g H1+H9, Norman 1988, ISO 9241-110.)

### 7.7 Empty states explícitos, nunca un guión frío
Un placeholder `—` se interpreta como "esto está roto". Muestra siempre un mensaje explícito ("Sin pendientes" + ilustración/emoji) o un `0` real. (Apple HIG Empty States.) Ilustraciones inline/SVG, sin dependencias de CDN externas.

### 7.8 Enmascaramiento de PII
Datos sensibles (documentos, tarjetas) se muestran enmascarados (`••••1234`) y SIEMPRE enmascarados en logs de auditoría. Plano solo con foco activo si el caso lo amerita (patrón Stripe Elements). Reduce la superficie de exposición (GDPR/buenas prácticas).

### 7.9 Pull-to-refresh + last-sync en móvil
En dashboards/listas móviles: `RefreshControl` + timestamp visible de "última actualización hace X". Auto-refetch ante eventos en tiempo real, sin esperar el poll. (Patrón Airbnb Host / Stripe Dashboard mobile.)

### 7.10 KPIs/dashboards adaptativos al contexto
Los indicadores no son estáticos cuando pierden valor operativo. Un bloque permanente (siempre relevante) + un bloque adaptativo que rota según hora/estado. Grafica solo lo **accionable** — un segmento que no requiere ninguna acción del usuario es ruido cognitivo, sácalo del gráfico y déjalo como dato secundario.

### 7.11 Escalamiento de notificaciones
Niveles escalonados (ambient / notification / elevated / alarm). Las tareas rutinarias nunca activan el nivel más alto (alert fatigue — Cisco Healthcare 2021). Self-suppress sistémico: **el actor que dispara una notificación nunca la recibe** (analogía redes sociales). Auto-mark-as-read tras decisión. Purga física en dos fases (activa → grace period de auditoría → delete), preservando lo que tiene valor de compliance.

---

## 8. Anti-patrones — lecciones de "qué NO hacer"

> Cada uno de estos nos costó tiempo real. Están aquí para que el próximo proyecto no los repita.

### 8.1 Reinventar contenedores que el framework ya provee
Un sprint reinventó **tres veces** un contenedor de modal con `createPortal` + div manual, cuando el framework ya proveía primitives con anidamiento nativo. Cada parche revelaba la siguiente capa interna del framework (pointer-events lock, focus trap, dismiss layer) hasta refactorizar. **Lección:** primer reflejo ante un modal/overlay/abstracción común → usar el primitive del framework, no replicar su estructura.

### 8.2 Parchar el síntoma y dejar el flujo roto
El feedback que originó la "regla madre" (§0). Resolver el error visible del momento sin revisar el flujo completo deja bugs río abajo. Verifica el flujo end-to-end, no solo el punto que falló.

### 8.3 Tests que mockean el HTTP ocultan integraciones rotas
Una integración con un tercero estaba rota en producción (resolución de IDs, payload incompleto, timezone) y los tests unitarios pasaban verdes porque mockeaban el cliente HTTP. Solo un test en vivo contra el sandbox lo reveló. **Lección:** para caminos críticos de integración, ten al menos un smoke test contra el sistema real.

### 8.4 Mocks desactualizados rompen CI en masa
Al agregar una llamada nueva a la BD en el código de producción sin actualizar los mocks de los tests, ~110 tests rompieron a la vez con el mismo error. **Lección:** cuando agregas una dependencia/llamada nueva en un servicio, actualiza los mocks de todos los specs que lo tocan en el mismo commit.

### 8.5 `continue-on-error` en CI es deuda que se acumula invisible
Marcar lint/test como `continue-on-error` para "no detener entrega" esconde capas de bugs que se acumulan. CI debe volver a ser rojo/verde binario lo antes posible. Si algo queda excluido del gate, **documéntalo explícitamente** (qué y por qué) — la exclusión silenciosa se lee como "está cubierto" cuando no lo está.

### 8.6 Estado de servidor duplicado en estado local
Derivar de estado local algo que el servidor ya sabe genera desincronización. El servidor es la fuente de verdad; el cliente lo refleja.

### 8.7 Aprobaciones bloqueantes como cuello de botella
Pedir aprobación de un superior para cada cambio operativo convierte a esa persona en cuello de botella. Prefiere **role guards + notificaciones de awareness** sobre gates de aprobación bloqueantes, salvo que el riesgo lo justifique de verdad. (Documenta cuándo sí: montos que exceden un cap, acciones irreversibles.)

### 8.8 Asumir que una feature externa "ya existe"
Documentar una decisión que da por hecho un mecanismo que **nunca se construyó** (ej. "esto dispara un MODIFY al sistema externo") crea una promesa falsa. Verifica que el mecanismo exista antes de apoyarte en él; si no existe, di la verdad y ofrece el fallback (acción manual + notificación).

### 8.9 Truncado/caps silenciosos
Si un proceso limita cobertura (top-N, sin reintento, muestreo), **registra lo que se descartó**. Un cap silencioso se lee como "cubrí todo" cuando no fue así.

### 8.10 Bloqueantes externos confundidos con bugs de código
A veces el código está bien y el bloqueante es un permiso/feature no habilitado del lado del proveedor (ej. un 403 permanente de un API en beta). Distínguelo claramente: maneja el caso con gracia (no dead-letter en bucle), notifica al humano para acción externa, y documenta que el código es correcto y el blocker es de cuenta/permisos.

---

## 9. Convenciones de código y tests

- **Tipos/enums/DTOs compartidos en un paquete único** (`shared/`). Nunca redefinir un tipo en frontend o backend si ya existe en el paquete compartido.
- **Tests descriptivos en el idioma del equipo:** `it('describe qué debe hacer')`. Builders de datos (`makeX()`). Limpia mocks en `beforeEach`.
- **Logs con el logger del framework**, no `console.log`.
- **Migraciones versionadas con rollback documentado.** Aplícalas de forma aislada cuando hay drift en la BD de desarrollo (no arrastres cambios no relacionados).
- **Secrets en variables de entorno**, nunca en el repo. Cifrado de credenciales de terceros at-rest (AES-256-GCM con KEK en env) + runbook de rotación.

---

## 10. Disciplinas DevOps desde el día 1 (no cuestan dinero)

Aunque la infraestructura sea mínima al inicio, estas disciplinas no cuestan y evitan dolor:
- Entornos separados con preview deploys.
- Migraciones versionadas + rollback documentado.
- Backups verificados periódicamente (un backup no probado no es un backup).
- Secrets en env vars.
- Observabilidad de 3 capas (métricas + logs + traces).
- Runbook de incidentes documentado para los tipos de fallo más probables.

Define **triggers explícitos** para escalar de infra (ej. "migramos a X cuando superemos N usuarios/tenants"), para no sobre-invertir antes de tiempo ni quedar cortos.

---

## 11. Cómo arrancar un proyecto nuevo con este seed

1. Copia este archivo al repo nuevo y renómbralo o fusiónalo en su `CLAUDE.md`.
2. Borra/ajusta las secciones que no apliquen al stack (ej. SSE si no hay tiempo real; multi-tenancy si es single-tenant).
3. Define desde el día 1: el sistema de color semántico, el inventario de primitives canónicos, y la sección de **Decisiones No-Negociables §** (aunque empiece vacía).
4. Establece la cabecera de "Estado actual" + la bitácora al pie.
5. Adopta la **regla madre (§0)** y las cuatro reglas de calidad como gate de cada entrega.

> **El principio que resume todo:** construir como si lo fuera a mantener otra persona dentro de un año, anticipando 10× la escala, sin dejar bugs río abajo, y diciendo siempre la verdad sobre lo que está verificado y lo que no.
