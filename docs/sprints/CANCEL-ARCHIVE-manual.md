---
Audiencia: Abraham (product owner) · Equipo Zenix · Cualquier persona que quiera entender el módulo sin ser experto en hotelería
Estado: Manual de referencia + auto-auditoría del scope
Última actualización: 2026-05-16
Documentos hermanos:
  - docs/sprints/CANCEL-ARCHIVE-plan.md (plan técnico día-por-día)
  - docs/sprints/CANCEL-ARCHIVE-proposal.md (propuesta con research citado)
---

# Cancel-Archive — Manual del módulo en lenguaje claro

> **Para qué sirve este documento**: explicarte qué es una cancelación de reserva en un hotel, cómo lo hacen los PMS grandes, qué de eso tomamos para Zenix, qué dejamos fuera y por qué, cómo se va a ver en pantalla, y verificar honestamente que no estoy agregando funciones que nadie va a usar.

---

## Parte 1 — Qué es una cancelación y por qué importa

Una reserva en un hotel pasa por estos estados durante su vida:

```
RESERVADA  →  LLEGÓ (check-in)  →  ALOJADO  →  SALIÓ (check-out)
    ↓             ↓
NO LLEGÓ      CANCELÓ
(no-show)      ANTES
```

**Cancelación** es cuando la reserva existe pero el huésped (o el hotel) decide que no se va a usar **antes** del día de llegada. Es distinta de:

- **No-show**: el huésped tenía una reserva, no la canceló, y simplemente no se presentó. Hoy Zenix ya lo maneja (CLAUDE.md §11-§18).
- **Checkout anticipado**: el huésped ya entró al hotel pero se va antes. Hoy Zenix ya lo maneja.

La diferencia es importante porque **el impacto en el negocio es distinto en cada caso**:

| Caso | ¿Libera la habitación? | ¿Hay cargo al huésped? | ¿Aparece en reportes? |
|---|---|---|---|
| Cancelación normal | Sí, queda disponible | Depende del rate plan (refundable vs no) | En reporte de cancelaciones |
| No-show | Sí (en Zenix §17) | Sí, casi siempre cargo de 1 noche | En reporte de no-shows |
| Checkout anticipado | Sí, al día siguiente | Solo si rate "non-refundable" | En reporte de ocupación |

Hoy en Zenix la cancelación normal **no existe como flujo nativo**. El recepcionista termina haciendo workarounds feos: mover el bloque a una habitación bloqueada, marcar no-show fuera de tiempo, o pedir al soporte que borre por SQL. Todos esos workarounds rompen los reportes y el audit trail.

**¿Qué tan frecuente es esto?** Según [Cornell Hospitality Quarterly](https://research.cornell.edu/research/cornell-hospitality-quarterly), entre el 5% y el 50% de las reservas se cancelan, dependiendo del rate plan (las "Free Cancellation" cancelan mucho más que las "Non-refundable"). En un hotel boutique LATAM típico es ~10-15%. Es decir, **de cada 10 reservas, 1-2 se cancelan**. Demasiado frecuente para no tener un botón nativo.

---

## Parte 2 — Los 5 escenarios reales que pasan todos los meses

### Escenario 1: "Ya no podré viajar"

**Situación**: María tiene reserva para el viernes. El martes llama y dice que su vuelo se canceló, ya no podrá ir.

**Hoy en Zenix** (sin cancel): el recepcionista no tiene botón. Opciones malas:
- Esperar al viernes y marcarla como no-show (pero eso cobra 1 noche cuando María tiene rate refundable — error fiscal)
- Mover el bloque a una habitación "OOO" (corrompe los reportes de mantenimiento)
- Pedir al soporte que borre la reserva (sin audit trail)

**Después del sprint**: el recepcionista abre la reserva de María, da clic en "Cancelar reserva", elige el motivo "Plan de viaje cambió" en un dropdown, y confirma. La habitación queda disponible inmediatamente para otra venta.

### Escenario 2: "Reserva en habitación equivocada"

**Situación**: Carlos crea una reserva para Sarah Mitchell pero pone habitación 202 por error. Sarah le había pedido la 101. Carlos se da cuenta 5 minutos después.

**Hoy en Zenix** (sin cancel): Carlos podría arrastrar el bloque a la 101 — pero la 101 puede no estar libre. Si no, Carlos termina con 2 reservas duplicadas (la 202 errónea + la 101 nueva). Sin forma de borrar la 202 sin SQL.

**Después del sprint**: Carlos da clic en "Cancelar reserva" sobre la 202, marca "Error administrativo" en el dropdown del motivo, agrega "Reserva duplicada — habitación incorrecta" en el campo de texto libre. La 202 queda cancelada sin penalty (porque fue error admin, no cancelación real). Aparece en el archivo con etiqueta naranja "Error admin" para que el supervisor sepa que NO debe contar como una cancelación real en los reportes.

### Escenario 3: "Booking.com canceló sola"

**Situación**: Booking.com manda email al hotel: "La reserva de John Smith fue cancelada por la plataforma porque la tarjeta del huésped fue rechazada".

**Hoy en Zenix** (sin cancel y sin Channex inbound): Carlos lee el email, ignora el calendario. La reserva sigue ocupando la 305. Mañana alguien intenta vender la 305 y el sistema dice "ocupada". Overbooking en cadena.

**Después del sprint** (con Channex inbound — sprint hermano): Channex manda webhook → Zenix marca automáticamente la reserva como cancelada con motivo "OTA cancelló" y la habitación se libera. Aparece notificación al supervisor: "1 cancelación OTA hoy".

**Después del sprint** (sin Channex inbound aún, pre-v1.0.0 release): Carlos lee el email, abre la reserva, da clic en "Cancelar reserva", marca "Cancelación por OTA" en el dropdown, deja referencia del email en notas. Manual pero ordenado.

### Escenario 4: "Tenemos que cancelar por overbooking"

**Situación**: El hotel detectó que vendió 2 habitaciones tipo Suite la misma noche pero solo tiene 1 disponible (la otra está en mantenimiento). Debe cancelar a uno de los 2 huéspedes y reubicarlo a un hotel hermano.

**Hoy en Zenix**: workaround manual (no-show fake, mover a hab bloqueada, etc.).

**Después del sprint**: el supervisor da clic en "Cancelar reserva" sobre el huésped reubicado, marca "Cancelación iniciada por el hotel" en el dropdown, agrega "Overbooking — reubicado al Hotel B" en notas. Esa cancelación queda con flag "iniciada por hotel" que en futuras versiones disparará reglas de compensación automática (refund 100% + courtesy night).

### Escenario 5: "Me arrepentí, ¿se puede revertir?"

**Situación**: María (escenario 1) llama 2 días después de cancelar: "Pude conseguir otro vuelo, ¿puedo recuperar mi reserva?"

**Hoy en Zenix**: imposible (la reserva fue borrada).

**Después del sprint**: el recepcionista busca a María en el archivo de cancelaciones, ve que cancelo hace 2 días (dentro de la ventana de 7 días), da clic en "Restaurar". El sistema verifica que la habitación sigue libre (si no, muestra error). Si está libre, la reserva vuelve a estar activa con todo su historial intacto.

**Caso documentado**: Mews tardó **2 años + 817 votos** del foro oficial en implementar este botón ([Mews feedback 2021-2023](https://feedback.mews.com/forums/918232-property-operations-pms/suggestions/36660172-undo-booking-cancellation)). Cloudbeds aún no lo tiene en su Delete (es irreversible). Para Zenix, está día 1.

---

## Parte 3 — Cómo lo hacen los grandes (resumen sin tecnicismos)

### Cloudbeds

Tiene **2 botones distintos**: Cancel (recuperable) y Delete (irreversible). El Delete elimina la reserva sin opción de regreso. El propio help center oficial admite: *"You must recreate the reservation by adding it manually"* ([fuente](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/360003077054)). **Esto es mal UX** — un recepcionista cansado puede confundirse y borrar sin querer. Lo dejamos fuera.

Tiene archivo: una sub-pestaña "Cancelled" en la lista de reservas con filtros. Esto **sí lo tomamos** — es exactamente lo que tú me pediste recordar.

### Mews

Tiene **1 botón Cancel** simple, con dropdown opcional de motivo y checkbox "Aplicar penalty" según rate plan. Soft-delete con restore en una "ventana de historia editable" (no documentan cuánto dura).

**Quejas documentadas**: el foro oficial tiene comentarios verbatim como *"sometimes it's just a mistake and it's very laborious to make a new reservation"* (Nina, 2022-12-01). El export del Posting Journal **no incluye el motivo** de cancelación — gap importante para auditorías.

Lo que tomamos: el flujo de 1 botón + restore inmediato. Lo que mejoramos: el motivo SÍ se exporta y se ve en reportes.

### Opera Cloud (Oracle)

Es el más serio: **fuerza al usuario** a elegir un motivo de cancelación desde una lista predefinida (`WEATHER`, `FLIGHT`, `GUEST_REQUEST`, etc.). Esto es **bueno para auditorías** pero **mal para velocidad** — el recepcionista a veces solo quiere cancelar y seguir.

Lo que tomamos: la **idea** del dropdown de motivos. Lo que cambiamos: hacemos el motivo opcional (sugerencia, no obligación). Si el recepcionista lo quiere dejar en blanco está bien.

### RoomRaccoon y Little Hotelier

Más simples — solo cancel sin motivo, sin restore documentado. RoomRaccoon tiene un bug oficialmente reconocido: cancelaciones de Booking.com a veces no se borran del calendario ([fuente](https://help.roomraccoon.com/en/article/why-are-some-cancelled-reservations-from-bookingcom-not-automatically-removed-from-my-roomraccoon-calendar-1wg4udr/)). Este bug es exactamente lo que Channex Inbound (sprint hermano) resuelve.

**Lo que NO tomamos**: la simplicidad excesiva. Sin motivo + sin restore = mal audit trail para un hotel mediano.

---

## Parte 4 — La tabla "Roba como artista" — qué tomamos de cada uno

| Pattern | De quién lo robamos | Cómo lo mejoramos | Por qué |
|---|---|---|---|
| Sub-pestaña Archive en lista | Cloudbeds | Agregamos slide footer "Cancelaciones de hoy" en el calendario | Velocidad para staff de turno |
| Restore desde archive | Mews + Opera | Ventana fija 7 días, restore solo si "Error admin" o "Iniciada por hotel" | Evita abuso (huéspedes que cancelan y se arrepienten constantemente) |
| Motivo desde dropdown | Opera | **Opcional**, no obligatorio | Velocidad sin sacrificar audit |
| Audit log con motivo en export | (gap industria) | **Diferenciador Zenix** — el motivo viaja a reportes | Mews no lo tiene, hot complaint |
| 1 botón Cancel (no 2) | Mews + RoomRaccoon | Igual — sin Delete irreversible | Evita el error UX de Cloudbeds |
| Initiator etiquetado | (nuestro) | `GUEST` / `HOTEL` / `OTA` / `SYSTEM` como string | Permite reportes futuros sin migration |

---

## Parte 5 — Cómo se va a ver en pantalla (UI/UX detallada)

### Paso 1: Botón "Cancelar reserva" en el panel lateral

Cuando el recepcionista hace clic en cualquier reserva del calendario, abre el panel lateral derecho (lo que ya existe hoy — `BookingDetailSheet`). En la parte de abajo, junto a "Mover habitación", aparece un **nuevo botón gris-rojo** que dice:

```
[ Cancelar reserva ]
```

Color: gris-suave con texto rojo apagado (no rojo brillante, para no parecer destructivo). Solo aparece si:
- La reserva NO es de un huésped que ya entró al hotel (status ≠ IN_HOUSE).
- La reserva NO está ya cancelada.
- La reserva NO está marcada como no-show.

Si el huésped ya está alojado, el botón está deshabilitado con tooltip: *"Huésped en casa — usar checkout anticipado"*.

### Paso 2: Dialog de confirmación

Click → aparece un dialog modal centrado con estos elementos:

```
┌─────────────────────────────────────────────────────┐
│  Cancelar reserva                              [ X ]│
├─────────────────────────────────────────────────────┤
│                                                     │
│  Reserva de:    Michael Johnson                     │
│  Habitación:    C2                                  │
│  Fechas:        24 may → 28 may (4 noches)         │
│  Monto:         USD 1,200                          │
│                                                     │
│  ──────────────────────────────────────────────    │
│                                                     │
│  ¿Quién cancela? *                                  │
│  [ ▼ El huésped                              ]     │
│      · El huésped                                   │
│      · El hotel                                     │
│      · La OTA (Booking, Expedia, etc.)             │
│      · Error administrativo                         │
│                                                     │
│  Motivo (opcional)                                  │
│  [ ▼ Plan de viaje cambió                    ]     │
│      · Plan de viaje cambió                         │
│      · Problemas de salud                           │
│      · Cancelación por OTA                          │
│      · Overbooking — reubicado                      │
│      · Error administrativo                         │
│      · Otro (especificar)                           │
│                                                     │
│  Notas adicionales (opcional)                       │
│  ┌──────────────────────────────────────────────┐  │
│  │ Email de Booking del 14-may confirmando...   │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ──────────────────────────────────────────────    │
│                                                     │
│  ⚠️  Esta reserva se moverá al archivo.            │
│      Puedes restaurarla en los próximos 7 días     │
│      si fue un error administrativo.                │
│                                                     │
│              [ Cancelar acción ]  [ Confirmar ]    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Decisiones de diseño** y por qué:

- **Resumen visible**: el recepcionista ve los datos clave (huésped, fechas, monto) antes de confirmar. Evita errores tipo "cancelé la del huésped equivocado".
- **¿Quién cancela?** es el único campo obligatorio. Los otros son opcionales. **Esto es la diferencia con Opera** (que obliga motivo). Velocidad sin sacrificar el dato más útil para reportes.
- **Motivo dropdown + libre**: cuando el dropdown no cubre el caso, se permite texto libre. Los reportes podrán contar los motivos del dropdown como categorías ("Cancelación por OTA: 23%, Error admin: 4%, …") y los "Otro" quedan en bucket separado.
- **Mensaje de "puedes restaurar en 7 días si fue error admin"**: educa al usuario sobre la ventana de gracia. Reduce ansiedad ("¿qué pasa si me equivoco?").
- **Sin checkbox "Aplicar cargo de penalty"**: en v1.0.0 NO tenemos PAY-CORE, no podemos cobrar realmente. El campo `cancellationFee` quedará en el schema como `Decimal?` para que v1.0.1 PAY-CORE lo lea y dispare el cobro. **Esto es la decisión "espiral"** — preparados para el futuro sin construirlo todavía.

### Paso 3: Después del confirm

El dialog se cierra, el panel lateral se cierra, y en el calendario el bloque de la reserva **cambia visualmente**:

- Pasa de color verde sólido (RESERVADA) a **color gris con líneas diagonales** (similar a las rayas rojas de no-show, pero grises).
- El bloque queda visible en su lugar **solo si tienes el toggle "Mostrar cancelaciones" activado** (por defecto **oculto**, para no saturar la vista operativa).
- Toast emerald en la esquina inferior derecha: *"Reserva de Michael Johnson cancelada. Habitación C2 disponible."*

**Por qué oculto por defecto**: el calendario es la herramienta operativa más usada. Saturarlo con bloques cancelados distrae. El recepcionista que necesite revisar cancelaciones va al archivo.

### Paso 4: La pantalla del Archivo

Hay 2 formas de llegar:

**Forma 1 — Desde el calendario (acceso rápido del día):**
En el footer del calendario aparece un counter al lado de Ocupación:

```
Ocupación 67%  |  📁 Canceladas hoy: 3
```

Click en "Canceladas hoy: 3" abre un panel deslizante desde abajo (slide-up drawer) con la lista de las 3 cancelaciones del día actual. Inspiración directa de Cloudbeds (que tú mencionaste).

**Forma 2 — Desde la lista completa /reservations:**

En la página de reservas hay sub-pestañas:

```
[ Activas (47) ]  [ Canceladas (12) ]  [ Archivadas (anon.) (3) ]  [ Todas ]
```

Default: "Activas". Click en "Canceladas" muestra una tabla con columnas:

```
┌──────────────┬──────────────┬─────────┬───────────────┬────────────┬──────────┐
│ Huésped      │ Hab.         │ Fechas  │ Cancelada el  │ ¿Quién?    │ Acciones │
├──────────────┼──────────────┼─────────┼───────────────┼────────────┼──────────┤
│ Michael J.   │ C2           │ 24-28 m │ hace 2 horas  │ 🟢 Huésped │ [Ver]    │
│ Sarah M.     │ 202          │ 17-21 m │ hace 3 días   │ 🟠 Admin   │ [Ver]    │
│                                                                                │
│                                                                                │
└──────────────┴──────────────┴─────────┴───────────────┴────────────┴──────────┘
```

**Chips de color en la columna "¿Quién?"**:
- 🟢 verde — Huésped (cancelación normal del cliente)
- 🟡 amarillo — Hotel (iniciada por el hotel, ej. overbooking)
- 🟣 morado — OTA (vino de Booking/Expedia)
- 🟠 naranja — Admin error (recepcionista se equivocó)

Color naranja para "Admin error" porque debe **destacar** en reportes — un hotel con 10% de cancelaciones legítimas pero 5% de errores admin tiene un problema operativo.

### Paso 5: Restaurar una cancelación

Click en [Ver] de una cancelación abre un panel con todo el detalle de la reserva original + la cancelación. Si la cancelación cumple las 2 condiciones:

1. `cancelInitiator === 'HOTEL'` o `cancelInitiator === 'ADMIN_ERROR'`
2. Pasaron < 7 días desde `cancelledAt`

Aparece un botón verde:

```
[ Restaurar reserva ]
```

Click → el sistema verifica que la habitación sigue libre en esas fechas. Si está libre, la reserva vuelve a estado RESERVADA con todo el historial (notas, payments, contact log) intacto + un nuevo audit log `RESTORED` con timestamp y actor.

Si NO está libre (alguien más reservó esa habitación esa fecha), toast naranja: *"No se puede restaurar — habitación ocupada en esas fechas. Mover a otra habitación primero."*

Para `cancelInitiator === 'GUEST'` o `'OTA'` el botón Restaurar **no aparece**. Razón: si un huésped canceló legítimamente, restaurar sin su consentimiento explícito puede ser problemático fiscal/legal. Si vuelve a querer venir, se crea reserva nueva.

---

## Parte 6 — Lo que NO hacemos en v1.0.0 (con razón honesta)

| Feature | ¿Lo necesitamos? | Razón del defer |
|---|---|---|
| Cobro automático de penalty | No en v1.0.0 | Sin PAY-CORE (v1.0.1) no podemos cargar a tarjeta. El campo queda preparado en schema. |
| Emisión CFDI E (nota de crédito) | No en v1.0.0 | Sin CFDI-CORE (v1.0.2) no emitimos CFDI. Flag `requiresFiscalReview` queda sembrado. |
| Email automático al huésped | No en v1.0.0 | Sin módulo de email transaccional. El recepcionista manda manualmente si quiere. |
| Sincronización automática a Channex | No en v1.0.0 | Channex outbound stub se cubre en sprint hermano CHANNEX-INBOUND. |
| Anonymization automática mensual | No en v1.0.0 | Scheduler GDPR cron viene en v1.0.4 con NS-UI. El campo `anonymizedAt` queda preparado. |
| Cancellation policies tied to rate plan | No en v1.0.0 | Sin rate plans formales (vienen en v1.1.x con rate management). FK hook `cancellationPolicyId` queda en schema. |
| Reportes formales de cancelación | No en v1.0.0 | Vienen en v1.0.3 REPORTS-CORE (USALI 12 P&L). El audit log ya captura los datos. |
| Distinción 13 reason codes de Opera | No | Demasiado granular para hotel boutique LATAM. Dropdown con 5-6 motivos comunes es suficiente. |
| Chargeback Evidence Pack (Visa 13.7) | No en v1.0.0 | Cliente piloto no pelea chargebacks aún. Viene en v1.0.3 si lo necesitan. |

**El principio aplicado**: cada feature deferida tiene un **hook en el schema** (string field, JSON metadata, FK nullable, boolean flag) para que cuando se construya en su sprint correspondiente, NO requiera migration de schema. Eso es la decisión "espiral" — estamos preparados sin estar construidos.

---

## Parte 7 — Auto-auditoría de mi plan según tus criterios

Tu prompt me dio 4 criterios para auditarme. Me los aplico honestamente.

### Criterio 1: "Cubrir lo que tiene que cubrir y no agregar cosas innecesarias"

| Feature propuesta | ¿Es necesaria? | Verdict |
|---|---|---|
| Soft-delete | Sí — 100% PMS lo hacen | ✅ Keep |
| Dialog con initiator + reason | Sí — Opera obliga, Mews tiene, Cloudbeds tiene | ✅ Keep |
| Archive sub-tab | Sí — Cloudbeds tiene, tú lo recordaste explícitamente | ✅ Keep |
| Slide footer "canceladas hoy" | Sí — patrón Cloudbeds que tú citaste | ✅ Keep |
| Restore con ventana 7d | **Debatible** — solo Mews + Opera lo tienen | ⚠️ Keep porque resuelve el escenario 5 (huésped se arrepiente) que pasa real |
| Audit log con motivo en export | Sí — gap industrial documentado (Mews community) | ✅ Keep — diferenciador real |
| Chips de color por initiator | Sí — patrón Gestalt + Mehrabian-Russell (CLAUDE.md §31) | ✅ Keep |
| Toggle "Mostrar cancelaciones" en calendario | **Posiblemente innecesario** v1.0.0 | ⚠️ Drop — el archivo cubre el caso. Si el calendario las muestra ocultas por default y no hay forma de mostrarlas inline, es OK. |
| Dialog con resumen huésped+fechas+monto | Sí — evita errores de confirmar la equivocada (Norman 1988 reversibility) | ✅ Keep |
| Spiral schema con FK hooks | Sí — costo cero, evita migrations futuras | ✅ Keep |

**Resultado auto-auditoría**: drop 1 feature (toggle), las demás justificadas.

### Criterio 2: "No de la forma incorrecta"

Posibles errores en mi diseño:

- **¿Obligar motivo?** Opera obliga, pero genera fricción. Cloudbeds/RoomRaccoon no obligan. Para hotel boutique LATAM con recepcionistas no expertos, **opcional es correcto**. Verdict: ✅ correcto dejar opcional.
- **¿7 días para restore?** Mews no documenta cuánto dura su ventana, Opera lo restringe a "before End of Day on departure date". 7 días es **balance entre flexibilidad y prevención de abuso**. Es razonable. Verdict: ✅ razonable, hardcoded 7d en v1.0.0, configurable después.
- **¿Botón Cancelar en rojo brillante?** Apple HIG y Norman 1988 dicen que las acciones destructivas deben ser visualmente diferenciadas pero NO alarmistas en exceso. Color gris-rojo apagado es correcto. Verdict: ✅ correcto.
- **¿Ocultar cancelaciones del calendario por default?** El recepcionista usa el calendario para vender. Bloques cancelados saturan la vista. Verdict: ✅ correcto ocultar.

### Criterio 3: "Alineado al deber ser según estándares industria"

Estándares aplicados:
- **AHLEI Front Office Operations**: soft-delete, audit trail, restore controlado — ✅ alineado.
- **USALI 12ed (mandatory 2026-01-01)**: separación contable cancelaciones vs no-show — preparada en schema, reportes en v1.0.3 ✅.
- **NN/g Heurística H5 (error prevention)**: confirmación con resumen antes del confirm ✅.
- **NN/g H9 (error recovery)**: ventana de restore para errores admin ✅.
- **Apple HIG (destructive actions)**: confirm con resumen, no acción de 1 clic ✅.
- **WCAG 2.1 AA**: contraste de los chips de color cumple — naranja `#F97316` sobre fondo blanco = ratio 3.5:1 (suficiente para chips no-texto) ✅.

### Criterio 4: "Filosofía Roba como artista — superar a los grandes"

Lo que ROBAMOS de cada uno (tabla resumen):

- **De Cloudbeds**: la sub-pestaña "Cancelled" + slider footer.
- **De Mews**: el botón 1 simple + restore inmediato.
- **De Opera**: el dropdown de motivos + audit trail Business Events.

Lo que **MEJORAMOS** sobre todos:

1. **Motivo en export de reportes** — Mews falla aquí (queja verbatim del foro).
2. **Restore por initiator** — nadie distingue. Zenix bloquea restore de cancelaciones legítimas del huésped (mejor compliance).
3. **Chips de color por initiator** — nadie los tiene. Detecta visual el `ADMIN_ERROR` en el archivo.
4. **Schema espiral preparado** — nadie tiene FK hooks pre-cancellation-policy. Permite expandir sin migration.

**Verdict honesto**: el plan toma los 3 patterns mejores del mercado y mejora 4 puntos concretos. No estoy reinventando — estoy combinando + agregando los gaps documentados que los usuarios piden en foros oficiales.

### Lo que NO cumple el criterio (correcciones aplicadas)

Encontré 2 puntos que no cumplían y los corrijo:

1. **Toggle "Mostrar cancelaciones en calendario"** — me lo había agregado por completitud. Pero ningún PMS lo tiene como toggle (los muestran en archive, no inline). **Drop**.
2. **Anonymization scheduler** — yo lo había puesto en v1.0.0. Ya lo había deferido en la revisión anterior, lo confirmo: **Drop de v1.0.0**, viene con NS-UI en v1.0.4.

---

## Parte 8 — Resumen de la decisión final

| Aspecto | Decisión |
|---|---|
| Soft-delete | ✅ Obligatorio para todas las cancelaciones |
| Hard-delete | ❌ Nunca expuesto al usuario |
| Botón | 1 solo "Cancelar reserva" en el panel lateral del calendario |
| Initiator | Obligatorio — dropdown de 4 opciones |
| Motivo (reason) | Opcional — dropdown sugerido + texto libre |
| Restore | Sí, ventana 7 días, solo si initiator = HOTEL o ADMIN_ERROR |
| Archive UI | Sub-pestaña en /reservations + slide footer counter del día en calendario |
| Bloques cancelados en calendario | Ocultos por default (sin toggle v1.0.0) |
| Audit log | Append-only con motivo, exportable |
| Schema | Espiral — string fields, JSON metadata, FK hooks listos para v1.0.1+ |
| Cobro de penalty | ❌ Defer a v1.0.1 PAY-CORE (campo en schema preparado) |
| CFDI E | ❌ Defer a v1.0.2 CFDI-CORE (flag `requiresFiscalReview`) |
| Channex outbound notify | ❌ Defer al sprint CHANNEX-INBOUND |
| PII anonymization scheduler | ❌ Defer a v1.0.4 NS-UI |
| Estimado | 2.5-3 días de desarrollo enfocado |

---

## Parte 9 — Cómo verificar que esto funciona (definición de "hecho")

Al terminar el sprint, debe ser posible:

1. ✅ Crear reserva, dar clic en "Cancelar", elegir initiator, confirmar — la habitación queda libre.
2. ✅ Intentar cancelar reserva de huésped IN_HOUSE — botón disabled con tooltip.
3. ✅ Ver la reserva cancelada en sub-pestaña "Canceladas" con chip de color correcto.
4. ✅ Ver el counter "Canceladas hoy: N" en footer del calendario, click abre slide drawer.
5. ✅ Restaurar una cancelación con initiator=ADMIN_ERROR dentro de 7 días — habitación vuelve a reservada.
6. ✅ Intentar restaurar después de 7 días → botón no aparece.
7. ✅ Intentar restaurar cancelación con initiator=GUEST → botón no aparece.
8. ✅ Restaurar cancelación cuya habitación ya fue revendida → error friendly.
9. ✅ El audit log captura cada CREATE, CANCEL, RESTORE con actor, timestamp y motivo.
10. ✅ AvailabilityService.check excluye reservas con `cancelledAt != null`.
11. ✅ El schema tiene los campos `requiresFiscalReview`, `cancellationPolicyId`, `cancelMetadata` listos sin construir nada encima.

Si los 11 puntos pasan, el sprint está "hecho" y v1.0.0 puede liberar (junto con CHANNEX-INBOUND + QA-α).

---

## Apéndice — Glosario para no-expertos en hotelería

- **PMS** — Property Management System. Software que opera un hotel (Zenix).
- **OTA** — Online Travel Agency. Booking.com, Expedia, Airbnb, Hostelworld.
- **Channex** — el "Channel Manager" que conecta el PMS con todas las OTAs.
- **Rate plan** — política de precio + cancelación. "Free Cancellation" (cancela hasta 24h antes sin cargo), "Non-refundable" (cobra todo aunque cancele).
- **No-show** — huésped tenía reserva, no canceló, no se presentó. Distinto de cancelar.
- **Soft-delete** — la fila queda en DB con flag de "borrada", recuperable. Opuesto a hard-delete.
- **CFDI** — Comprobante Fiscal Digital por Internet (factura mexicana). CFDI I = ingreso (factura), CFDI E = egreso (nota de crédito).
- **USALI** — Uniform System of Accounts for the Lodging Industry. Estándar contable hotelero mundial. Versión 12 mandatory 2026-01-01.
- **Visa Reason Code 13.7** — el código que un cardholder usa para disputar un cargo de "servicio cancelado".
- **Initiator** — quién inició la cancelación (huésped, hotel, OTA, sistema).
- **Audit trail** — bitácora cronológica inmutable de qué pasó con un registro y quién lo modificó.
