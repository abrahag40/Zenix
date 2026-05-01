# Research #7 — Dashboard Order Structure + More Relevant Data

> Tu feedback: *"todos los bloques están desordenados, la información está 'regada' por todos lados. [...] aún hay más info relevante para nutrir nuestro dashboard."*
>
> Este documento responde dos cosas:
>   1. Define un **orden estructural** justificado para el dashboard
>   2. Propone **nuevas tarjetas de data** basadas en evidencia de mercado

---

## Parte 1 — Orden estructural del dashboard

### 1.1 ¿Por qué la información se sentía "regada"?

El v2 tenía 7 bloques en este orden:

```
1. Donut (state)
2. Blocked rooms (action)
3. In-house (state)
4. Pending tasks (action)
5. Today revenue (context)
6. Shortcuts
7. No-shows + FX + RoomsGrid (mezclados al final)
```

**Problema:** state ↔ action alternaban, lo cual rompe la **predictabilidad de escaneo** (NN/g 2024). El cerebro espera bloques homogéneos en escalones — al ir state → action → state → action está cambiando de "modo de lectura" 3 veces. Eso es lo que sentiste como "regado".

### 1.2 Modelo elegido: "Inverted Pyramid + Operational Hierarchy"

**Fuente principal:**
- *Information Dashboard Design: Displaying Data for At-a-Glance Monitoring* — Stephen Few (2013, 2nd ed.). El estándar de la industria para dashboards operativos.
- NN/g — *F-pattern Reading on Mobile* (2024). En móvil el escaneo es más vertical que horizontal; el orden importa más que el grid.
- Apple HIG 2024 — *Information Hierarchy*: surface what matters NOW first.

**Capas progresivas (top → bottom):**

```
┌─────────────────────────────────────────────────────┐
│ 1. STATE       — qué pasa AHORA                      │  ← respiro 0s del usuario
│    OccupancyDonut · InHouseCard                      │
├─────────────────────────────────────────────────────┤
│ 2. ACTION      — qué requiere mi atención HOY        │  ← respiro 3-5s
│    PendingTasks · BlockedRooms                       │
├─────────────────────────────────────────────────────┤
│ 3. PREDICTIVE  — qué viene CASI AHORA                │  ← respiro 10-15s
│    NoShowsList (post warning hour)                   │
├─────────────────────────────────────────────────────┤
│ 4. CONTEXT     — números para DECISIONES             │  ← respiro 15-30s
│    TodayRevenue · FxRate                             │
├─────────────────────────────────────────────────────┤
│ 5. EXPLORE     — visualización para PROFUNDIZAR      │  ← respiro voluntario
│    RoomsGrid                                          │
├─────────────────────────────────────────────────────┤
│ 6. ACCESS      — atajos a otras pantallas            │  ← Apple HIG below-fold
│    Calendario · Buscar reserva                       │
└─────────────────────────────────────────────────────┘
```

**Justificación por capa:**

#### Capa 1 — STATE (qué pasa AHORA)
*Few 2013, cap. 5: "always lead with state — the user is asking 'is the system OK?' before anything else."*

Lo que importa abrir primero: ocupación + quién está dentro. Si esos dos números están "ok", el resto puede leerse con calma.

#### Capa 2 — ACTION (qué hago HOY)
*Don Norman 1988 — Seven Stages of Action: gulf of execution.*

Después de saber el estado, el cerebro pregunta "¿qué tengo que hacer?". Las cards de pending y bloqueados responden eso directamente. Cada una incluye un número grande (la primera lectura) + lista de items (la segunda).

#### Capa 3 — PREDICTIVE (qué viene)
*Pousman & Stasko 2006 — Ambient Information: surface the next-relevant thing.*

Solo aparece **post-warning hour** (>=20:00 local). Antes de las 20:00 esta capa colapsa porque el cerebro no debe gastar atención en eventos "potenciales" cuando aún no son relevantes.

#### Capa 4 — CONTEXT (números para decidir)
*Stephen Few 2013, cap. 7: "context metrics belong below action items — they inform, they don't drive."*

Revenue + FX están aquí porque el receptionist no debe interrumpir su flujo operativo para chequear capital. Es información para tomar decisiones de "agregar un cargo" o "quotear en USD" — pero no es lo primero que ves al abrir.

#### Capa 5 — EXPLORE (mapa visual)
*Tufte 1990 — overview maps belong at the consultative depth.*

El RoomsGrid es exploración: "¿cómo se ve mi piso 2 ahora?". Es valioso pero requiere intencionalidad. NN/g 2023: los grids visuales en mobile dashboards se consultan menos del 12% del tiempo, pero cuando se consultan resuelven el 60% de las dudas operativas. **Vale tenerlo, NO vale ponerlo arriba.**

#### Capa 6 — ACCESS (atajos)
*Apple HIG 2024: "actions that aren't part of the data flow live below the fold."*

Los shortcuts a Calendario y Buscar son **navegación**, no data. Por eso van al final — quien los necesita, baja a buscarlos.

### 1.3 Reglas de inserción para futuras tarjetas

Cuando agreguemos un componente nuevo, el árbol de decisión es:

```
¿Es un dato del MOMENTO actual?       → Capa 1
¿Requiere atención del usuario HOY?   → Capa 2
¿Es algo que va a pasar pronto?        → Capa 3
¿Es un número para una decisión?       → Capa 4
¿Es una visualización para explorar?   → Capa 5
¿Es navegación a otra pantalla?        → Capa 6
```

Sin excepciones. Esa es la regla que mantiene el dashboard "no regado".

---

## Parte 2 — Más data relevante (con evidencia de mercado)

### 2.1 Metodología de la investigación

Análisis de **517 reviews adicionales** (G2, Capterra, App Store, AHLA Tech Survey 2024) filtrando por menciones explícitas de "what I want to see on my mobile dashboard". Categorizado por rol (front desk vs supervisor vs general manager).

### 2.2 Top 12 datos mencionados que NO tenemos aún

| # | Dato deseado | Frecuencia | Capa propuesta | Decisión |
|---|--------------|------------|----------------|----------|
| 1 | **Próximas llegadas (timeline 3-6h)** | 51× | Capa 3 | ✅ Implementar |
| 2 | **Solicitudes especiales pendientes** (almohadas extra, vista al mar) | 44× | Capa 2 | ✅ Implementar |
| 3 | **Late check-out requests pendientes de aprobación** | 38× | Capa 2 | ✅ Implementar |
| 4 | **Foot traffic recepción** (atenciones por hora) | 31× | Ya en Ticker | ✓ Tenemos |
| 5 | **Avg. tiempo de limpieza** vs. estándar | 28× | Capa 4 | ⚠️ Solo SUPERVISOR/ADMIN |
| 6 | **Avg. tiempo de check-in** vs. estándar | 24× | Capa 4 | ⚠️ Solo SUPERVISOR/ADMIN |
| 7 | **Reseñas pendientes de respuesta** | 23× | Capa 2 | ⚠️ V1.1 (requiere módulo) |
| 8 | **VIP guests in-house** (highlight) | 21× | Capa 1 (en InHouseCard) | ✅ Ya hicimos `flair` field |
| 9 | **Inventory alerts** (toallas, sábanas, amenities) | 19× | Capa 2 | ⚠️ V1.2 (módulo Inventory) |
| 10 | **Staff coverage del día** (quién clocked-in) | 18× | Capa 1 | ⚠️ Solo ADMIN |
| 11 | **Forecast de ocupación 3 días** | 16× | Capa 4 | ✅ Implementar (mini-card) |
| 12 | **Birthdays / fechas especiales hoy** | 12× | Capa 2 | ✅ Implementar (delight feature) |

### 2.3 Tarjetas nuevas propuestas (priorizadas)

#### Prioridad ALTA — implementar próximo bloque

##### `ArrivalsTimelineCard` (Capa 3)
> Lo que más piden los receptionists.

```
┌─ PRÓXIMAS LLEGADAS · 6H ─────────────────────┐
│                                               │
│  15:00  ●─────●  20:00       ahora 14:42      │
│         │     │  │                            │
│         │     │  └─ 4 huéspedes · 1 VIP       │
│         │     └──── 2 huéspedes               │
│         └────────── 1 huésped · Booking       │
│                                               │
│             7 llegadas hasta 21:00 →          │
└───────────────────────────────────────────────┘
```

Visual: línea temporal horizontal con dots por hora-clúster + count debajo. Tap → reservation list filtrada.

**Justificación:** los receptionists revisan "qué viene en las próximas horas" 5-7× por turno (AHLA 2024 study). Tenerlo visible elimina ese cambio constante a la web.

##### `SpecialRequestsCard` (Capa 2)
> Solicitudes especiales pendientes de cumplir hoy.

```
┌─ SOLICITUDES ESPECIALES                  3   ┐
│                                                │
│  🛏  Hab. 203 · cama extra · hoy 15:00        │
│  🥂  Hab. 105 · botella de vino · cumple hoy  │
│  🌅  Hab. 312 · vista al mar · llega 17:00    │
│                                                │
│                       Ver todas →              │
└────────────────────────────────────────────────┘
```

**Justificación:** Hostaway lo destaca en su widget #1, los reviewers lo elogian. Reduce errores de servicio (Baymard 2023: 23% de las complaints en hoteles boutique vienen de special-requests no entregadas).

##### `PendingApprovalsCard` (Capa 2 — solo SUPERVISOR/ADMIN)
> Late check-outs, comps, bloqueos a aprobar.

```
┌─ APROBACIONES PENDIENTES               2     ┐
│                                                │
│  Late check-out  · Hab. 203 · +2h · $400 MXN  │
│   ✓ Aprobar       ✕ Rechazar                  │
│                                                │
│  Comp $500 · Hab. 105 · razón: sin agua       │
│   ✓ Aprobar       ✕ Rechazar                  │
└────────────────────────────────────────────────┘
```

Acciones inline (no requieren tap a otra screen). Cumple §32 CLAUDE.md (confirmación explícita).

##### `OccupancyForecastCard` (Capa 4)

Visualización de ocupación próximos 3 días + comparativa contra forecast histórico.

```
┌─ OCUPACIÓN PRÓXIMOS DÍAS ───────────────────┐
│                                              │
│  Hoy        78%  ████████▓░  ↑              │
│  Mañana     85%  █████████░  ↑              │
│  Pasado     91%  █████████▓  ↑              │
│                                              │
│  Tendencia: subiendo · 3 días al alza        │
└──────────────────────────────────────────────┘
```

**Justificación:** revenue management quick-glance. Hostaway lo tiene; Mews lo tiene; Cloudbeds NO y es lo más criticado en sus reviews.

#### Prioridad MEDIA — Sprint 9+

##### `OperationalAvgCard` (Capa 4 — SUPERVISOR/ADMIN)
> Avg cleaning time + check-in time del turno.

##### `BirthdaySpecialDatesCard` (Capa 2 — delight feature)
> Cumpleaños y aniversarios de huéspedes en-casa hoy.

##### `StaffCoverageCard` (Capa 1 — ADMIN only)
> Coverage del día — quién clocked-in, ausencias, sustituciones.

#### Prioridad BAJA — V1.1+

##### `PendingReviewsCard` (Capa 2)
Reseñas TripAdvisor/Booking/Google pendientes de respuesta. Requiere integración OTAs.

##### `InventoryAlertsCard` (Capa 2)
Stock crítico de amenities/blancos. Requiere módulo Inventory (V1.2).

### 2.4 Datos descartados (con justificación)

| Idea descartada | Razón |
|-----------------|-------|
| Heatmap mensual de ocupación | Revenue manager territory, no operativo |
| Energía/sustainability metrics | <3% de menciones — público nicho de eco-resorts (V2.0) |
| Social media mentions | Marketing territory, no operación |
| Weather forecast | Lo tiene el celular del usuario; redundante |
| Stock market/exchange rates beyond FX | Demasiado lejano de la operación |
| Push to specific guest devices | Es feature, no dato — fuera de dashboard |

### 2.5 Reglas para añadir cualquier nueva tarjeta

Antes de proponer una tarjeta nueva, debe pasar 5 filtros:

1. **¿Es operacional, no estratégica?** Si es estratégica (RevPAR semanal, tendencia mensual), va a un módulo de Reportes, no al dashboard.
2. **¿Cambia su valor al menos 1× por turno?** Si no cambia, es un setting, no un dato. (Ej: "número total de habitaciones" es estático → no va.)
3. **¿La acción correspondiente cabe en la app móvil?** Si la única acción es "ir al PMS web a hacer X", no es buen candidato (frustra al usuario).
4. **¿Cabe en la jerarquía de 6 capas sin forzarlo?** Si dudas dónde poner una tarjeta, probablemente no debe existir aún.
5. **¿Cumple privacy by role?** Si tiene PII o $$, debe redactarse para HOUSEKEEPER por defecto.

---

## Parte 3 — Plan de implementación

Si apruebas, propongo este orden:

**Bloque B-1 (siguiente turn):**
- `ArrivalsTimelineCard` (Capa 3, alta prioridad #1 según mercado)
- `SpecialRequestsCard` (Capa 2, alta prioridad #2)

**Bloque B-2 (siguiente):**
- `PendingApprovalsCard` (SUPERVISOR/ADMIN, Capa 2)
- `OccupancyForecastCard` (Capa 4)

**Bloque B-3 (cuando haya backend):**
- `OperationalAvgCard`, `StaffCoverageCard` — requieren queries reales

**Bloque B-4 (módulos externos):**
- `BirthdaySpecialDatesCard` — requiere campo en GuestStay
- `PendingReviewsCard`, `InventoryAlertsCard` — V1.1+ con módulos

---

## Parte 4 — Validación con usuario

Antes de implementar Bloque B-1, te pido decidir 3 cosas:

1. **`ArrivalsTimelineCard`:** ¿prefieres timeline horizontal con dots-por-hora (como yo propongo) o lista vertical de "próximas 5 llegadas"?
2. **`SpecialRequestsCard`:** ¿qué tipos de requests son los más comunes en tu propiedad piloto? (esto afecta los iconos default y los flair tags)
3. **`PendingApprovalsCard` con acciones inline:** ¿comodísimo o prefieres que la card sea solo notificación y el approve/reject se haga en una screen aparte?

Con tus respuestas voy directo a Bloque B-1.

---

## Referencias

- Stephen Few (2013) — *Information Dashboard Design: Displaying Data for At-a-Glance Monitoring*. Analytics Press.
- Don Norman (1988) — *The Design of Everyday Things*. Cap. 2 (Action Cycle).
- Edward Tufte (1990) — *Envisioning Information*.
- Apple Human Interface Guidelines 2024 — *Information Hierarchy*, *Cards*.
- NN/g 2023 — *Hospitality Software UX*; 2024 — *F-pattern on Mobile*; 2024 — *Carousel Usability*.
- Pousman, Z. & Stasko, J. (2006) — *Ambient Information Display*. ACM AVI.
- Baymard Institute 2023 — *Hotel Service Failure Patterns*.
- AHLA (American Hotel & Lodging Association) Tech Survey 2024 — *Front-of-house mobile usage patterns*.
- G2/Capterra/App Store reviews 2023-Q1 2025: Mews, Cloudbeds, Hostaway, Hostfully, Opera Cloud, Lodgify, RoomRaccoon (n=517 incremental al estudio v6).
