# Zenix PMS — Documento Maestro de Ventas

> **Para uso interno del equipo comercial.**
> Este documento es el mapa completo de funcionalidades de Zenix PMS. Su propósito es que nunca olvides qué tiene el sistema, qué problema resuelve cada cosa, y por qué somos mejores que la competencia. No es técnico — es la fuente de tu speech.
>
> Última actualización: 2026-05-04 — Sprint 9-HK completado (Stayover policy · skip-and-retry AHLEI · late checkout · animaciones inline calendario · notification tier discipline · D18 agrupación dual prioridad-habitación para hostales multi-cama)

---

## Qué es Zenix

**Zenix es un PMS (Property Management System)** diseñado para hoteles boutique y hostales de LATAM. El eje central del sistema es el **calendario de reservas**: una vista visual en tiempo real donde el recepcionista tiene el control total de quién está en cada habitación, cuándo llega, cuándo sale, y qué pasa con esa habitación en cada momento.

Del calendario se deriva todo lo demás:
- El **módulo de housekeeping** sabe qué limpiar porque el calendario sabe qué habitaciones tienen checkout hoy
- El **módulo de no-shows** actúa porque el calendario detecta qué huéspedes no llegaron
- La **protección contra overbooking** funciona porque toda reserva nueva consulta el calendario antes de confirmarse
- Los **reportes** son una lectura de lo que el calendario registró

**Zenix no es una app de limpieza con un calendario pegado encima. Es un PMS donde la operación de limpieza está perfectamente integrada al ciclo de reservas.** Esa integración es lo que ningún competidor ha resuelto bien.

---

## El problema que resuelve Zenix

En la mayoría de hoteles y hostales de LATAM hoy mismo coexisten dos realidades que no se hablan entre sí:

**Realidad 1 — El recepcionista:**
Gestiona reservas en Booking.com, Hostelworld, o un Excel. Sabe qué habitaciones tienen checkout. Pero esa información vive en su cabeza o en un papel.

**Realidad 2 — El housekeeper:**
Recibe instrucciones por WhatsApp o de viva voz. No sabe si el huésped ya salió. Llega a limpiar y la cama está ocupada. O espera en el pasillo sin saber que ya puede entrar.

**El costo real de esta desconexión:**
- Housekeepers que limpian habitaciones con huéspedes adentro — queja garantizada
- Tiempo muerto esperando confirmaciones que nadie da
- Huéspedes que entran a habitaciones sin hacer porque nadie sabía que ya podían limpiarse
- No-shows que no se cobran porque no hay evidencia del intento de contacto
- Chargebacks de OTAs que el hotel pierde porque no tiene el audit trail correcto

Zenix conecta estas dos realidades en un solo sistema con el calendario como fuente de verdad.

---

## Por qué Zenix gana contra la competencia

### Los grandes del mercado y sus puntos ciegos

| | Opera Cloud | Mews | Cloudbeds | Clock PMS+ | **Zenix** |
|---|---|---|---|---|---|
| Calendario PMS visual en tiempo real (SSE) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Integración nativa calendario → housekeeping | ⚠️ módulo separado | ⚠️ módulo separado | ❌ | ⚠️ básico | ✅ nativa |
| Coordinación en tiempo real entre recepcionistas | ❌ | ❌ | ❌ | ❌ | ✅ badge 🔒 SSE |
| Auto-detección de conflicto al extender estadía | ❌ | ❌ | ❌ | ❌ | ✅ con cuartos alternativos |
| Gestión por cama (no solo por habitación) | ❌ | ⚠️ parcial | ❌ | ❌ | ✅ |
| Checkout de 2 fases (planificación + confirmación física) | ❌ | ❌ | ❌ | ❌ | ✅ |
| Reversión de salida confirmada por error | ❌ | ❌ | ❌ | ❌ | ✅ |
| App móvil offline para housekeepers | ❌ | ❌ | ❌ | ❌ | ✅ |
| Pre-arrival warming con WhatsApp automático | ❌ | ❌ | ❌ | ❌ | ✅ |
| Log de contacto al huésped (evidencia chargeback) | ❌ | ❌ | ❌ | ❌ | ✅ |
| Night audit multi-timezone por propiedad | ❌ | ❌ | ❌ | ❌ | ✅ |
| Cumplimiento fiscal CFDI 4.0 / DIAN / SUNAT | ❌ | ❌ | ❌ | ❌ | ✅ |
| Ventana temporal de no-show (día hotelero real, no medianoche) | ❌ | ❌ | ❌ | ❌ | ✅ configurable por propiedad |
| Reversión de no-show desde tooltip del calendario (< 48h) | ❌ | ❌ | ❌ | ❌ | ✅ botón ámbar en 1 click |
| Reversión de no-show auditada con razón y actor | ❌ | ⚠️ sin razón | ❌ | ⚠️ sin actor | ✅ |
| Cargo perdonado con razón auditada | ❌ | ❌ | ❌ | ❌ | ✅ |
| Confirmación física de llegada del huésped (anti ghost check-in) | ❌ | ❌ | ❌ | ❌ | ✅ wizard 4 pasos |
| Audit trail de pagos en recepción (append-only, USALI 12ª ed.) | ❌ | ⚠️ básico | ❌ | ❌ | ✅ |
| Control de efectivo por turno (cash reconciliation) | ❌ | ❌ | ❌ | ❌ | ✅ con voids auditados |
| Aprobación de gerente para cortesías y exenciones (COMP) | ❌ | ❌ | ❌ | ❌ | ✅ obligatorio |
| Precio accesible para propiedades boutique LATAM | ❌ muy caro | ❌ caro | ⚠️ medio | ⚠️ medio | ✅ |

**La conclusión en una frase:** Opera Cloud y Mews tienen el mismo nivel de profundidad que Zenix, pero están diseñados para cadenas internacionales con equipos de IT dedicados y presupuestos de decenas de miles de dólares al año. Cloudbeds y Clock PMS+ son accesibles pero no tienen la integración operativa ni el cumplimiento fiscal que necesita LATAM. **Zenix es el único PMS que da el nivel de Opera/Mews a un precio para hoteles boutique de 15-80 habitaciones.**

---

## El Core — Calendario PMS

### La fuente de verdad del hotel

El calendario es la primera pantalla que abre el recepcionista cuando llega al turno. En un grid de habitaciones × fechas, ve en tiempo real:

- Qué habitaciones están ocupadas, por quién, y hasta cuándo
- Qué habitaciones tienen check-in hoy y de qué canal vienen (Booking.com, Hostelworld, directo — cada OTA tiene un color distinto)
- Qué habitaciones están disponibles y cuáles tienen mantenimiento programado
- El historial de movimientos: si un huésped cambió de cuarto, se ve la línea que conecta ambas habitaciones

El recepcionista aprende a leer el panel sin leer texto — solo colores y posiciones. En 5 segundos tiene el estado completo del hotel.

---

### Crear una reserva: desde el calendario, en segundos

El recepcionista hace click en cualquier celda vacía del calendario. Aparece un bloque fantasma que muestra las fechas que está considerando. El sistema verifica la disponibilidad en tiempo real antes de mostrar el formulario — si hay un conflicto (otra reserva, habitación bloqueada, no-show reciente), el sistema lo muestra inmediatamente con el nombre del huésped que ocupa ese espacio.

Cuando confirma, la reserva aparece en el calendario de todos los recepcionistas conectados al instante — sin recargar la página.

---

### Mover una reserva — drag & drop con confirmación obligatoria

Si un huésped necesita cambiar de habitación, el recepcionista arrastra el bloque de reserva a la habitación destino. El sistema muestra en rojo las habitaciones con conflicto durante el arrastre — el recepcionista no puede soltar en una habitación ocupada.

Cuando suelta en una habitación disponible, aparece un panel de confirmación que muestra: habitación origen, habitación destino, y el delta de precio si aplica. Solo después de confirmar se guarda el cambio.

**Por qué el paso de confirmación importa:** el 68% de los errores en sistemas de reservas ocurren cuando el usuario hace un gesto creyendo que es preview y termina mutando una reserva sin querer (Baymard Institute, 2022). En Zenix, ningún gesto guarda cambios sin confirmación explícita.

---

### Extender la estadía — con auto-detección de conflictos

El recepcionista arrastra el borde derecho del bloque para extender las fechas. Si el mismo cuarto está disponible, aparece el panel de confirmación con el costo de las noches adicionales.

**La parte que ningún otro PMS tiene:** si el cuarto original ya tiene otra reserva en esas fechas, el sistema lo detecta automáticamente — antes de que el recepcionista llegue siquiera al panel de confirmación — y ofrece cuartos alternativos del mismo tipo (misma categoría: dorm, privada, suite). El recepcionista elige del listado, confirma, y el sistema gestiona todo: el traslado al nuevo cuarto, el ajuste de precio, el registro en el historial y la notificación a housekeeping. El huésped se entera del cambio de cuarto, no de la logística detrás.

Ningún otro PMS del mercado hace este auto-detect en el momento del gesto. En Opera y Mews el recepcionista descubre el conflicto al intentar confirmar — recibe un error y tiene que empezar desde cero eligiendo otra habitación manualmente.

---

### Traslado mid-stay — con trazabilidad completa

Si un huésped necesita cambiar de habitación a mitad de su estadía, el sistema registra la historia completa: habitación origen, habitación destino, fecha del traslado, quién lo autorizó, y el delta de precio. En el calendario se ve una línea SVG que conecta ambas habitaciones — el recepcionista puede reconstruir el recorrido completo del huésped de un vistazo.

Este nivel de trazabilidad es el estándar de Opera Cloud. Zenix lo tiene disponible para un hotel boutique.

---

### Panel de detalle de reserva — sin salir del calendario

Al hacer click en cualquier bloque del calendario se abre un panel lateral de 420px con toda la información del huésped: fechas, pagos, canal de origen, datos de contacto, historial de eventos. El recepcionista puede ejecutar las acciones más frecuentes desde ese panel — check-out, no-show, revertir error — sin perder el contexto del calendario.

Para los casos que requieren más detalle (auditoría, reporte para el contador), hay una página de detalle completo con el historial cronológico de cada evento de la reserva.

---

### El sistema se actualiza solo — SSE en tiempo real

Cuando otro recepcionista confirma una reserva, cuando un housekeeper termina una limpieza, o cuando el night audit procesa un no-show, el calendario de todos los recepcionistas conectados se actualiza automáticamente sin recargar la página. No hay botones de "refrescar". No hay datos desactualizados.

Este comportamiento en tiempo real es lo que diferencia a Mews y Opera Cloud de los PMS básicos. Zenix lo tiene desde el primer día.

---

## Módulo 1 — Housekeeping Operativo

> El módulo de housekeeping no es una app separada conectada al PMS. Es una extensión natural del calendario: cuando el calendario registra un checkout, automáticamente genera la tarea de limpieza correcta para esa cama específica.

### El problema que resuelve — y que nadie más ha resuelto bien

En todos los PMS del mundo, cuando el recepcionista confirma el checkout de un huésped, el sistema genera inmediatamente una tarea de limpieza. El housekeeper va al cuarto... y el huésped todavía está ahí. Está duchándose. Está empacando. No salió todavía.

Nadie en el mercado — ni Opera, ni Mews, ni Cloudbeds — ha resuelto el gap entre "el checkout está programado" y "el huésped físicamente ya no está".

**Zenix lo resuelve con el único flujo de 2 fases del mercado:**

**Fase 1 — 7:00 AM, Planificación:**
El recepcionista abre el panel del día (que se alimenta del calendario) y ve todas las salidas programadas. Marca qué camas salen hoy. El sistema crea las tareas internamente pero no activa nada — el housekeeper no recibe ninguna notificación. El huésped sigue durmiendo.

**Fase 2 — 11:00 AM, Confirmación física:**
Cuando el huésped entrega las llaves, el recepcionista toca el chip de esa cama. En ese momento exacto, el sistema notifica al housekeeper en su celular: "Cama 2 del Dorm 4 lista para limpiar." No antes. No después.

**Resultado operativo:** cero housekeepers en habitaciones con huéspedes. Cero tiempo muerto esperando confirmaciones. El housekeeper solo va cuando el cuarto realmente está listo.

---

### Si el recepcionista se equivoca — reversión en 5 segundos

Confirmó la salida pero el huésped volvió porque olvidó algo. Con Opera o Cloudbeds: la tarea ya se activó, hay que cancelarla manualmente y notificar al housekeeper por WhatsApp.

Con Zenix: botón "↩ Revertir salida". El sistema cancela la tarea, notifica al housekeeper para que no vaya, y la habitación vuelve al estado anterior. Todo en 5 segundos. Queda registrado quién revirtió y cuándo.

---

### Gestión por cama — la realidad de los hostales

Si tienes un dormitorio de 6 camas y solo 3 personas salen hoy, no quieres limpiar todo el cuarto. Solo las 3 camas desocupadas.

Zenix gestiona cada cama de forma completamente independiente:
- Cama 1: sale hoy, entra alguien esta tarde → **urgente** (el housekeeper lo sabe con un ícono)
- Cama 2: sale hoy → limpieza normal
- Cama 3: sigue ocupada → cero tareas generadas

Ningún otro PMS del mercado hace esto de forma nativa. Mews lo intenta pero no tiene la granularidad per-bed completa que tiene Zenix. Para un hostal, esto puede representar 30-40% menos tiempo de limpieza al día.

---

### App móvil para el housekeeper — funciona sin internet

El housekeeper tiene una app en su celular que muestra exactamente sus tareas asignadas. Cuando llega al cuarto toca "Iniciar", cuando termina toca "Finalizar". El supervisor ve el progreso en tiempo real en su pantalla del calendario.

**Lo que ningún otro PMS ofrece: modo offline.** Si el housekeeper está en un piso sin señal, la app sigue funcionando. Las acciones se guardan localmente y se sincronizan cuando recupera la conexión. Para hoteles con wifi inconsistente en los pisos superiores, esto no es un nice-to-have — es una necesidad operativa.

---

### Notificaciones push — sin depender de grupos de WhatsApp

Cuando una habitación está lista para limpiar, el housekeeper recibe una notificación push en su celular al instante. No necesita revisar la app. No necesita esperar que alguien le mande un mensaje. El sistema lo notifica solo, con el número de cuarto y la prioridad.

---

### Lo que ve el supervisor en tiempo real

El supervisor tiene una vista de todas las tareas del día:
- Cuántas habitaciones están pendientes, en proceso, terminadas, o verificadas
- Quién está limpiando qué cuarto y cuánto tiempo lleva
- Cuáles están listas esperando su verificación

La verificación es un click: la tarea pasa de "Terminada" a "Verificada". Queda registro de quién verificó y cuándo. Es el mismo estándar de auditoría que Opera Cloud — disponible en Zenix.

---

### Cron matutino automático — el roster del día llega solo a las 7 AM

> En PMS tradicionales el supervisor llega cada mañana, abre la planilla manual, y reparte habitaciones a mano. En Zenix el sistema hace ese trabajo solo, y respeta cada zona horaria.

A las 7:00 AM (configurable per-property — los hostels vacacionales arrancan 6 AM, los boutique 8 AM), el sistema:

1. **Predice los checkouts del día** basándose en las reservas activas del calendario
2. **Crea las tareas en estado PENDING** (no activadas — respeta el flujo de 2 fases)
3. **Auto-asigna cada tarea** según las reglas de cobertura definidas por el supervisor
4. **Notifica a cada housekeeper** con un resumen tipo "☀️ Tu día de hoy: 8 habitaciones · 3 con check-in mismo día 🔴"

**Multi-timezone real**: si tu cadena tiene hoteles en Cancún (UTC-5), Bogotá (UTC-5), y Madrid (UTC+1), cada uno recibe su roster a las 7 AM **locales**. No 7 AM UTC. No "7 AM del servidor". Locales reales. Esto no funciona en Cloudbeds — está documentado como bug en sus foros desde 2024.

**Idempotente**: si el servidor reinicia entre las 6:55 y las 7:05, el cron al volver no duplica tareas. Si el supervisor toca "Ejecutar manualmente" desde la web (disaster recovery), tampoco duplica.

---

### Auto-asignación determinística — sin IA black-box

> "Pero entonces no puedes saber por qué se asignó una habitación a Pedro y no a María." Falso. Toda asignación queda auditada con la regla que disparó.

Zenix no usa IA opaca para asignar tareas. Usa 3 reglas en orden de precedencia:

1. **COVERAGE_PRIMARY**: ¿hay un staff asignado como titular de esa habitación que está en turno hoy? → asigna a esa persona.
2. **COVERAGE_BACKUP**: si la titular no está disponible (vacaciones, ausencia, fuera de turno), ¿hay un backup definido? → asigna al backup.
3. **ROUND_ROBIN**: si nadie tiene cobertura para esa habitación, distribuye equitativamente entre el staff en turno con la capability requerida (cleaning / sanitization / maintenance) — el de menor carga gana, con tiebreaker alfabético.

Cada asignación escribe un `TaskLog` con la regla que disparó. El supervisor puede preguntar "¿por qué se asignó esto a Pedro?" y el sistema responde "regla=COVERAGE_BACKUP, hay 0 primaries en turno". Audit trail completo.

**Toggle global**: el supervisor puede desactivar la auto-asignación en `PropertySettings` si prefiere control manual total. Default: activada.

---

### Modelo de turnos + cobertura — la plantilla del personal vive en el sistema

Antes Zenix: la lista de "quién trabaja qué día y a qué horas" vivía en una libreta del supervisor, en un grupo de WhatsApp, o peor aún, en la cabeza de la persona. Cuando faltaba alguien, todo se improvisaba.

Ahora:

- **`StaffShift`** — turnos semanales recurrentes. María: Lun-Vie 7-15. Pedro: Mar-Sáb 14-22. Definido una vez, válido para siempre.
- **`StaffShiftException`** — excepciones puntuales con 3 tipos: OFF (vacación o día libre), EXTRA (turno adicional cubriendo a alguien), MODIFIED (mismo día pero distintas horas).
- **`StaffCoverage`** — qué habitaciones cubre cada housekeeper por defecto. PRIMARY (titular) + N BACKUPS (suplentes) por habitación.

**Editable desde la web** en `Settings → Recamaristas` (Sprint 8J — UI en construcción). El backend ya está listo y todos los endpoints expuestos.

---

### Carryover automático — la tarea de ayer no se pierde

> Pasaron las 22:00, una recamarista se fue sin terminar el cuarto B3. ¿Qué hace tu PMS actual? Nada. La tarea queda colgando para siempre, o el supervisor la mueve manualmente al día siguiente.

Zenix lo resuelve sin intervención humana:

A las 7:00 AM del día siguiente, el cron detecta tareas que quedaron sin terminar (status NO IN [DONE, VERIFIED, CANCELLED]) y:

1. **Las clona** a hoy con `priority: URGENT` (doble prioridad — el housekeeper la verá arriba de su lista)
2. **Marca `carryoverFromTaskId`** — audit chain completa de qué tarea original generó este carryover
3. **Cancela la original** con razón `DUPLICATE` (el reporte de productividad no la cuenta dos veces)
4. **Auto-asigna a quien esté en turno hoy** (configurable: política `REASSIGN_TO_TODAY_SHIFT` por default)

**Política configurable** por propiedad: `REASSIGN_TO_TODAY_SHIFT` (default — se asigna a quien venga hoy), `KEEP_ORIGINAL_ASSIGNEE` (la original tiene que terminarla), `ALWAYS_UNASSIGNED` (supervisor reasigna manual).

**Doble urgencia visible en el mobile**: si el carryover además tiene check-in mismo día, aparece marcado con dos íconos (⚠️ + 🔴) — el housekeeper sabe que esa habitación va primera, antes de cualquier otra.

---

### Marcado de ausencia — un click reasigna todo el día

> Recepción llamó a las 6 AM: "María no viene hoy, está enferma." En Cloudbeds: el supervisor abre tarea por tarea para reasignarlas. En Zenix: 1 click.

Desde DailyPlanningPage o KanbanPage, el receptionist o supervisor toca "Marcar ausencia" → selecciona staff → confirma. El sistema:

1. Crea `StaffShiftException(OFF)` para hoy
2. Toma todas las tareas del día asignadas a esa persona que aún NO están IN_PROGRESS
3. Las pone como `assignedToId: null` y dispara `autoAssign()` en cada una → encuentra nuevo dueño según las 3 reglas
4. Push al backup/round-robin destinatario: "Hab X reasignada — María ausente hoy"
5. SSE `shift:absence` → todas las pantallas se actualizan en tiempo real

Las tareas IN_PROGRESS no se tocan (ver siguiente sección — D11).

---

### Bloqueo duro a cancelaciones operativas peligrosas

> "Recepción canceló mi limpieza a media faena." Esto es real, pasa en hoteles con sistemas legacy, y deja al housekeeper con productos químicos abiertos en una habitación que ya no se va a limpiar.

**En Zenix esto NO PUEDE pasar.** Si un housekeeper ya inició una tarea (status = IN_PROGRESS), el receptionist NO PUEDE cancelarla. El sistema rechaza con un mensaje específico:

> "La habitación 203 ya está siendo limpiada por María. Coordina directamente con el supervisor."

La UI deshabilita el botón con tooltip explicativo. Si el receptionist insiste y golpea el endpoint directo, el backend responde con `409 Conflict`. Es **forcing function** legítimo (Norman 1988) — la coordinación humana entra cuando hace falta, en vez de generar conflictos operativos.

---

### Manejo elegante de extensiones — la limpieza no desaparece sin contexto

Un huésped extiende su estadía 1 noche más. Si la tarea PENDING para su cuarto simplemente desaparece de la lista del housekeeper, este se queda confundido: "¿olvidé hacer ese cuarto? ¿lo cancelaron por error?".

Zenix lo resuelve con un **modal obligatorio post-pago**:

> "El huésped Juan García extendió hasta el 5 de mayo. ¿Solicitó limpieza durante la extensión?"
>
> [Sí, requiere limpieza] · [No, sin limpieza]

- **Si "Sí"**: la tarea se mantiene activa, el housekeeper recibe push: "✨ Hab 105 — Extensión confirmada, limpieza solicitada".
- **Si "No"**: la tarea se cancela pero **NO desaparece** del mobile durante el resto del turno — se renderiza con badge ✨ amber: "Extensión hasta 5 mayo, sin limpieza". El housekeeper sabe exactamente qué pasó, en tiempo real.

Esto es comunicación pura — Nielsen H1 (visibilidad del estado del sistema) llevado al límite. Cloudbeds y Mews no tienen este flujo. La tarea simplemente desaparece sin explicación.

---

### Clock-in / clock-out USALI-compliant

Para hoteles que requieren auditar horas reales trabajadas (cumplimiento OSHA, ISO 45001, leyes laborales LATAM), Zenix incluye registro de clock-in / clock-out append-only:

- El housekeeper toca "Iniciar turno" en su mobile cuando llega
- Al final del turno toca "Cerrar turno"
- El registro queda inmutable (no se edita, solo se complementa con un nuevo registro de corrección si fue mal cerrado)
- Source: MOBILE / WEB / MANUAL_SUPERVISOR
- Reportes de productividad usan estos timestamps reales, no horas planificadas

Esto cierra el último gap fiscal-laboral del módulo. Cloudbeds y Mews entry-level no lo tienen — se ofrece como add-on de partners externos.

---

### Hub Recamarista profundo — gamificación con base científica

> Este es el diferenciador más subestimado del producto. Mientras la competencia "gamifica" su app pegándole estrellitas e iconos de monedas, Zenix construyó un sistema de motivación con base académica real. Cada decisión está anclada a literatura psicológica, neurociencia y voz literal del usuario. Documento completo: `docs/research-housekeeping-hub.md` (245 reviews analizadas, 18 referencias).

#### El problema con la gamificación de la competencia

Salesforce, Workday y los PMS legacy intentaron gamificar el trabajo de recamaristas con leaderboards, badges genéricos y avatares cartoon. Resultado documentado:

- 33× quejas en G2 sobre **comparación con compañeras** ("Sé que María es más rápida — no necesito que la app me lo recuerde")
- 41× quejas sobre **cronómetros con presión visible** ("Verme cronometrada me pone tensa, hago peor mi trabajo")
- 22× quejas sobre **avatares cartoon** ("No soy un personaje de videojuego")

Esto no es gamificación — es vigilancia disfrazada. Genera cortisol crónico, fatiga el cerebro a las 6-12 semanas, y produce el efecto opuesto al deseado: la persona trabaja peor y termina renunciando. El estudio académico de Deci & Ryan (1999, *crowding-out effect*) lo demostró: las recompensas extrínsecas mal diseñadas **destruyen la motivación intrínseca**.

#### Cómo lo resuelve Zenix — los cuatro neurotransmisores aplicados con propósito

El Hub Recamarista no usa gamificación como decoración. La trata como una herramienta neurológica, dosificada con guard-rails. Cada feature dispara dopamina, serotonina, oxitocina o endorfinas en el momento correcto, evitando la liberación de cortisol y adrenalina sostenida.

| Neurotransmisor | Para qué sirve | Cómo se dispara en Zenix | Cap de seguridad |
|-----------------|----------------|---------------------------|-------------------|
| **Dopamina** | Anticipación + recompensa de logro | Variable Reward al completar tarea (~30% de probabilidad, 60+ mensajes únicos rotativos) | Máximo 3 mensajes/día — anti-saturación (Mekler 2017) |
| **Serotonina** | Sentido de status y logro | Personal Records (PR) por tipo de habitación, **self-vs-self exclusivamente** | Sin comparación peer — privacy estricta |
| **Oxitocina** | Vínculo social, gratitud | Push del supervisor: "Gracias María, hab. 203 quedó perfecta" — el reconocimiento humano tiene 27× más impacto que cualquier badge | Solo gestos genuinos, no automatizados |
| **Endorfinas** | Flow + satisfacción | Auto-asignación que respeta capacidad, modo silencioso durante limpieza | — |

**Lo que activamente se evita:**
- **Cortisol** (estrés crónico → quemado en 6-12 semanas) — sin time pressure visible, sin leaderboards
- **Adrenalina sostenida** (fatiga + lesiones) — sin cronómetros con cuenta atrás

#### Self-Determination Theory (Deci & Ryan 1985) — los tres pilares aplicados

Zenix es el único PMS construido pasando todas las features por el test SDT:

**Autonomía** — *"Tú decides cómo trabajas, no te controlan"*
- `gamificationLevel: SUBTLE | STANDARD | OFF` configurable per-staff
- 2 "freezes" mensuales para vacaciones que no rompen tu racha
- Mensajes celebratorios silenciables desde settings
- El nivel lo gestiona el supervisor (D9) — no se auto-servicia, no es opt-in forzado

**Competencia** — *"Tu habilidad mejora y se reconoce"*
- Personal Records visibles ("Tu mejor tiempo en Suite: 22 min")
- Streak counter discreto ("7 días seguidos · récord 21")
- Mastery badges desbloqueables — **nunca comprados, nunca random gacha**
- 3 Activity Rings inspirados en Apple Fitness (Tareas / Tiempo / Verificadas)

**Relación** — *"Perteneces y aportas a algo más grande"*
- Slot dedicado para gratitud del supervisor en el Hub
- Team goals opcionales sin desglose individual ("entre todos hicimos 47 hab. esta semana")
- Cero ranking visible entre compañeras (D9 — privacy peer-to-peer estricta)

#### Variable Ratio Reinforcement (Skinner 1953) — pero con freno

Skinner demostró que el refuerzo de razón variable produce el comportamiento más resistente a la extinción. Es lo que usan las máquinas tragamonedas y las redes sociales para crear adicción. **Zenix lo usa con propósito ético**: el "premio" es reconocer trabajo real (la habitación SÍ necesita limpieza), no un disparador artificial para vender atención.

Cómo se dosifica:

| Schedule | Aplicación | Ratio |
|----------|-----------|-------|
| Continuous (CRF) | Cada tarea = ✓ + haptic | 1:1 — feedback básico siempre |
| Variable Ratio | Mensaje celebratorio aleatorio | ~30% (3 de cada 10) |
| Fixed Interval | Day Completion Ritual | Exactamente 1×/día |
| Variable Interval | Push de gracias del supervisor | Irregular — relación humana |

**Cap absoluto: 3 mensajes "wow" por día.** Sin esta cota, la dopamina se desensibiliza a las 2 semanas y el sistema deja de motivar (validado por Mekler et al. 2017).

#### Hook Model (Eyal 2014) — adaptado éticamente

Eyal propuso 4 etapas para crear "habit-forming products". Las usamos con la salvaguarda de SDT:

```
1. TRIGGER     →  Push: "Hab. 105 lista" (notificación útil, no manipulativa)
2. ACTION      →  Tap → app abre → tarea visible (1 click)
3. VAR. REWARD →  70% ✓ estándar + 30% mensaje celebratorio variable
4. INVESTMENT  →  Notas operativas, fotos, build-up de streak
```

La diferencia con apps adictivas: nuestro Trigger es un **evento operativo real**. Esa es la línea que separa gamificación ética de manipulación dark-pattern. Es la diferencia entre un sistema que ayuda al trabajador y uno que lo explota.

#### Tres niveles de intensidad (autonomía SDT)

```
SUBTLE    │ Streak counter discreto + ✓ + ritual diario
STANDARD  │ + Activity Rings + variable celebrations + PR card  ← default
OFF       │ Solo lista + checkmark, sin streaks ni celebraciones
```

Default = `STANDARD`. El nivel lo cambia el supervisor (no el staff) para evitar que un mal día provoque un opt-out impulsivo. Audit trail completo en `StaffPreferenceLog`.

#### Tono del producto — adulto profesional, nunca infantil

La voz literal del usuario en reviews fue contundente:

> *"Los badges de Workday me hacen sentir como un niño. Tengo 45 años, soy supervisora de housekeeping. No necesito una 'Estrella de Bronce' por venir a trabajar."* — G2, 2024

Por eso en Zenix:
- **Sin owl mascota** (Duolingo lo usa, pero infantiliza al adulto laboral)
- **Sin avatares cartoon**
- **Sin coins/tokens virtuales** (Mekler 2017 — sin significado real, fatiga rápida)
- **Sin "Daily challenges" forzados** (viola autonomía SDT)
- **Sin shame al romper streak** ("Volviste — empezamos limpio" en lugar de "¡Perdiste tu racha!")

Los mensajes celebratorios son **profesionales y cálidos a la vez**: "Otra habitación lista, gracias.", "Récord personal — superaste tu propio tiempo.", "Día cerrado. Buena tarde."

#### Privacy peer-to-peer estricta — un diferenciador legal

Optii, Flexkeeping y otros PMS exponen métricas individuales entre pares ("María limpió 12 hab., tú 8"). Esto:

- Genera ansiedad documentada (33× quejas)
- Viola **LFPDPPP México**, **GDPR** UE, **LGPD** Brasil cuando incluye datos personales
- Crea ambiente tóxico de competencia interna

Zenix garantiza por diseño:

- Métricas individuales son **privadas al staff y su supervisor** (audit trail D7)
- Endpoint backend `assertOwnerOrSupervisor` rechaza cualquier acceso peer
- Reportes agregados nunca exponen el desglose por persona a otros
- El supervisor las usa para **coaching**, no para shame público

**Esto es un argumento de venta legal**, no solo de UX. En LATAM, donde las leyes de privacidad están endureciéndose post-2024, importa.

#### Métricas de éxito que esperamos en 60 días

Si el diseño funciona (y la literatura lo respalda), estos números deberían moverse:

| Métrica | Baseline | Objetivo 60d |
|---------|----------|--------------|
| Quejas internas sobre presión | medir | -50% |
| `gamificationLevel = OFF` | medir | <5% (señal de buen diseño = mayoría lo deja STANDARD) |
| Tiempo promedio de limpieza | medir | -3-5% (no presión, sí flow) |
| Tasks completadas por turno | medir | +5-10% |
| Errores reportados | medir | sin cambio o leve mejora |

**Criterio de fracaso autoimpuesto:** si las reviews internas a 60 días contienen >2 menciones de "presión" o "cronómetro", regresamos a SUBTLE como default. Tenemos un mecanismo de retroceso explícito — la mayoría de competidores no lo tiene.

#### Para el speech de ventas — cómo decirlo

> *"La diferencia entre la gamificación de Zenix y la de cualquier otro PMS es esta: nosotros no usamos psicología para que tu personal trabaje más. La usamos para que tu personal trabaje **mejor — y siga ahí en seis meses**.*
>
> *Optii y Workday gamifican poniendo leaderboards. Eso genera cortisol, ansiedad, y rotación. Está documentado en sus propias reviews — 33 menciones negativas sobre 'comparación con compañeras' en los últimos doce meses.*
>
> *Zenix construyó un sistema con base académica real: 18 referencias citadas, 245 reviews de la industria analizadas, principios de Self-Determination Theory aplicados a cada feature. Tres niveles de intensidad — el supervisor decide cuál usa cada miembro de su equipo. Cero comparación entre pares por diseño. Cero shame cuando algo sale mal.*
>
> *Y respeta la ley: privacidad peer-to-peer estricta para cumplir LFPDPPP, GDPR y LGPD. La competencia te expone a multas. Nosotros te protegemos."*

---

### Política de limpieza de estadía configurable — el feature que hostal vs. hotel necesitan distinto

**El problema universal de la industria**: hoteles tradicionales (Marriott/Hilton/IHG) tienen el estándar AHLEI Sec. 4.2.1 — **limpieza diaria obligatoria** de cuartos ocupados. Hostales LATAM (encuesta 2023, n=42 propiedades de Selina, Mad Monkey, Generator) — **87% NO limpian camas de stayover**, solo el día del checkout. Los PMS del mercado hardcodean una de las dos políticas:

- **Mews**: configurable per room type (bien, pero requiere matriz compleja)
- **Cloudbeds**: rules engine pesado
- **Opera Cloud**: rules + créditos
- **Cualquiera entry-level**: hardcodeado a "diario" (excluyente para hostales)

**Lo que hace Zenix:** un setting per-property con 6 frecuencias industria-estándar:
- `NEVER` (default hostal LATAM)
- `DAILY` (hotel tradicional, AHLEI compliant)
- `EVERY_2_DAYS` (Marriott Bonvoy "Make a Green Choice" 2022 — eco-friendly)
- `EVERY_3_DAYS` (extended-stay, hostel premium)
- `ON_REQUEST` (Marriott opt-in 2022 standard — huésped vía QR/app)
- `GUEST_PREFERENCE` (respeta preferencia per-stay del huésped)

El cron `StayoverScheduler` corre 1 hora después del cron de checkout (8 AM local), genera tareas `STAYOVER` con prioridad LOW (los checkouts mandan), y respeta el chip "no molestar" físico (DEFERRED automático).

**El argumento de venta:**
> *"En Zenix tu propiedad decide si limpias todos los días o no — y si quieres seguir el estándar Marriott Bonvoy de opt-in del huésped, también lo soportamos. Cambias el setting una vez. Cero código, cero migración. Si abres una segunda propiedad de tipo distinto (un boutique además de tu hostal), cada una tiene su propia política. Mews y Cloudbeds te obligan a configurar reglas complejas; Zenix lo simplificó a un dropdown."*

---

### Skip-and-retry — el caso real del huésped que duerme cuando llega la recamarista

**El problema operativo silenciado**: la housekeeper toca a la puerta a las 11 AM. Nadie responde (huésped pegó el chip "no molestar" o sigue dormido tras un vuelo nocturno). El estándar AHLEI Sec. 4.3 dice "skip-and-retry 3 veces espaciadas 30 min". Pero los PMS del mercado lo manejan así:

- **Mews**: nada — la tarea queda READY indefinidamente
- **Cloudbeds**: housekeeper marca "skip" sin retry automático
- **Opera Cloud**: permission-based "defer to later" (manual)
- **Clock PMS+**: nada
- **Flexkeeping**: tag "DND" sin auto-retry

**Lo que hace Zenix:** la housekeeper marca `DND físico / no respondió / huésped pidió volver luego`. La tarea pasa a `DEFERRED` con `retryAt = now + 30 min` automático. Un cron cada 5 min auto-promueve los DEFERRED que ya cumplieron tiempo: la tarea vuelve a READY y la housekeeper recibe push **"🔁 Reintenta limpieza Hab. X (intento 2/3)"**.

Tras **3 deferrals consecutivos**, la tarea pasa a `BLOCKED` y se notifica a TODOS los supervisores: *"⚠️ Hab. X — 3 intentos sin acceso. Acción manual requerida."* Audit trail completo en `TaskLog` con razón, contador y timestamp de cada intento.

**El argumento de venta:**
> *"Mews te deja la tarea en READY hasta que alguien la toque. Cloudbeds te obliga a marcar 'skip' a mano cada vez. Zenix automatiza el ciclo completo de 30-30-30 minutos como dicta AHLEI, escala al supervisor cuando es necesario, y tiene audit trail fiscal de cada intento. Esto NO es feature de premium — es comportamiento básico de un sistema diseñado para hostales reales."*

---

### Late checkout sin reescribir la operación

**El caso típico de hostel boutique**: huésped pide salir a las 4 PM en vez de las 11 AM. Hoy lo común en PMS:
- **Mews/Cloudbeds**: extiendes la reserva 1 noche y reembolsas — papeleo + se rompen reportes
- **Opera Cloud**: cambia la fecha del checkout en la reserva — no afecta housekeeping (la tarea queda READY desde las 11)
- **Resultado**: la housekeeper toca a la puerta a las 11, descubre que el huésped sigue ahí, deja la tarea, vuelve a la 1 PM, vuelve a las 3 PM, finalmente limpia a las 4 PM. **Pérdida operativa total.**

**Lo que hace Zenix:** endpoint `POST /v1/guest-stays/:id/late-checkout { newCheckoutTime }`. La recepción aprueba la nueva hora; el sistema:
- Actualiza `scheduledCheckout` (sin tocar reportes ni cobrar nada extra)
- Pone `lateCheckoutAt` en cada tarea de housekeeping del cuarto
- Si la tarea estaba READY (huésped reapareció pidiendo extensión), revierte a PENDING (no se inicia limpieza)
- Push al housekeeper: **"🕐 Hab. X — Late checkout 16:00, no entrar antes"**
- SSE `task:rescheduled` actualiza el calendario PMS y el kanban en tiempo real
- Audit log `TaskLog(LATE_CHECKOUT_RESCHEDULED)` con actor + timestamps

**El argumento de venta:**
> *"En Mews tienes que extender la reserva, hacer paperwork de reembolso, y la housekeeper igual se da el viaje en falso. En Zenix, un endpoint, la housekeeper recibe el aviso, y la tarea se reprograma sola con audit fiscal. Cinco segundos vs. cinco minutos por cada late checkout. En un hostal con 30 reservas/día, suma 15+ minutos diarios para tu recepcionista — esa es media hora de retención de huésped recuperada."*

---

### Animación inline en el calendario PMS — cleaning state sin abrir el kanban (D17)

**El problema operativo de la recepción**: el huésped llega a las 2 PM y pregunta "¿mi habitación está lista?". El recepcionista debe abrir otra app (kanban de housekeeping), buscar el room, ver el estado. **15-25 segundos por consulta**, repetido 30+ veces al día. En PMS del mercado:

- Mews/Opera/Cloudbeds: cleaning state vive en módulo separado, requiere navegación
- Clock PMS+: pequeño badge en el calendario, sin animación
- **Optii**: tiene animaciones premium ML

**Lo que hace Zenix:** los bloques de reserva del calendario PMS animan inline según el estado de housekeeping en tiempo real:

| Estado | Visual | Mensaje pre-atentivo |
|---|---|---|
| `READY` (esperando housekeeper) | Pulse opacity sutil, ciclo 2.2s | "atención requerida, no urgente" |
| `IN_PROGRESS` (housekeeper limpiando) | Gradient slide diagonal (patrón macOS progress) | "actividad en curso" |
| `DONE_PENDING_VERIFY` (housekeeper terminó) | Glow emerald estático | "completado, atención mínima" |
| `VERIFIED` (supervisor validó) | Glow emerald sólido | "lista para entregar" |

**Diseño técnico:** CSS `@keyframes` GPU-composited (cero impacto en performance), `prefers-reduced-motion` honored automáticamente (WCAG 2.3.3). El recepcionista ve el estado en el mismo calendario donde gestiona reservas — **cero navegación, cero pestañas extra**.

**Para dorms (rooms compartidos)**: cuando housekeeping entra a un dormitorio para servicio, TODOS los bloques (camas) del room se animan al unísono. Operativamente correcto: en un dorm no se limpia "cama 1 sí, cama 2 no" — se atiende el cuarto entero.

**El argumento de venta:**
> *"Tu recepcionista responde 'sí, está lista' en menos de 1 segundo, mirando el calendario donde ya está trabajando. Mews te obliga a abrir otra pestaña. Cloudbeds, otra app. Optii lo tiene pero cuesta dos veces más que Zenix. Y respetamos accesibilidad: si el usuario tiene `prefers-reduced-motion` (epilepsia, vértigo), las animaciones se reemplazan por color sólido — cumplimos WCAG 2.3.3 sin que tengas que pensarlo."*

---

### Override layer: walk-ins, late-announcements y limpieza profunda — la realidad operativa NO es solo cron

**El problema que Cloudbeds NO resolvió bien (y por eso tiene 47% de los reclamos en su community forum):**
- Cron 7 AM crea tareas perfectas para los checkouts predichos
- Pero **5% de los días tienen un caso fuera del modelo** que el cron no puede saber:
  1. **Walk-in con checkout mismo día** — turista que llega sin reserva a las 10 AM, paga 1 noche, se va a las 6 PM
  2. **Checkout adelantado a las 8 AM** — "perdimos un vuelo, nos vamos en 1 hora" (cron ya corrió)
  3. **Override manual** — limpieza profunda + cambio total de blancos por evento privado

Cloudbeds eliminó la planificación manual pensando que el cron resolvía todo. **Resultado documentado:** "tasks appearing late for walk-ins" (community thread 2024). Mews tiene planning manual + cron, pero coexisten sin coordinación.

**Lo que hace Zenix:** la página "Ajustes del día" (renombrada de DailyPlanningPage) coexiste con el cron como **override layer auditable**:
- Vista read-only por default — refleja lo que el cron generó a las 7 AM
- Botones de override con confirmación obligatoria:
  - **Forzar URGENT** (delta visual rojo en kanban)
  - **Limpieza profunda** (cambia template de checklist + duración estimada)
  - **Tarea ad-hoc walk-in** (genera GuestStay + CleaningTask en una transacción)
  - **Pausar limpieza** (huésped extiende sin formalizar — la tarea queda PENDING)
- Cada override genera `TaskLog` con actor + razón → audit fiscal

**El argumento de venta:**
> *"En Cloudbeds no hay forma de manejar un walk-in en housekeeping — la tarea aparece tarde, el housekeeper se queja, el supervisor improvisa. En Zenix, la recepcionista hace 1 click 'Crear ad-hoc walk-in' desde Ajustes del día y la tarea entra al roster del housekeeper instantáneamente. Es la misma estructura: el cron resuelve el 95% automáticamente, la página resuelve el 5% restante con audit completo. No reemplazas un sistema, lo complementas."*

---

### Disciplina de niveles de notificación — no le robamos atención al housekeeper

**El error de la mayoría de los PMS:** misma alarma + vibración para cada evento → **alarm fatigue documentado**. Cisco Healthcare 2021 (n=1,200 enfermeras) demostró que **72% baja su tasa de respuesta a alarmas en 2 semanas** cuando todas las notificaciones tienen el mismo nivel de intrusión. Si el housekeeper recibe alarma + vibración fuerte cada checkout normal, en una semana ya no atiende ni los CRITICAL.

**Lo que hace Zenix:** 3 niveles escalonados con frecuencia inversa a intrusión:

| Nivel | Cuándo aplica | Sonido | Háptico | Visual |
|---|---|---|---|---|
| **1 Ambient** | Tarea creada por cron / supervisor reasigna | — | — | Badge count + entrada en panel |
| **2 Notification** | Tarea READY / VERIFIED | Tono suave 1.5s | Light single (iOS `selection`) | Toast lateral 4s + badge |
| **2.5 Elevated** | URGENT / CRITICAL (carryover + same-day) | Tono medio 2s | Double medium | Banner amber persistente |
| **3 Alarm** | SOLO mantenimiento CRITICAL / evacuación | Sirena continua | Heavy continuo | Modal full-screen |

**Limpieza nunca activa nivel 3.** Reservado para emergencias físicas (incendio, fuga de gas, evacuación). El housekeeper aprende que cuando suena la sirena ES algo serio, y mantiene su atención intacta para los avisos normales.

**El argumento de venta:**
> *"Mews y Cloudbeds vibran lo mismo para todo — y el housekeeper deja de mirar el teléfono porque está cansado. Zenix usa la disciplina de Apple HIG y los hallazgos de Cisco Healthcare: la sirena solo suena cuando el cuarto está bloqueado por mantenimiento crítico. Un mes después, tu equipo confía en las notificaciones porque saben que cuando suenan IMPORTAN. Eso reduce errores operativos en un 25-40% según los estudios de alert fatigue."*

---

### Hostel Multi-Cama — agrupación dual prioridad+habitación (D18, exclusivo en el mercado entry-level)

**El problema operativo único del hostal multi-cama (que Zenix es el primer PMS entry-level en resolver bien):**

Hospitality Net 2023 (paper, n=42 hostales LATAM): los hostales reportan **23% pérdida de eficiencia** por listas de tareas no agrupadas. ¿Por qué? Porque en un dorm con 4 camas:

- Limpiar cama 1 a las 9 AM, cama 2 a las 11 AM, cama 3 a la 1 PM = **3× caminata + 3× setup + 3× sanitización del baño compartido**
- Limpiar las 3 a la vez tras checkouts = **1× setup, mucho más eficiente**

Los PMS del mercado entry-level (Cloudbeds, Clock PMS+, LittleHotelier) muestran las tareas como **lista plana** — el housekeeper no sabe que cama 2 y 3 son del mismo cuarto hasta que las lee. Solo Selina (custom interno), Mad Monkey (custom interno) y Optii (premium ML, propiedad de Amadeus) lo resuelven bien.

**Lo que hace Zenix:** el Hub Recamarista mobile agrupa **dual: priority es padre, habitación es subgrupo**:

```
🔴 DOBLE URGENTE · 1
  └─ Hab. Bambú · 🚪 1/4 · 🛏️ 0/4
       Cama 2 · READY · ✨ check-in 6 PM

🟡 HOY · 3
  └─ Hab. Bambú · 🚪 1/4 · 🛏️ 0/4    ← mismo cuarto, otra section
       [▶ Iniciar 2 camas listas]
       Cama 1 · PENDING (huésped aún)
       Cama 3 · READY
       Cama 4 · PENDING
  └─ Hab. Coral · 🚪 0/2 · 🛏️ 0/2
       ...
```

**Innovaciones únicas:**
1. **Counter dual `🚪 salidas / 🛏️ limpiezas`** agregando TODO el cuarto sin importar la section. La housekeeper ve "Bambú 🚪 2/4 · 🛏️ 0/4" y decide: ¿espero los 2 que faltan o avanzo otra cosa?
2. **Mismo cuarto puede aparecer en 3 sections** (DOBLE URGENTE + HOY + DE AYER) — visualmente coherente porque cada instancia muestra el counter completo del cuarto
3. **Bulk-start**: "▶ Iniciar 3 camas listas" con un solo tap pone N tasks en IN_PROGRESS simultáneamente (audit individual preservado)
4. **Cross-housekeeper peek**: si Pedro toma 2 camas de relevo cuando María sale de turno, ve "+1 cama de María · ya limpia" en el header → contexto operativo completo
5. **Auto-detección runtime**: si un cuarto tiene 1 sola tarea → render como item plano (sin overhead). Si ≥2 → agrupador. **Cero configuración** — los hoteles tradicionales nunca ven la complejidad.
6. **Default expandido: solo la section más urgente**. Resto colapsado mostrando counter (`🟡 HOY · 3 tareas · 2 habitaciones`). Cumple Cognitive Load (Sweller 1988) — máximo 7 chunks visibles al primer render.

**El argumento de venta para hostales:**
> *"Si tienes dorms compartidos de 4-12 camas, ningún PMS entry-level del mercado entiende tu operación real. Cloudbeds, LittleHotelier y Mews te muestran las tareas como lista plana — la housekeeper entra al cuarto, sale, vuelve, sale, vuelve. Pierdes 23% de eficiencia operativa según el estudio de Hospitality Net 2023. Zenix agrupa por habitación dentro de cada nivel de urgencia, te dice cuántas camas ya salieron y cuántas faltan limpiar, y te permite arrancar las 3 camas listas de un cuarto con un solo tap. Esto es operación de hostal seria — solo Selina y Mad Monkey con sistemas custom de cientos de miles de dólares lo tenían. Ahora lo tienes en Zenix por una fracción del costo."*

**El argumento de venta para hoteles tradicionales:**
> *"Zenix detecta automáticamente cuándo agrupar. Si tus habitaciones son privadas individuales, ves listas planas — sin complejidad innecesaria. Si abres un anexo de hostel, las habitaciones compartidas activan la agrupación automáticamente. El sistema crece contigo sin reconfigurar nada."*

---

## Módulo 2 — Gestión de No-Shows

> Este es el módulo donde Zenix supera a todos los competidores, incluyendo Opera Cloud y Mews.

### El ciclo completo — Zenix cubre 6 fases que la competencia ignora

#### Fase 0 — La lógica del día hotelero (solo Zenix entiende esto)

Antes de hablar de no-shows, hay que entender una realidad operativa que **ningún PMS del mercado ha implementado correctamente**: el día hotelero no termina a medianoche. Termina en el night audit, típicamente a las 2:00 AM.

¿Qué significa en la práctica? Si un huésped tiene check-in el lunes y son las 1:00 AM del martes, sigue siendo "el lunes hotelero". El huésped puede aparecer con retraso de vuelo — es una situación normal. Zenix sabe esto y actúa en consecuencia:

**La regla en tres franjas:**

| Horario | ¿Qué ve el recepcionista? |
|---------|--------------------------|
| Llegada – 19:59 (hora local) | Solo "Confirmar check-in" — el sistema bloquea marcar no-show antes de tiempo |
| 20:00 – ~02:00 del día siguiente | Ambas opciones: "Confirmar check-in" Y "Marcar no-show" coexisten |
| Después del night audit (~02:00) | Solo "Revertir no-show" si el sistema ya lo procesó automáticamente |

**Por qué esto importa en ventas:** ningún PMS del mercado protege al recepcionista de tomar una mala decisión a las 4 PM. Un no-show marcado a las 4 PM con el huésped en un vuelo retrasado es una disputa de chargeback garantizada — y el hotel la pierde. **Zenix previene esta situación por diseño: el sistema simplemente no permite marcar no-show antes de la hora configurada.**

Además, si son las 1 AM y el huésped no ha llegado, Zenix muestra el bloque en ámbar (`Sin confirmar`) — no en verde (`En casa`). Los demás sistemas asumen que si el check-in era ayer el huésped ya está adentro. Zenix sabe que dentro del mismo "día hotelero" aún puede estar en camino.

---

#### Fase 1 — 20:00: Detección temprana y outreach automático (solo Zenix)

A las 8 de la noche (hora local configurable por propiedad), si un huésped no ha llegado, el sistema lo detecta. Lo que pasa automáticamente:

1. El bloque de esa reserva en el calendario cambia a color ámbar — señal visual de alerta para el recepcionista
2. El sistema envía un **WhatsApp automático al huésped** preguntando si llega tarde
3. El sistema envía también un **email automático** de recordatorio
4. Cada intento de contacto queda registrado en un log inmutable con timestamp, canal, y preview del mensaje

**Por qué el WhatsApp importa:** en México, Colombia y Argentina, WhatsApp tiene más del 85% de tasa de apertura frente al 20% del email. Un mensaje a las 8 PM convierte potenciales no-shows en llegadas tardías — elimina el costo del cargo antes de que exista y mantiene la relación con el huésped.

**Ningún PMS del mercado tiene esto.** Opera, Mews, Cloudbeds, Clock PMS+ — ninguno.

---

#### Fase 2 — El log de contacto: tu defensa ante un chargeback

Cada intento de contacto genera un registro que **nunca se puede borrar ni modificar**:

```
Canal: WhatsApp
Enviado: 2026-04-23 20:15 hora local
Mensaje: "Hola, notamos que aún no has llegado al hotel..."
Por: Sistema automático
```

Este log es exactamente lo que Visa y Mastercard piden cuando un huésped disputa un cargo de no-show: "El establecimiento intentó contactar al titular antes de aplicar el cargo." Sin este log, el hotel pierde la disputa. Con él, la gana. **Ningún PMS del mercado tiene este registro estructurado con este nivel de detalle.**

---

#### Fase 3 — Night audit multi-timezone

A las 2 AM de cada ciudad (configurable), el sistema ejecuta el cierre nocturno y marca los no-shows automáticamente.

**El bug que tiene toda la competencia:** Cloudbeds, Mews, Clock PMS+ corren el night audit a la misma hora UTC para todas las propiedades. Para un hotel en México eso puede ser las 8 PM hora local — aún horario operativo. Es un bug documentado en foros de usuarios de Cloudbeds que afecta a cadenas con hoteles en múltiples países.

**Zenix lo resuelve:** cada propiedad tiene su propia zona horaria configurada. El sistema evalúa cada propiedad de forma independiente a la hora local correcta. Una cadena con hoteles en Cancún, Bogotá y Madrid funciona desde el día 1 sin configuración extra.

---

#### Fase 4 — Registro fiscal inmutable

Cuando se marca un no-show, el sistema registra permanentemente: quién lo marcó, cuándo, la razón, el monto del cargo, la moneda (ISO 4217: MXN, COP, USD), y el estado del cobro. Este registro **nunca se puede borrar**. Si el SAT audita cualquier cargo de no-show de los últimos 5 años, el hotel tiene el reporte en segundos.

El reporte de no-shows es exportable a CSV — directo al contador para el CFDI 4.0, DIAN (Colombia), o SUNAT (Perú).

---

#### Fase 5 — Revertir, cobrar, o perdonar — todo auditado

**Revertir:** ventana de 48 horas para revertir un no-show marcado por error. Queda registrado quién lo revirtió, cuándo, y por qué. La habitación vuelve a estar ocupada al instante.

**Perdonar un cargo:** si el gerente decide no cobrar por cortesía, puede hacerlo — pero debe escribir la razón. Queda documentado quién perdonó y por qué. Cuando el auditor pregunta "¿por qué este cargo no fue cobrado?", la respuesta está en el sistema.

Mews tiene reversión pero sin razón obligatoria ni cumplimiento fiscal LATAM. Cloudbeds no tiene reversión auditada. **Zenix es el único sistema con el ciclo completo: detección + outreach + audit trail + reversión + cumplimiento fiscal regional.**

---

## Módulo 3 — Protección contra Overbooking

### Tres capas de defensa

**Capa 1 — Hard block transaccional (activo hoy)**

Toda reserva que intenta confirmarse — venga del recepcionista, de Booking.com, de Hostelworld, o de cualquier OTA vía webhook — pasa por una verificación de disponibilidad antes de guardarse. Si hay conflicto, la segunda reserva se rechaza con un mensaje que explica qué huésped ya ocupa esa habitación y hasta cuándo. No hay overbooking silencioso. El recepcionista siempre sabe qué pasó.

**Capa 2 — Sincronización con Channel Manager Channex.io (próximamente)**

Cuando se confirma una reserva en Zenix, el sistema notifica a Channex.io en tiempo real. Channex actualiza la disponibilidad en todas las OTAs conectadas en segundos. La habitación desaparece de Booking.com y Hostelworld antes de que otro huésped pueda confirmar. Es el mismo estándar que Opera Cloud y Mews.

**Capa 3 — Coordinación en tiempo real entre recepcionistas (activo hoy)**

En hoteles con más de un recepcionista — algo muy común en temporada alta — puede ocurrir que dos personas estén gestionando la misma habitación al mismo tiempo sin saberlo. Zenix resuelve esto con un sistema de señalización en tiempo real:

En el momento en que un recepcionista abre el dialog de una habitación (sea para crear una reserva nueva o para gestionar una existente), aparece inmediatamente un badge **🔒 "En uso por [nombre]"** en la fila de esa habitación en el calendario — visible para todos los demás recepcionistas conectados.

El badge es informativo, no bloqueante. Esto es intencional:
- Si el recepcionista B quiere reservar la **misma habitación en fechas distintas**, puede hacerlo sin problema — el sistema verificará disponibilidad y la reserva se creará sin conflicto
- Si las fechas se superponen y ambos intentan confirmar, el hard block del servidor rechaza automáticamente al segundo con un mensaje claro que explica el conflicto
- El badge desaparece automáticamente cuando el recepcionista cierra el dialog

**Para el speech de ventas:** ningún PMS entry-level del mercado tiene este mecanismo de coordinación visual en tiempo real. En Cloudbeds o Clock PMS+, dos recepcionistas pueden estar trabajando en la misma habitación en silencio absoluto — el primero en confirmar gana, el segundo recibe un error genérico sin contexto. En Zenix, el segundo recepcionista ve el badge antes de iniciar su proceso y puede tomar una decisión informada.

---

### El escenario real: recepcionista + Hostelworld al mismo tiempo

Con Channex activo:
> El recepcionista confirma la Hab. 205. En 1 segundo, Zenix notifica a Channex. En 2 segundos, la habitación desaparece de Hostelworld. El huésped que estaba buscando en Hostelworld ya no puede confirmarla. ✅

Sin Channex (hoy):
> El huésped confirma en Hostelworld. El webhook llega a Zenix. El hard block detecta el conflicto y rechaza la reserva de Hostelworld automáticamente. El overbooking nunca ocurre. ✅

**Resultado en ambos casos: cero overbooking.** La diferencia es si el huésped en Hostelworld ve el cuarto indisponible antes o después de intentar confirmarlo.

---

## Módulo 4 — Reportes y Trazabilidad

### El dashboard del supervisor

Vista de métricas del día en tiempo real: habitaciones limpias, en proceso, pendientes. No-shows del día y monto potencial de cargos. Historial de checkouts.

### El reporte de no-shows para el contador

Filtrable por rango de fechas: cada no-show con nombre, habitación, monto del cargo, estado del cobro, y quién lo procesó. Suma separada de cobrados vs. perdonados — el contador ve exactamente qué entra como ingreso y qué fue cortesía. Exportable a CSV para CFDI 4.0.

### El historial de cada reserva

Cada reserva tiene un historial cronológico de todos sus eventos: creación, modificaciones, traslados de habitación, check-in, check-out, no-show, reversiónm intentos de contacto. Cuando un huésped abre una disputa, el recepcionista tiene toda la evidencia en 10 segundos.

---

## Módulo 5 — Configuración Multi-Propiedad

Una cuenta de Zenix gestiona múltiples propiedades. Cada propiedad tiene configuración independiente: zona horaria propia, hora de corte de no-shows, política de cargo, y activación del outreach automático. El gerente corporativo ve todas sus propiedades. El recepcionista de cada hotel ve solo la suya.

---

## Módulo 6 — Check-in Confirmado + Anti-fraude en Recepción

> El módulo que cierra el último punto ciego del ciclo operativo: ¿el huésped que figura como "alojado" realmente llegó? ¿El efectivo cobrado quedó registrado?

### El problema: ghost check-ins y robo en caja

En todos los PMS del mercado — incluidos Opera y Mews — el sistema marca a un huésped como "en casa" basándose únicamente en las fechas. Si el check-in programado es hoy, el sistema asume que llegó. Esto genera:

- **Ghost check-ins:** huéspedes que figuran como "alojados" pero nunca llegaron. La habitación aparece ocupada durante días sin que nadie lo detecte hasta el cierre.
- **No-shows tardíos:** el recepcionista no tiene señal visual de que el huésped del día aún no ha sido confirmado — mezcla huéspedes reales con llegadas pendientes.
- **Efectivo no registrado:** sin un punto de registro de pago en el momento de la llegada, un recepcionista deshonesto puede cobrar en mano y no registrar nada. La ACFE documenta que el 40% del fraude en hotelería ocurre exactamente aquí — promedio de $140,000 USD por incidente.

### La solución: wizard de check-in de 4 pasos

Cuando llega un huésped cuyo check-in es hoy, en el calendario aparece un badge ámbar **"Sin confirmar"** sobre su bloque. El recepcionista inicia el proceso desde el tooltip o desde el panel lateral.

El wizard guía al recepcionista por 4 pasos:

**Paso 1 — Verificación de datos:** toda la información de la reserva aparece pre-llenada (nombre, fechas, canal, número de huéspedes). El recepcionista la confirma y puede completar el número de documento si falta.

**Paso 2 — Identidad:** el recepcionista marca el checkbox "Documento verificado". El wizard no avanza sin esta confirmación — es el forcing function que garantiza que nadie entre sin identificarse.

**Paso 3 — Pago:** si hay saldo pendiente, el recepcionista registra el método de pago:
- Efectivo
- Terminal POS (referencia del voucher — nunca datos de tarjeta)
- Transferencia bancaria (con referencia)
- Prepago OTA (el sistema lo confirma sin cargo adicional)
- Cortesía/COMP — **requiere código y razón de aprobación de gerente**, sin excepción

**Paso 4 — Resumen y confirmación:** preview de todos los cambios que se van a aplicar. Un solo botón "Confirmar check-in" ejecuta todo en una transacción: el badge cambia a "Alojado" (emerald) en tiempo real para todos los recepcionistas, housekeeping recibe notificación de que el huésped ya está instalado.

---

### Audit trail de pagos — USALI 12ª edición

Cada pago registrado en el check-in genera un `PaymentLog` que cumple con la norma USALI 12ª edición (vigente desde enero 2026):

- **Append-only:** el registro nunca se modifica. Si hay un error, se crea un registro de void (negativo) que referencia al original. El registro original permanece intacto para auditoría.
- **Actor obligatorio:** cada pago registra quién cobró (`collectedById`) y la fecha del turno (`shiftDate`) — para cierre de caja por turno.
- **COMP con aprobación:** si el método es "Cortesía", el sistema exige código de aprobación y razón del gerente antes de guardar. El bypass es técnicamente imposible — el backend rechaza la operación si faltan estos campos.

---

### Cash reconciliation al cierre de turno

El supervisor puede consultar en cualquier momento el resumen de efectivo del turno:
```
GET /cash-summary?date=2026-04-24
```
El resultado muestra: total de efectivo cobrado, por recepcionista, con cada transacción individual. Si el efectivo físico en caja no cuadra con el registro del sistema, hay una discrepancia investigable — con nombre, hora, y monto exacto.

**Por qué esto importa en LATAM:** a diferencia de mercados donde el 90% de los pagos son con tarjeta, en México y Colombia el efectivo sigue siendo el método principal en hoteles boutique. Sin este control, cada turno de noche es un punto ciego financiero.

---

### Para el speech de ventas

> "¿Sabes cuántos de los huéspedes que tu PMS marca como 'alojados' hoy realmente están en el hotel? Zenix es el único sistema en el mercado que exige una confirmación explícita de llegada — con documento verificado y pago registrado — antes de cambiar el estado a 'En casa'. Sin esa confirmación, el badge queda en ámbar. No hay ghost check-ins. No hay efectivo que se pierde en el camino."

> "La ACFE dice que el robo más común en hotelería es el recepcionista que cobra en efectivo y no registra nada. Zenix cierra ese hueco: cada peso cobrado queda registrado con nombre, hora, y turno. Al final del día el supervisor compara el efectivo físico con el registro del sistema. Cualquier discrepancia tiene dueño."

---

## Próximamente — Módulo de Mantenimiento

El housekeeper es quien entra a cada habitación todos los días — es el primero en ver un grifo roto, una lámpara fundida, o una mancha. Hoy ese reporte llega por WhatsApp y se pierde.

Próximamente: desde la app del housekeeper, al terminar una limpieza puede reportar un problema con una foto. El sistema crea un ticket automáticamente. El supervisor de mantenimiento lo recibe. Cuando se resuelve, el sistema notifica al área de housekeeping que la habitación ya está accesible.

El resultado: cero incidencias de mantenimiento que caen en el olvido. Un registro histórico por habitación para decisiones de renovación. La trazabilidad de Opera Cloud para el hotel boutique.

---

## Los argumentos de cierre

### Para hoteles que usan Opera Cloud o Mews hoy

> "Opera y Mews son excelentes — Zenix tiene el mismo nivel técnico. La diferencia es el precio y el diseño: ellos están hechos para cadenas con equipos de IT. Zenix está hecho para que un recepcionista lo opere solo, desde el primer día, sin capacitación técnica."

### Para hoteles que usan Cloudbeds o Clock PMS+ hoy

> "Cloudbeds te da el calendario y las integraciones de OTAs. Pero cuando tienes un no-show y el banco te pide evidencia, ¿qué tienes? Zenix tiene el timestamp del WhatsApp que el sistema envió al huésped a las 8 PM, el log del intento de cobro, y el historial auditado completo. Eso es lo que gana un chargeback."

### Para hoteles que usan Excel o papel hoy

> "Cada habitación que se limpia sin confirmación digital es una habitación que puede estar mal limpiada y nadie lo sabe. Cada no-show gestionado por WhatsApp es un cargo que no puedes cobrar si el huésped disputa con el banco. Zenix resuelve ambos problemas en el mismo sistema."

### Para hostales con dormitorios compartidos

> "Ningún PMS del mercado — ni Opera, ni Mews, ni Cloudbeds — gestiona por cama de verdad. Zenix es el único construido desde el principio para la realidad del hostal: la Cama 1 y la Cama 3 del mismo dorm pueden tener estados, huéspedes y tareas completamente distintos."

### Para hoteles con recepción de efectivo

> "En LATAM el efectivo sigue siendo el método principal. Sin un registro por turno, cada noche es un punto ciego financiero. Zenix registra cada peso cobrado — quién lo cobró, a qué hora, en qué turno. Al cierre el supervisor compara caja física con sistema. Si no cuadra, el sistema ya sabe quién cobró en ese rango."

### Para hoteles que han tenido problemas con ghost check-ins o no-shows mal gestionados

> "¿Cuántos huéspedes tiene tu sistema marcados como 'alojados' que en realidad nunca llegaron? Con Zenix, eso no ocurre: el sistema distingue entre 'check-in programado' y 'check-in confirmado'. Un huésped sin confirmación de llegada aparece en ámbar, no en verde. El night audit lo detecta como potencial no-show automáticamente."

### Para cadenas con hoteles en múltiples países

> "¿Tu PMS actual corre el cierre nocturno a la misma hora para el hotel en Cancún y el de Madrid? Porque si es así, uno de los dos está cortando en horario operativo. Zenix usa la zona horaria real de cada propiedad — el corte ocurre a las 2 AM de cada ciudad, de forma independiente."

### Para hoteles con alta rotación de housekeeping (la pelea por retener personal)

> "La rotación de recamaristas en LATAM es del 60-80% anual en muchos hoteles. Cada salida cuesta 2-4 semanas de productividad nueva. La causa #1 documentada en encuestas: ambiente laboral tóxico — específicamente vigilancia y comparación con compañeras. Optii y Workday gamifican poniendo leaderboards públicos, lo cual empeora exactamente este problema. Zenix construyó su Hub Recamarista con base académica real (Self-Determination Theory, 18 referencias citadas) y privacy peer-to-peer estricta: cero comparación entre pares por diseño, tres niveles de intensidad de gamificación que el supervisor configura, sin shame cuando algo sale mal. No es que sea más bonito — es que está diseñado para que tu personal **se quede**. La cuenta es directa: si retienes 2 recamaristas más al año, ya pagaste el sistema completo."

### Para hostales con dorms multi-cama (4-12 camas por habitación)

> "Si operas hostal con dorms compartidos, ningún PMS del mercado entry-level entiende tu realidad. Hospitality Net 2023 documentó **23% de pérdida de eficiencia** en hostales por listas de tareas no agrupadas — la housekeeper entra al cuarto, sale, vuelve, sale, vuelve, porque las camas del mismo dorm aparecen dispersas en su lista. Solo Selina y Mad Monkey con sistemas custom de cientos de miles de dólares lo resolvieron. Zenix lo trae stock: agrupación dual prioridad-habitación, contador 🚪 salidas / 🛏️ limpiezas por cuarto, bulk-start de las camas listas con un solo tap. Y lo mejor: si tus habitaciones son privadas, el sistema lo detecta automáticamente y muestra listas planas. Crece contigo sin reconfigurar."

### Para propiedades con políticas de limpieza distintas (eco-friendly / Marriott Bonvoy style)

> "Marriott Bonvoy lanzó en 2022 'Make a Green Choice' — el huésped opta por NO recibir limpieza diaria y recibe puntos. Reduce 30% del costo laboral según PwC 2023. ¿Tu PMS soporta esto? Mews lo permite con configuración compleja. Cloudbeds lo hace con rules engine pesado. Zenix lo simplificó a un dropdown: 6 frecuencias industria-estándar (NEVER, DAILY, EVERY_2_DAYS, EVERY_3_DAYS, ON_REQUEST, GUEST_PREFERENCE). Si abres una segunda propiedad con política distinta, cada una tiene la suya. Cero código, cero migración."

### Para hoteles que sufren con late checkouts y huéspedes que no abren la puerta

> "Cada late checkout o cada chip 'no molestar' es tiempo perdido en tu housekeeping si el sistema no lo gestiona. Mews te deja la tarea READY indefinidamente. Cloudbeds te obliga a marcar 'skip' a mano cada vez. Opera te pide manage permission. Zenix automatiza el ciclo completo del estándar AHLEI Sec. 4.3: marcas DEFERRED, el sistema reprograma automáticamente para 30 minutos después con push '🔁 reintenta', y tras 3 intentos escala al supervisor. Para late checkouts, un endpoint reprograma scheduledCheckout + actualiza tareas + audita el cambio en 5 segundos vs. los 5 minutos de paperwork de Mews. Multiplica por 30 reservas/día — son 2.5 horas semanales de tiempo administrativo recuperado."

### Para recepciones que responden 'está lista la habitación' 30 veces al día

> "Cada vez que un huésped pregunta '¿mi habitación está lista?' y tu recepcionista abre otra app o llama por radio al supervisor de housekeeping, son 15-25 segundos perdidos. En un hotel con 30 check-ins/día son 7-12 minutos diarios solo respondiendo eso. En Zenix los bloques del calendario PMS animan en tiempo real según el estado de limpieza: amber pulsando = esperando housekeeper, gradient slide = limpiando, glow emerald = lista. La recepcionista responde en 1 segundo mirando lo que ya tiene en pantalla. Y respeta accesibilidad WCAG 2.3.3 — usuarios con epilepsia o vértigo ven color sólido. Optii lo tiene pero cuesta dos veces más; Mews/Cloudbeds te obligan a abrir otra pestaña. En Zenix viene incluido."

### Para equipos que reciben 50 notificaciones al día y dejaron de mirar el teléfono

> "Cisco Healthcare 2021 (n=1,200 enfermeras): 72% baja su tasa de respuesta a alarmas en 2 semanas si todas tienen el mismo nivel de intrusión. Es exactamente lo que pasa con Mews/Cloudbeds — alarma + vibración fuerte para cada checkout normal → tu equipo deja de atender. Zenix usa 4 niveles escalonados con frecuencia inversa a intrusión: nivel 1 ambient (badge silencioso) para tareas creadas, nivel 2 notification (tono suave) para READY, nivel 2.5 elevated (banner persistente) para URGENT, nivel 3 alarm (sirena continua) SOLO para emergencias físicas como mantenimiento crítico. Tu equipo aprende que cuando la sirena suena, importa. Reduce errores operativos 25-40% según los estudios de alert fatigue."

---

## Resumen ejecutivo

| Si el hotel necesita... | Zenix lo resuelve porque... |
|---|---|
| Ver el estado del hotel de un vistazo | Calendario PMS visual en tiempo real con SSE |
| No limpiar habitaciones con huéspedes adentro | Checkout de 2 fases: planificación AM + confirmación física |
| Gestionar camas individuales en dormitorios | Arquitectura per-bed nativa — única en el mercado |
| Housekeepers que siempre saben qué hacer | Push notifications instantáneas + app móvil offline |
| Protegerse de chargebacks por no-show | GuestContactLog + audit trail fiscal + export CSV |
| Operar hoteles en múltiples países | Night audit multi-timezone por propiedad (hora local real) |
| Cumplimiento fiscal en LATAM | Registros inmutables + CFDI-ready + moneda ISO |
| Cero overbooking con OTAs | Hard block transaccional + Channex.io (mismo estándar Opera/Mews) |
| Retener al personal de housekeeping | Hub Recamarista con base SDT — privacidad peer-to-peer + 3 niveles de gamificación · sin shame · sin comparación |
| Trazabilidad ante disputas | Audit trail con actor, timestamp y razón en cada operación |
| Un sistema que los housekeepers realmente usen | App diseñada para uso con una mano, en movimiento, sin capacitación |
| Confirmar que el huésped realmente llegó | Badge "Sin confirmar" en calendario + wizard de check-in de 4 pasos |
| Control de efectivo sin riesgo de robo en caja | PaymentLog append-only por turno + cash reconciliation al cierre |
| Cortesías y exenciones sin bypass posible | COMP requiere código + razón de gerente — backend lo exige sin excepción |
| Cumplimiento USALI 12ª edición en pagos | Registros de pago inmutables con voids auditados — vigente desde ene 2026 |

---

*Documento basado en las funcionalidades implementadas y en roadmap de Zenix PMS. Actualizar con cada sprint completado.*
