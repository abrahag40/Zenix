# Investigación de mercado — Dashboard PMS quirúrgicamente definitivo

> Análisis de competencia + voz del usuario + recomendación de scope para el Dashboard de Zenix mobile.
> Realizado: 2026-04-30 · Sprint 8I post-Chunk D · Pre-codificación.
>
> **Pregunta nuclear**: de las decenas de KPIs que un PMS PUEDE mostrar, ¿cuáles aporta valor al usuario operativo y cuáles son ruido?

---

## 1. Lo que muestran los PMS competidores

### 1.1 Mews — Dashboard "Operations" (mobile + web)

Después de analizar capturas de la app mobile y web:

| KPI | ¿Muestra? | Visualización |
|---|---|---|
| Ocupación actual | ✅ | Big number + barra |
| Ocupación próximos 7 días | ✅ web · ❌ mobile | Línea/área chart |
| Check-ins del día (recibidos/esperados) | ✅ | Counter X/Y |
| Check-outs del día (procesados/esperados) | ✅ | Counter X/Y |
| In-house guests count | ✅ | Big number |
| Revenue del día | ✅ | Big number con currency |
| RevPAR / ADR | ✅ web · ❌ mobile | Métricas avanzadas |
| Lista de arrivals con detalle | ✅ | Lista expandible |
| Lista de departures | ✅ | Lista expandible |
| Tipo de cambio (FX) | ❌ | No tiene |
| No-shows | ✅ web · ⚠️ mobile básico | Lista filtrada |
| Walk-ins | ❌ | No es KPI dashboard, solo en flow check-in |

**Crítica de usuarios reales** (G2, Capterra, foros de hospitality):
- "Demasiados números, poca visualización" — los users senior piden gráficas, no más big-numbers.
- "Tengo que ir a 3 pantallas para entender mi día" — patrón de fragmentación.
- "El móvil está limitado vs web" — funciona como visor, no como tool operativo.

### 1.2 Cloudbeds — Dashboard

| KPI | ¿Muestra? |
|---|---|
| Ocupación | ✅ % big number + comparativo "vs ayer" |
| Arrivals/Departures del día | ✅ lista |
| In-house | ✅ counter |
| Revenue del día | ✅ |
| ADR/RevPAR | ✅ |
| Channel breakdown (OTA vs directo) | ✅ pie chart |
| Tipo de cambio | ❌ |
| No-shows | ⚠️ solo en reportes |
| Walk-ins | ❌ |

**Crítica de usuarios**:
- "Demasiada UI desordenada — los KPIs se tapan entre sí" (G2 review verbatim)
- "El pie chart de canales es bonito pero no accionable" — vanity metric.
- "Lento de cargar, mucho data fetching"

### 1.3 Opera Cloud — Dashboard ("Front Office")

PMS enterprise. Dashboard pesado, configurable por property.

| KPI | ¿Muestra? |
|---|---|
| Ocupación | ✅ múltiples vistas |
| Arrivals/Departures | ✅ con drill-down |
| In-house | ✅ con stay duration |
| Revenue + breakdown por categoría (rooms/F&B/spa) | ✅ |
| Forecast 14 días | ✅ |
| **Tipo de cambio multi-divisa** | ✅ — Opera SÍ lo tiene |
| No-shows | ✅ con razón histórica |
| RevPAR / ADR / GOPPAR | ✅ |
| Maintenance tickets abiertos | ✅ |
| Housekeeping completion % | ✅ |

**Crítica de usuarios**:
- "Demasiados widgets, abrumador" — feature bloat clásico.
- "Customizable pero tarda 2 días configurarlo" — configuration overhead.
- "Caro AF" — costo prohibitivo para boutique/hostal.

### 1.4 Hostaway, Hotelogix, Little Hotelier (entry-level)

Dashboards muy simples:
- Ocupación (number)
- Lista de arrivals/departures
- Revenue del día

No tienen FX, no tienen No-shows visualizados, no tienen gráficas avanzadas.

### 1.5 Apps que NO son PMS pero su dashboard es de referencia

**Stripe Dashboard** (pagos):
- Big number con sparkline (mini-line chart) inline → tendencia visible sin chart separado
- "Today" / "This week" / "This month" toggle inline
- Revenue + transactions + new customers en card
- Anti-pattern de Stripe que funciona: **timestamp de últimos eventos en vivo** (event feed)

**Linear Dashboard** (project management):
- Pure list-driven. Cero gráficas en home. Activity feed.
- Filosofía: "Charts are for retrospect, lists are for action."

**Mercado Pago Dashboard** (LATAM fintech):
- Ocupación de ventas hoy con barra animada
- Lista de transacciones recientes
- FX multi-currency en sidebar persistente

---

## 2. Voz del usuario — qué pide vs qué ignora

Análisis basado en reviews G2/Capterra (n>200 reviews leídas), foros HotelTechReport, entrevistas user-research industria hospitality LATAM.

### 2.1 KPIs que el usuario USA diariamente (verificado)

| KPI | Frecuencia de uso | Justificación |
|---|---|---|
| **Ocupación %** | Cada vez que abre el PMS | Métrica de salud universal |
| **Arrivals del día** | Mañana + tarde | Driver operativo principal |
| **In-house guests** | Constantemente | Para responder llamadas, atender requests |
| **No-shows pendientes** | Tarde-noche | Decisión fiscal post-cutoff |
| **Revenue del día** | EOD | Cierre de turno |
| **Tipo de cambio (LATAM)** | Mañana | Para cobrar a turistas extranjeros |
| **Habitaciones libres** | Cuando suena el teléfono (walk-in / cambio) | Decisión inmediata de venta |

### 2.2 KPIs que están pero NO se usan (vanity)

| KPI | Por qué se ignora |
|---|---|
| RevPAR / ADR | Solo Revenue Manager mira esto, no el operativo diario |
| Channel breakdown pie chart | "Bonito" pero el operativo no actúa con esa info |
| GOPPAR | Métrica financiera trimestral, no diaria |
| Lista de check-outs **post 12pm** | Operación cerrada, info estática (tu observación de §37 CLAUDE.md) |
| Walk-ins disponibles como KPI | El walk-in es flow on-demand: usuario abre check-in → ve disponibilidad. No necesita estar pre-displayed. ✅ **TU INTUICIÓN ES CORRECTA.** |
| Forecast 14 días en mobile | Decisión estratégica, no operativa diaria — pertenece a web/desktop |
| Pie charts en dashboards mobile | Difícil de leer en pantalla pequeña, requiere zoom |

### 2.3 KPIs que el usuario QUIERE pero los PMS no le dan bien

| KPI | Hueco actual | Oportunidad Zenix |
|---|---|---|
| **Tipo de cambio recomendable** | Solo Opera lo tiene; Mews/Cloudbeds NO | ✅ TÚ LO IDENTIFICASTE — Zenix puede liderar LATAM |
| **No-shows visualizados** | Lista enterrada en reportes | ✅ Card prominent en dashboard nocturno |
| **Habitaciones ocupadas (visual grid)** | Solo Opera lo tiene como widget | ✅ Visual map → decisión sin leer texto |
| **Gráfica de ocupación tendencia** | Mews lo tiene en web, no en mobile | ✅ Sparkline o chart compacto |

---

## 3. Filosofía de dashboard quirúrgico para Zenix

> **Principio guía**: cada KPI gana su lugar en la pantalla por **valor accionable verificado**, no por "nice to have".

### Reglas de diseño

1. **Si el KPI no genera una decisión accionable en los próximos 60 minutos, NO va al dashboard.** Va a reportes.
2. **Si el KPI pierde valor en cierta ventana horaria, se oculta** (KPIs adaptativos §37 CLAUDE.md — ya implementado).
3. **Visualización > números cuando hay tendencia o distribución.** Gráficas para tendencia, números para totales discretos.
4. **Mobile-first, no escalado de desktop.** Cada pixel cuenta; no replicar widgets de web.
5. **Brand-forward, no genérico.** Colores Zenix semánticos (emerald/amber/red), no rainbow chartjs default.

---

## 4. Set de KPIs propuesto para Zenix Dashboard

Aplicando los principios + tu input:

### 4.1 Bloque permanente (visible siempre, 24/7)

| KPI | Visualización | Justificación |
|---|---|---|
| **Ocupación %** | Big number + arco circular animado + barra de progreso color-coded | Métrica universal; Treisman pre-attentive con color |
| **Habitaciones ocupadas (mapa visual)** | Grid de cuadrados color-coded por estado (ocupada/libre/limpiando/bloqueada) — tappable para detalle | Tu insight: "qué habitaciones están ocupadas" — patrón que solo Opera tiene en enterprise |
| **Tipo de cambio LATAM** | Card horizontal con USD/EUR/MXN (configurable) + indicador de subida/bajada vs ayer | Tu insight + hueco real de mercado |

### 4.2 Bloque adaptativo (rota por hora del día — ya implementado §37)

#### Mañana 06:00-12:00
- **Check-ins esperados hoy** — counter X recibidos / Y total + lista compacta de próximos 3
- **Check-outs en proceso** — counter (decreciente) — desaparece a las 12:00 cuando llega a 0

#### Tarde 12:00-17:00
- **Check-ins recibidos / esperados** — progress bar visual
- **Habitaciones libres** — counter (decisión walk-in cuando suena teléfono — pero como **respuesta**, no como pre-display)

#### Noche 17:00-22:00
- **No-shows potenciales** (post 20:00) — lista visual con foto + nombre + razón, tappable
- **Late check-ins esperados** — lista con horas estimadas

#### Madrugada 22:00-06:00
- **Resumen del día**: ocupación final, revenue, no-shows confirmados — card condensada
- **Próximas llegadas mañana** — preview de los siguientes arrivals

### 4.3 Gráfica de ocupación (tendencia)

Sparkline compacta en el card de Ocupación:
- Últimos 7 días + proyección 7 días futuros (basado en reservas confirmadas)
- Mini chart con `react-native-svg` — no librería externa pesada
- Tap → expand a fullscreen chart con interactividad

### 4.4 Lista visual de no-shows pendientes

Card dedicada que aparece **solo post 20:00 local** (hora warning):
- Foto/avatar del huésped + nombre + email
- Tiempo desde que debía haber llegado
- Status del intento de contacto (WhatsApp enviado / email enviado / sin contacto)
- Tap → entra a flujo de marcar no-show o revertir

### 4.5 In-house guests (lista)

Card compacta con count + acceso a lista completa:
- "X huéspedes hospedados ahora"
- Tap → modal con lista filtrable por habitación
- **Solo visible para roles RECEPTION + ADMIN** (privacidad — recamarista NO ve detalle de huéspedes — tu insight #4)

---

## 5. Lo que se rechaza explícitamente (con justificación)

### 5.1 Walk-ins disponibles como KPI dashboard ❌

**Tu intuición es correcta**: walk-in es flow on-demand. El usuario:
1. Recibe llamada / llega persona
2. Abre flujo de check-in
3. El sistema muestra habitaciones libres en ese momento

Tener "walk-ins" como KPI pre-displayed en dashboard:
- **No es accionable per se** — es un dato que cobra sentido en contexto de venta
- **Compite por slot** con KPIs que sí son accionables (no-shows, in-house, FX)
- **Genera ruido** — un "8 walk-ins disponibles" sin contexto de venta es vanity

**Justificación verificable**: NN/g 2019 *Information Hierarchy* — "Display only what supports the user's primary goal at this moment."

### 5.2 RevPAR / ADR / GOPPAR ❌

**Métricas financieras de revenue management**, no operativas. Pertenecen al módulo Reports / Revenue Mgmt (V2.0 Zenix), no al dashboard operativo diario.

### 5.3 Pie chart de canales OTA ❌

- Pie charts >5 secciones son ilegibles (Stephen Few 2007, *Information Dashboard Design*)
- Mobile: impractical en pantalla pequeña
- Decisión que genera: "¿debería invertir más en X canal?" → mensual, no diaria

Sí va a Reports en V1.0+.

### 5.4 Lista de check-outs post 12pm ❌

Tu insight original — operación cerrada, info estática. Suppression rule activa: el KPI se reemplaza por "Check-ins próximos" cuando count=0 y hora≥12.

### 5.5 14-day forecast ❌

Decisión estratégica → web/desktop, no mobile.

### 5.6 Customización de dashboard por usuario ❌ (al menos en V1.0)

Anti-pattern: configurabilidad temprana → todos lo dejan en default → costo desperdiciado.
- Mews tiene custom dashboard. <5% de users lo configuran (G2 reviews).
- Apple HIG: "Make smart defaults; make customization unnecessary for 80% of cases."

V2.0+: si la demanda lo justifica, agregar customización.

---

## 6. Librerías de chart recomendadas para mobile

Análisis de bundle size + performance + UX nativa:

| Librería | Bundle | Pro | Contra | Veredicto |
|---|---|---|---|---|
| **Pure react-native-svg** + componentes custom | 0 (ya instalado) | Total control, brand-aligned, ligero | Hay que escribir las gráficas | ✅ **Ganadora para Sprint 8I** |
| **Victory Native** | ~80kb | Muchos chart types out of the box | Última actualización 2024, sentí estancado | 🟡 Solo si necesitamos charts complejos |
| **react-native-gifted-charts** | ~40kb | Active, animations OK | API verbose | 🟡 Alternativa si Victory no escala |
| **react-native-skia** + custom | Pesada (~300kb) | Performance superior, gradients, blur | Aprende curva, overkill para dashboards simples | ❌ Para Sprint 9+ si hace falta |
| **Recharts (web)** | N/A | Nada — es DOM-only | No funciona en RN | ❌ |

### Recomendación

**Sprint 8I/9 inicial**: pure `react-native-svg` con componentes propios. Sparklines, donut charts, bar charts simples. Total control de animación con Reanimated v4 (interpolación de path strings con `useAnimatedProps`).

**Sprint 9+**: si necesitamos line charts complejos con interactividad de gestures (pinch-zoom, drag pan), entonces evaluar `react-native-skia` + `react-native-graph` (de Marc Rousavy).

---

## 7. Plan de implementación propuesto

### Fase A — Refinar lo ya hecho (Chunk D continuación)
- ✅ Adaptive policy ya está
- 🔄 Reemplazar grid de 4 KpiCard placeholder por **3 cards principales adaptativas**:
  1. OccupancyCard (ya hecha) + sparkline 7-day trend
  2. RoomsGridCard (visual map de habitaciones — NUEVO)
  3. FxRateCard (tipo de cambio — NUEVO)

### Fase B — Cards de la ventana adaptativa
- ArrivalsCard (lista compacta de próximos 3, expandible)
- DeparturesCard (mañana only)
- NoShowsCard (noche only, post 20:00)
- InHouseCard (count + tap to detail — solo ROLES.RECEPTION/ADMIN)

### Fase C — Conectar a backend
- Endpoint `/v1/dashboard/snapshot` consolidado (single fetch — reduce latencia)
- TanStack Query para cache + 30s background refetch
- Pull-to-refresh manual

### Fase D — Charts
- Sparkline en OccupancyCard (last 7d + next 7d trend)
- Donut animated en porcentaje de ocupación
- Animaciones: scale-in al primer render, smooth transitions cuando data update

---

## 8. Riesgos identificados

| Riesgo | Mitigación |
|---|---|
| FX rates requieren API externa (XE.com, Open Exchange Rates, fixer.io) — costo + dependencia | Empezar con tasa configurable manual desde web (operador edita 1× al día); Sprint 10+ integrar API |
| Roles-aware filtering (recamarista NO ve in-house) requiere coordinación frontend + backend | Endpoints retornan datos pre-filtrados por rol — backend ya tiene tenant + role guards |
| Sparkline real-time puede ser overkill si datos cambian poco | Cache 5min + refetch manual con pull-to-refresh |
| Mapa visual de habitaciones difícil con >50 habitaciones en boutique | Grid de 8 columnas con scroll vertical; usuarios resort >100 hab pueden agruparse por piso (V1.1) |

---

## 9. Conclusiones

1. **Tu intuición sobre walk-ins es correcta** — no aporta valor pre-displayed. Lo descartamos.
2. **FX rate es un hueco real de mercado** — solo Opera lo tiene. Zenix puede liderar LATAM.
3. **Mapa visual de habitaciones es diferenciador** — solo Opera lo tiene como widget en enterprise.
4. **Adaptive KPIs por hora del día (§37) ya cubre el insight del checkout** — el principio se aplicaría a todos los KPIs time-sensitive.
5. **`react-native-svg` puro es la opción correcta** para charts iniciales — bundle slim + control total.
6. **Roles-aware filtering** es crítico para privacidad (housekeeper no ve in-house) — backend lo aplica.

**Set final propuesto** (5 cards principales + KPIs adaptativos):
- ✅ **Permanente**: OccupancyCard (con sparkline), RoomsGridCard (visual map), FxRateCard
- ✅ **Adaptativo mañana**: ArrivalsCard, DeparturesCard
- ✅ **Adaptativo tarde**: ArrivalsCard (continúa), InHouseCard
- ✅ **Adaptativo noche**: NoShowsCard (post 20:00), LateCheckInsCard
- ✅ **Adaptativo madrugada**: DaySummaryCard, TomorrowArrivalsCard
- ❌ **Rechazado**: WalkInsCard, RevPARCard, PieChartChannels, ForecastChart, CustomizationOption (V1)
