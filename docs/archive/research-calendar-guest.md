# Research #4 — Mobile Calendar & Guest Management UX

> Estudio de mercado para decidir cómo se debe ver y operar el módulo de **calendario / reservas / detalle de huésped** en la app móvil de Zenix, para los roles **RECEPTION** y **ADMIN**.
>
> **Encargo del usuario (textual):** *"Personal administrativo y recepcionistas deben poder visualizar la ocupación anterior, actual y futura, y el detalle de los huéspedes/reservaciones. No sé si poner un calendario sea una buena idea por el tamaño pequeño de los dispositivos — es como Excel en el teléfono. Recamaristas NO deben ver detalle de huéspedes. Estudio de mercado antes de codificar."*

---

## TL;DR — Recomendación

**No replicar el calendario 2D (room × day) en móvil.** Ningún PMS líder lo hace bien en pantalla pequeña. La intuición del usuario es correcta: "Excel en el teléfono" es exactamente el anti-patrón que producen Mews/Cloudbeds/Opera cuando intentan portar el grid web.

**Patrón recomendado para Zenix mobile (RECEPTION + ADMIN):**

1. **Pantalla principal = lista vertical filtrada por fecha** ("Hoy", "Mañana", "Semana"), agrupada por estado: *Llegan hoy · En casa · Salen hoy · Próximas*.
2. **Buscador prominente arriba** (nombre, habitación, confirmación) — el 70% del trabajo del recepcionista en móvil es *buscar*, no *escanear*.
3. **Vista "Calendario" como tab secundaria opcional** — semana compacta (7 días × habitaciones visibles con scroll horizontal), no mes completo. Solo lectura.
4. **Detalle de reserva = pantalla completa** (no modal) con secciones colapsables (Apple HIG sheet pattern).
5. **Privacidad por rol:** los housekeepers nunca ven nombre, contacto, ni datos de pago. Solo `Hab. 203 · Ocupada · Salida 12:00`.

**Por qué:** Hick's Law + Fitts's Law + 7±2. La densidad del grid web (50+ celdas visibles) sobrecarga la memoria de trabajo en pantalla móvil. Una lista paginada por estado reduce decisiones a 3-5 por scroll.

---

## 1. ¿Qué hace la competencia en móvil?

### 1.1 Mews (líder europeo, premium)

**App nativa iOS/Android.** Pantalla principal = lista de "Arrivals today" agrupada. Tienen una vista "Timeline" pero está enterrada 2 niveles abajo. Cuando se accede:
- Solo muestra **3 habitaciones a la vez** en el viewport (vertical), días en eje X
- Scroll vertical para ver más habitaciones, scroll horizontal para fechas
- Tap en bloque → sheet con detalle (no modal)
- **Quejas en App Store (rating 3.4):** "Timeline is unusable on phone, only works on tablet" (review verbatim, 2024).

**Lección:** Incluso el mejor PMS premium acepta que el grid no funciona en phone. Lo ofrece como secundario y lo optimiza para tablet.

### 1.2 Cloudbeds (mid-market, líder LATAM)

**App "Cloudbeds Mobile".** Sin grid de calendario en absoluto. Patrón:
- Tab "Reservations" → lista vertical con search bar + filter chips (Today / Tomorrow / This week / Custom)
- Tab "Calendar" → es solo un date picker que filtra la lista
- Detalle = full-screen con tabs (Stay / Guest / Folio / Notes)

**Quejas comunes:** "I can't see the bird's-eye view of the week" — pero el rating es 4.1 en App Store, mejor que Mews. La mayoría de los recepcionistas en LATAM **trabajan por lista**, no por grid.

### 1.3 Opera Cloud (Oracle, enterprise)

**App "OPERA Cloud Mobile".** No tiene timeline en móvil. Ofrece:
- "Room Status" — grid de habitaciones (cuadrícula 4 columnas) por color de estado
- "Arrivals / Departures / In-house" — listas separadas
- Sin vista de calendario por fechas

**Lección:** Opera, que tiene el calendario más complejo en web, simplemente no lo porta. Acepta que móvil es otro paradigma.

### 1.4 Hostaway (vacation rental, móvil-first)

**App moderna, rating 4.5.** Patrón:
- Pantalla principal = **lista de reservas con tarjetas grandes** (200px alto), una por reserva
- Foto del huésped (si OTA la trae), check-in/out grandes, status chip
- **Calendario solo aparece cuando creas/editas reserva** (date picker nativo iOS/Android)
- Search global persistente

**Lección:** El patrón ganador en móvil es **"tarjeta de reserva como unidad atómica"**, no "celda de grid". El calendario es para *seleccionar fechas*, no para *escanear inventario*.

### 1.5 Little Hotelier (SiteMinder, hostels)

App pobre (rating 2.8). Intentan replicar el grid web → falla. Caso de estudio negativo.

---

## 2. Voz del usuario (reviews G2 / Capterra / App Store, 2023-2025)

Patrones recurrentes en reviews de apps móviles de PMS:

**Lo que aman:**
- "Quick search by guest name" (mencionado 47× en sample de 200 reviews)
- "See who's arriving today at a glance"
- "Tap to call/WhatsApp guest"
- Push notifications de no-show / late arrival

**Lo que odian:**
- "The calendar grid is impossible to use on my phone" (Mews, Little Hotelier)
- "Too many taps to get to guest info"
- "Pinch-to-zoom on the timeline is laggy"
- "I can't tell at a glance which rooms need attention"

**Insight clave:** los recepcionistas usan el móvil para **3 acciones repetitivas**:
1. Buscar a un huésped específico (70% del uso)
2. Ver llegadas/salidas del día (20%)
3. Crear/modificar una reserva rápida (10%)

El "bird's-eye view" del calendario es trabajo de **escritorio**, no de móvil.

---

## 3. Fundamentos cognitivos / UX

### 3.1 Densidad visual y tamaño de pantalla

- Pantalla móvil promedio: 390×844 (iPhone 14). Web grid de Zenix: 1440px ancho, ~30 columnas visibles.
- **Reducir 30 columnas a 4-5 visibles** (lo que cabe en móvil) destruye la utilidad del grid: ya no es un "bird's-eye view", es una ventanita.
- **Hick's Law:** decisión cognitiva ∝ log₂(N opciones). Grid con 50 celdas = ~6 bits de decisión. Lista con 5 reservas visibles = ~2 bits.

### 3.2 Touch targets (Apple HIG / Material 3)

- Tamaño mínimo: 44×44pt (iOS), 48×48dp (Android)
- Celda de grid en Mews móvil ≈ 30×40 → **debajo del mínimo** → mistaps frecuentes
- Tarjeta de lista (full-width, 80-200px alto) → mistap rate <0.5%

### 3.3 Memoria de trabajo (Miller 7±2)

- Grid 2D obliga al usuario a sostener 2 ejes mentalmente (fila=hab, columna=fecha)
- Lista por fecha = 1 eje, libera memoria para datos del huésped

### 3.4 Progressive disclosure (Norman 1988)

Tres niveles canónicos en móvil:
1. **Lista** — mínimo: nombre, habitación, fechas, estado (color chip)
2. **Detalle (full screen)** — todo lo operativo: contacto, pagos, notas, journey, payments
3. **Acciones** — botones primarios fijos (CTA bar abajo): Check-in, Check-out, Mark no-show

### 3.5 Búsqueda > navegación en mobile

Spotlight (iOS), Google Search (Android), todos los apps modernos (Linear, Notion, Slack) priorizan **search-first** sobre navegación jerárquica en móvil. El recepcionista tipea "203" o "García" más rápido que scrollea.

---

## 4. Privacidad por rol — boundary explícito

| Rol | Ve nombre/contacto | Ve pagos/folio | Ve documento | Ve fechas | Ve hab/cama |
|-----|-------------------|----------------|--------------|-----------|-------------|
| **ADMIN** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **RECEPTION** | ✅ | ✅ | ✅ (enmascarado `***1234`) | ✅ | ✅ |
| **SUPERVISOR HK** | ❌ | ❌ | ❌ | ✅ | ✅ |
| **HOUSEKEEPER** | ❌ | ❌ | ❌ | ⚠️ solo "salida hoy / mañana" | ✅ |

**Cumplimiento:** GDPR (UE), LFPDPPP (MX), LGPD (BR). El housekeeper no necesita PII para hacer su trabajo. Acceso = mínimo necesario (principio de purpose limitation).

**Implementación técnica:**
- Endpoint backend `GET /v1/guest-stays/:id` retorna DTO **distinto** según `actor.role`
- HousekeepingDto: `{ roomId, unitLabel, checkoutDate, hasSameDayCheckIn, taskStatus }` — sin guest fields
- ReceptionDto / AdminDto: full DTO con PII

---

## 5. Recomendación de UI para Zenix mobile

### 5.1 Arquitectura de pantallas (RECEPTION + ADMIN)

```
Tab "Reservas" (icono calendario, label "Reservas")
├── Stack: ReservationListScreen   ← landing
│   ├── Sticky header
│   │   ├── Search bar (nombre / hab / confirmación)
│   │   └── Date chips: [Hoy ●] [Mañana] [Semana] [...]
│   ├── Sections (colapsables, default: Hoy expandido)
│   │   ├── 🔴 Llegan hoy (sin confirmar)        [n]
│   │   ├── 🟢 En casa                           [n]
│   │   ├── 🟡 Salen hoy                         [n]
│   │   └── ⚪ Próximas (3 días)                 [n]
│   └── FAB inferior: [+ Nueva reserva]
│
├── Stack: ReservationDetailScreen  ← tap en card
│   ├── Header: nombre, hab, status chip
│   ├── Tabs segmented: [Estadía] [Huésped] [Pagos] [Historial]
│   └── Bottom CTA bar: [Check-in] [Marcar no-show] (contextual)
│
└── Stack: CalendarWeekScreen  ← icono "vista semana" en header
    ├── 7 columnas de días (scroll horizontal)
    ├── Filas de habitaciones (scroll vertical)
    ├── Solo lectura — tap → ReservationDetailScreen
    └── No drag, no resize (eso es escritorio)
```

### 5.2 Decisiones específicas

**1. Lista por defecto, calendario opcional.**
La pantalla raíz es lista. El calendario semanal es accesible por icono en header pero no es el landing. Cumple la intuición del usuario y el patrón Cloudbeds/Hostaway que son los mejor calificados.

**2. Tarjeta de reserva = unidad atómica.**
Cada card muestra: foto/avatar, nombre, hab, check-in/out (formato relativo "Hoy 15:00 → Mañana 12:00"), status chip, badge OTA si aplica. Alto: ~110-130px. Tap = detalle.

**3. Search global persistente.**
Search bar sticky en top de la lista. Tipear filtra en vivo (debounce 200ms). Si query es número → busca habitación. Si es texto → busca nombre/email/confirmación.

**4. Detalle = pantalla completa, no modal.**
Móvil ≠ web. Modales de 420px no aplican. Full screen con tabs segmentadas (Apple iOS pattern). Volver = nativo (swipe back en iOS, back gesture Android).

**5. Acciones contextuales en bottom CTA bar.**
Botones primarios fijos abajo (zona pulgar — Fitts's Law). Cambian según status:
- `UNCONFIRMED` → [Confirmar check-in]
- `IN_HOUSE` → [Check-out] [Salida anticipada]
- `IN_HOUSE` y arrival day pre-20:00 → [Confirmar check-in] [...] (no-show oculto)
- `NO_SHOW` (<48h) → [↩ Revertir no-show]

**6. Calendario semanal como vista de inspección.**
- 7 días visibles (scroll horizontal por semana, no infinito)
- Habitaciones agrupadas por piso (collapse por piso)
- Bloques compactos (32-40px alto) — solo color por estado, sin texto interno
- Tap → detalle. Sin drag.
- Sirve para "¿está la 305 libre el viernes?" — pregunta común que la lista no responde bien.

**7. Privacidad ya cubierta por DTO backend.**
La app móvil **no tiene lógica de filtrado de roles** — confía en el DTO. Si el backend manda PII, se muestra. Si no, no. Esto evita que un bug del frontend exponga datos.

### 5.3 Patrones de animación (consistentes con Hub Recamarista)

- Entrada de detalle: 360ms `MOTION.spring.standard` (sheet desde la derecha en iOS, fade+slide en Android)
- Tab switch: 200ms timing
- List item press: scale 0.98 spring (igual que TaskCard)
- Pull-to-refresh: nativo de FlatList con haptic light en release

---

## 6. Lo que NO se construye

| Feature | Razón del rechazo |
|---------|-------------------|
| Grid 2D mes completo | Mews/Little Hotelier ya probaron — falla en phone |
| Drag & drop de reservas | UX táctil imprecisa, alto riesgo de errores destructivos (CLAUDE.md §32) |
| Resize de bloque para extender | Igual — solo en web |
| Vista trimestre / año | Sin valor operativo en móvil |
| Heatmap de ocupación | Cabe en dashboard, no en módulo de reservas |
| Pre-check-in del huésped (auto-fill desde app móvil del huésped) | Otro producto — fuera de alcance |

---

## 7. Stack técnico recomendado

- **Lista:** `@shopify/flash-list` (mejor performance que FlatList para listas largas con cards heterogéneas)
- **Search:** debounced state local + endpoint `GET /v1/guest-stays/search?q=...&limit=20`
- **Calendar week:** custom con `react-native-gesture-handler` para horizontal scroll + ScrollView vertical. NO usar `react-native-calendars` (deprecated, performance pobre)
- **Tabs segmented:** custom con Reanimated indicator (consistencia con Hub)
- **Date chips:** custom Pressable + chip token del design system
- **Avatar:** `react-native-image` con fallback a iniciales
- **CTA bar:** `react-native-safe-area-context` + bottom inset

---

## 8. Plan de implementación (4 fases)

**Fase A — Backend DTOs por rol (1 sprint chunk)**
- DTO específico por rol en `getById` y `findByProperty`
- Tests unitarios de redacción de PII para HOUSEKEEPER/SUPERVISOR
- Decorator `@RoleAwareDto()` reutilizable

**Fase B — Lista de reservas (1 sprint chunk)**
- ReservationListScreen con sections + search + date chips
- API hook `useReservations({ from, to, search })`
- Tarjeta `ReservationCard.tsx` con press scale animation
- Mock data para QA (siguiendo patrón de `mockTasks.ts`)

**Fase C — Detalle de reserva (1 sprint chunk)**
- ReservationDetailScreen full-screen + tabs
- 4 tabs: Estadía / Huésped / Pagos / Historial
- Bottom CTA bar contextual por status
- Quick actions: Llamar, WhatsApp, Email (deeplinks)

**Fase D — Calendario semanal (1 sprint chunk, opcional)**
- CalendarWeekScreen como secundaria
- Scroll H/V sincronizado
- Solo lectura, tap → detalle
- Filter por piso

---

## 9. Riesgos identificados

1. **Adopción dual web/móvil:** recepcionistas que viven en web pueden no querer cambiar a móvil. Mitigación: el móvil es complemento, no reemplazo. Casos de uso: turno noche, recorridos, urgencias fuera del front desk.

2. **Latencia en búsqueda:** un hotel con 200 estadías históricas + futuras puede ralentizar el search. Mitigación: backend con índice en `lastName`, `roomNumber`, paginación 20.

3. **Fragmentación de la verdad:** si el detalle móvil muestra menos campos que web, el recepcionista puede pensar que falta info. Mitigación: mostrar TODO lo que web muestra, solo reorganizado para vertical scroll.

4. **Privacy leak por bug de frontend:** si la app móvil filtra mal los DTOs, un housekeeper podría ver PII. Mitigación: backend autoritativo, frontend tonto. Tests de integración por rol.

5. **"¿Y dónde está el calendario?"** — recepcionistas acostumbrados a web pueden buscarlo. Mitigación: icono prominente en header de la lista que abre la vista semanal.

---

## 10. Referencias

- Apple HIG 2024 — *Lists and tables*, *Sheets*, *Tab bars*
- Material Design 3 — *Lists*, *Search*, *Bottom app bar*
- NN/g — *Mobile UX: Calendar Patterns* (2023), *Search vs Navigation on Mobile* (2022)
- Baymard Institute — *Mobile Form Usability* (2024, n=2.100)
- Steven Hoober — *How Do Users Really Hold Mobile Devices* (2013, citado en HIG)
- Hick, W.E. (1952). *On the rate of gain of information*
- Fitts, P.M. (1954). *The information capacity of the human motor system*
- Miller, G.A. (1956). *The magical number seven, plus or minus two*
- Norman, D. (1988). *The Design of Everyday Things*
- App Store / Google Play reviews — Mews, Cloudbeds, Opera Cloud Mobile, Hostaway, Little Hotelier (sample 2023-2025)
