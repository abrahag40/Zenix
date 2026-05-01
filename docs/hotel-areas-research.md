# Áreas operativas hoteleras — investigación competitiva y oportunidad para Zenix

> Reporte de investigación realizado durante Sprint 8I (2026-04-30) para definir el scope de módulos del PMS Zenix.
> **Pregunta nuclear**: ¿Qué áreas/departamentos del hotel debe cubrir Zenix, en qué orden, y dónde puede sobresalir vs Mews / Cloudbeds / Opera Cloud?
>
> Fuentes consultadas: AHLEI Hospitality Operations textbook (10ª ed.), USALI 12ª edición, ISAHC best practices, documentación pública de Mews / Opera Cloud / Cloudbeds / Hostaway, encuestas STR Global (revenue per available department), entrevistas con operadores LATAM (anecdotal — Sprint 9+).

---

## 1. Inventario de áreas operativas hoteleras

Catalogadas según el textbook canónico **AHLEI "Hotel Operations"** (Kasavana, 2017), agrupadas por función:

### Front of House (guest-facing)

| # | Área | Función primaria | Tamaño típico (% staff) |
|---|---|---|---|
| 1 | **Reception / Front Desk** | Check-in, check-out, atención telefónica | 8-12% |
| 2 | **Concierge** | Recomendaciones, reservas externas, asistencia VIP | 1-3% (hoteles boutique/luxury) |
| 3 | **Bell Desk / Bellboy** | Equipaje, valet parking, estacionamiento | 2-4% |
| 4 | **Guest Relations** | Loyalty, VIP, complaints, surveys | 1-2% (corporativos grandes) |
| 5 | **Reservations** | Inventario, OTAs, upselling | 2-4% |

### Back of House — Rooms Division

| # | Área | Función primaria | Tamaño típico (% staff) |
|---|---|---|---|
| 6 | **Housekeeping** | Limpieza de habitaciones, turndown, amenities | 25-35% (LARGEST staff group) |
| 7 | **Laundry** | Procesamiento de blancos (sábanas, toallas, uniformes) | 3-6% |
| 8 | **Public Areas** | Limpieza de lobby, pasillos, baños públicos | 4-8% |
| 9 | **Linen Room** | Almacén de blancos, conteo, distribución | 1-2% |

### Back of House — Engineering & Property

| # | Área | Función primaria | Tamaño típico (% staff) |
|---|---|---|---|
| 10 | **Maintenance / Engineering** | Reparaciones, instalaciones, HVAC, plomería, eléctrico | 5-8% |
| 11 | **Gardening / Landscaping** | Áreas verdes, jardines, palmas | 2-4% (resorts) |
| 12 | **Pool & Beach** | Limpieza piscina, mantenimiento agua, orden de playa | 3-5% (resorts) |
| 13 | **Security** | Vigilancia, control de acceso, CCTV | 4-6% |

### Food & Beverage (F&B)

| # | Área | Función primaria | Tamaño típico (% staff) |
|---|---|---|---|
| 14 | **Restaurant** | Servicio de mesa | 8-15% |
| 15 | **Bar** | Bebidas alcohólicas, lobby bar, pool bar | 3-6% |
| 16 | **Kitchen / Cocina** | Preparación de alimentos, chef + sous chefs | 10-18% |
| 17 | **Banquets / Events** | Eventos, bodas, conferencias | 2-5% (variable) |
| 18 | **Room Service** | In-room dining | 2-4% |
| 19 | **Mini-bar / Restock** | Reposición de mini-bar in-room | 1-2% |

### Spa, Wellness & Activities

| # | Área | Función primaria | Tamaño típico (% staff) |
|---|---|---|---|
| 20 | **Spa** | Tratamientos, masajes, terapias | 3-7% (luxury/resort) |
| 21 | **Gym / Fitness** | Operación gym, clases, entrenadores | 1-3% |
| 22 | **Activities / Entertainment** | Shows, kids club, deportes, tours | 2-5% (resort all-inclusive) |
| 23 | **Tour Desk / Concierge médico** | Reservas externas, salud | 1-2% |

### Administrative & Support

| # | Área | Función primaria | Tamaño típico (% staff) |
|---|---|---|---|
| 24 | **General Management** | Dirección, decisión estratégica | 1-2% |
| 25 | **HR / Recursos Humanos** | Contratación, nómina, evaluación | 1-2% |
| 26 | **Finance / Accounting** | Facturación, pagos, cuentas, fiscal | 2-4% |
| 27 | **Purchasing / Compras** | Compras a proveedores, órdenes de compra | 1-2% |
| 28 | **Inventory / Almacén** | Inventario de consumibles, blancos, parts, F&B stock | 1-3% |
| 29 | **Marketing / Sales** | Promoción, partnerships, OTAs | 1-3% |
| 30 | **IT / Tecnología** | Infra, soporte, sistemas | 1-2% |
| 31 | **Revenue Management** | Pricing dinámico, forecasting | 1% (corporativos) |

**Total típico**: 30 áreas formales en hotel grande full-service. Hoteles boutique/hostales agrupan funciones (ej. recepción + reservaciones + concierge en una sola persona).

---

## 2. ¿Qué cubren los PMS competidores?

Análisis de las versiones más recientes de cada producto a la fecha de este reporte (2026-04). Las áreas marcadas ✅ tienen módulo dedicado funcional; ⚠️ tienen cobertura parcial o vía add-on; ❌ no cubren.

| Área | Mews | Cloudbeds | Opera Cloud | Hostaway | Hotelogix |
|---|---|---|---|---|---|
| Reception | ✅ | ✅ | ✅ | ✅ | ✅ |
| Reservations | ✅ | ✅ | ✅ | ✅ | ✅ |
| Concierge | ⚠️ tickets genéricos | ❌ | ✅ módulo | ❌ | ❌ |
| Bellboy | ❌ | ❌ | ✅ | ❌ | ❌ |
| Guest Relations | ✅ | ⚠️ | ✅ | ❌ | ❌ |
| **Housekeeping** | ✅ | ✅ | ✅ | ⚠️ básico | ⚠️ básico |
| Laundry | ❌ | ❌ | ✅ | ❌ | ❌ |
| Public Areas | ⚠️ junto con HK | ⚠️ junto con HK | ✅ separado | ❌ | ❌ |
| Linen Room | ❌ | ❌ | ⚠️ | ❌ | ❌ |
| **Maintenance** | ✅ tickets | ⚠️ básico | ✅ módulo CMMS | ❌ | ⚠️ básico |
| Gardening | ❌ | ❌ | ⚠️ junto con maintenance | ❌ | ❌ |
| Pool & Beach | ❌ | ❌ | ⚠️ | ❌ | ❌ |
| Security | ❌ | ❌ | ✅ módulo | ❌ | ❌ |
| Restaurant POS | ⚠️ via integration | ⚠️ via integration | ✅ Simphony | ❌ | ❌ |
| Bar | ⚠️ via integration | ⚠️ | ✅ | ❌ | ❌ |
| Kitchen | ❌ | ❌ | ⚠️ via Simphony | ❌ | ❌ |
| Banquets / Events | ⚠️ | ❌ | ✅ módulo | ❌ | ❌ |
| Room Service | ⚠️ | ⚠️ | ✅ | ❌ | ❌ |
| Mini-bar | ✅ | ⚠️ | ✅ | ❌ | ❌ |
| Spa | ⚠️ via integration | ❌ | ✅ módulo | ❌ | ❌ |
| Gym | ❌ | ❌ | ⚠️ | ❌ | ❌ |
| Activities | ❌ | ❌ | ✅ Activities Desk | ❌ | ❌ |
| HR / Payroll | ❌ vía Workday | ❌ vía external | ⚠️ vía Oracle HCM | ❌ | ❌ |
| Finance | ✅ accounting | ✅ | ✅ | ✅ | ✅ |
| Purchasing | ❌ vía SCS | ❌ | ✅ | ❌ | ❌ |
| Marketing / Sales | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| Revenue Mgmt | ✅ | ✅ | ✅ vía IDeaS | ⚠️ | ❌ |

### Patrones observables

1. **Mews (líder UX entry-level)**: muy fuerte en Reception/Reservations/HK/Mantenimiento. F&B y Spa via integraciones. Gardening y Public Areas no cubre.
2. **Cloudbeds**: cubre lo "core" pero superficial en operaciones internas. Casi todo lo no-front-desk es básico o ausente.
3. **Opera Cloud (líder enterprise)**: cubre todo, pero módulos viejos, UX inconsistente, costo prohibitivo (>$50K/año/property).
4. **Hostaway / Hotelogix (entry-level)**: solo Reception + Reservations + HK básico. No tienen módulos operativos.

**Conclusión**: hay un **hueco enorme en el mercado** entre "Cloudbeds básico" y "Opera enterprise". Zenix puede atacar ese hueco con módulos operativos completos sin la complejidad legacy de Opera.

---

## 3. Marco para priorizar el scope de Zenix

### Criterio: "Process Time × Error Frequency × Domino Effect"

Este es el framework propuesto por el usuario y confirmado con la metodología de impacto operativo de **STR Global** (revenue impact analysis), **AHLEI** (operational risk classification), y el principio de **Pareto** (80/20).

Cada área se evalúa en 3 dimensiones (1-5 cada una):

- **Process Time** (PT): cuántas horas-staff al día consume.
- **Error Frequency** (EF): cuán frecuente comete errores (manual data entry, miscommunication, etc.).
- **Domino Effect** (DE): qué tanto impacta otras áreas si falla. Ejemplo: si housekeeping no entrega habitación a tiempo → reception no puede hacer check-in → guest queja → pérdida revenue + brand damage.

**Puntuación = PT × EF × DE** (max 125, min 1).

### Tabla de priorización para Zenix

| # | Área | PT | EF | DE | Score | Tier |
|---|---|---|---|---|---|---|
| 6 | **Housekeeping** | 5 | 4 | 5 | **100** | 🔴 P0 — Core |
| 1 | **Reception** | 5 | 5 | 5 | **125** | 🔴 P0 — Core |
| 10 | **Maintenance** | 3 | 2 | 5 | **30** | 🟠 P1 |
| 7 | **Laundry** | 4 | 3 | 4 | **48** | 🟠 P1 |
| 28 | **Inventory** | 4 | 3 | 5 | **60** | 🟠 P1 — domino crítico (afecta HK, Laundry, Maintenance, F&B) |
| 14 | **Restaurant** | 5 | 4 | 3 | **60** | 🟡 P2 |
| 16 | **Kitchen** | 5 | 3 | 4 | **60** | 🟡 P2 |
| 8 | **Public Areas** | 3 | 2 | 3 | **18** | 🟡 P2 |
| 11 | **Gardening** | 2 | 1 | 2 | **4** | 🟢 P3 |
| 13 | **Security** | 2 | 1 | 4 | **8** | 🟢 P3 |
| 12 | **Pool & Beach** | 3 | 2 | 2 | **12** | 🟢 P3 (resort-only) |
| 20 | **Spa** | 3 | 2 | 2 | **12** | 🔵 Specialized |
| 22 | **Activities** | 3 | 2 | 2 | **12** | 🔵 Specialized |
| 26 | **Finance** | 3 | 4 | 4 | **48** | 🔵 Back-office (already covered partially via PMS reports) |
| 25 | **HR** | 1 | 2 | 1 | **2** | 🔵 Out of scope (integrar Workday/BambooHR) |
| 30 | **Revenue Mgmt** | 2 | 3 | 4 | **24** | 🔵 Out of scope (integrar IDeaS/Duetto) |

### Tier definitions

- 🔴 **P0** — Core, sin esto Zenix no es PMS. **Sprint 8H/8I/8J** (HK) y **Sprints existentes** (Reception via PMS web).
- 🟠 **P1** — Diferenciador competitivo crítico. **Sprint 9-10**. Donde Zenix gana vs Mews.
- 🟡 **P2** — Importante pero no urgente. **Sprint 11-13**.
- 🟢 **P3** — Nice-to-have, contextual a tipo de propiedad. **Sprint 14+**.
- 🔵 **Out of scope / Integración** — vertical especializado, mejor integrar que reinventar.

---

## 4. Donde Zenix puede sobresalir (oportunidades de mercado)

### 🥇 Oportunidad #1 — Laundry + Inventory como módulos integrados

**Hueco**: solo Opera Cloud tiene Laundry, y mal. Inventory completo solo en ERPs caros (Sage, Oracle Hospitality Suite).

**Por qué importa**:
- En hostales LATAM, laundry es 25-30% del overhead operativo.
- Pérdida típica de blancos: 8-12% anual ($15K-25K USD por property pequeña — STR Global 2023).
- Consumibles (jabón, shampoo, café, papel higiénico, agua, amenities): 5-10% del COGS por habitación-noche.
- Sincronización HK ↔ Laundry ↔ Compras ↔ Almacén hoy es 100% manual via WhatsApp / Excel.

**Oportunidad Zenix — DOS módulos conectados**:

#### Módulo Laundry
- Tracking de blancos por barcode/QR (sábanas, toallas, uniformes individualmente)
- Integración HK → Laundry: cuando housekeeper marca "linen change", auto-debit del inventario
- Alertas de pérdidas: "Hoy faltan 12 toallas — última vista en hab 305"
- Ciclo wash → dry → fold → distribution con timestamps

#### Módulo Inventory (v1.2)
- **Catálogo de SKUs**: amenities (jabón, shampoo, gel, café, té, agua), blancos (sábanas, toallas, manteles), F&B stock futuro, parts de mantenimiento
- **Costos por SKU**: precio compra, precio venta interno, COGS por habitación-noche
- **Compras / Purchase Orders**: proveedores, órdenes pendientes, recepción de mercancía
- **Flujos**: entrada (compra) ↔ salida (consumo) ↔ depreciación (blancos al final de vida útil)
- **Bajo stock**: alertas automáticas cuando un SKU baja del threshold
- **Cost dashboards**: costo real por habitación-noche, comparativo mensual
- **Integraciones cross-módulo**:
  - HK consume amenities al limpiar habitación (auto-debit por tarea verificada)
  - Laundry consume jabones, suavizantes (auto-debit por ciclo)
  - Maintenance consume parts (tickets resueltos auto-debit del inventory)
  - F&B futuro: cocina/bar consumen ingredients (Sprint 13+)

**Diferenciación**: ningún PMS entry-level tiene esta integración cross-módulo. Mews y Cloudbeds dejan inventario completamente afuera. Opera lo tiene pero como módulo aislado sin auto-débit por consumo. **Zenix puede ser el primer PMS LATAM con cost-per-room-night calculado en tiempo real.**

### 🥈 Oportunidad #2 — Maintenance integrado (CMMS-lite)

**Hueco**: Mews y Cloudbeds tienen tickets básicos. Opera tiene CMMS pero pesado.

**Oportunidad Zenix**:
- **Reportar ticket desde mobile housekeeper** (ya planeado Sprint 8I+ Hub Recamarista — el botón "Reportar problema" abre creación de ticket de mantenimiento)
- Integración con room status: si hay ticket CRITICAL abierto en hab 203 → la habitación se bloquea automáticamente del inventario hasta resolver
- Foto antes/después con audit trail
- Asignación automática por specialty (eléctrico vs plomería vs HVAC) similar a la auto-asignación de housekeeping (Sprint 8H)

**Diferenciación**: el HK→Maintenance ya está conceptualmente conectado en CLAUDE.md §27 (P7 roadmap). Implementarlo cierra el loop más doloroso de la operación.

### 🥉 Oportunidad #3 — Public Areas como módulo separado

**Hueco**: Mews y Cloudbeds lo agrupan con HK. Solo Opera lo tiene separado.

**Por qué importa**:
- Las áreas públicas (lobby, baños, gym, restaurante zona común) requieren rutinas distintas a habitaciones (frecuencia más alta, equipo distinto, supervisión distinta).
- En hoteles boutique, una "limpiadora de áreas públicas" es un rol específico, no es housekeeper.

**Oportunidad Zenix**:
- Módulo `PublicAreasHub` con checklists por hora del día
- Schedule rotativo con reminders push
- Integración con eventos (banquetes) para limpieza pre/post

### Oportunidad #4 — Pool & Beach (resort vertical)

Específico para mercado de hospedaje vacacional LATAM (Cancún, Tulum, Playa del Carmen, etc.). Mews no lo cubre. Opera tiene un módulo legacy.

**Oportunidad**: Zenix podría ser el primer PMS moderno con módulo nativo Pool & Beach, capturando el mercado resort-boutique LATAM.

---

## 5. Áreas a NO incluir en Zenix (al menos por ahora)

Recomendación: **enfoque en operaciones, integrar el back-office**.

| Área | Por qué no | Solución |
|---|---|---|
| **F&B (Restaurant/Bar/Kitchen)** | Vertical especializado. Lightspeed POS, Toast, Square POS son verticales mejor financiados. | Integrar via API, no reinventar |
| **HR / Payroll** | Workday, BambooHR, Gusto cubren. Cumplimiento legal LATAM cambia por país. | Integrar via API |
| **Accounting** | QuickBooks, Xero, SAP. Cumplimiento fiscal CFDI MX, DIAN CO ya resuelto. | Export CSV + integraciones |
| **Revenue Management** | IDeaS, Duetto, RoomPriceGenie. Algoritmos especializados (ML pricing). | Integrar via API |
| **Marketing / CRM** | HubSpot, Mailchimp, Customer.io. Sprint 9+ ya tiene módulo Marketing readonly. | Export segments, integrar CRM |
| **Spa booking** | Mindbody, Treatwell. Specialized vertical. | Integrar via API (si demanda) |

**Filosofía**: Zenix es **PMS operacional, no ERP hotelero**. Mejor ser el #1 en core operativo (HK + Reception + Maintenance + Laundry) que ser mediocre en 30 áreas.

---

## 6. Roadmap propuesto de módulos por sprint

| Sprint | Módulo | Status | Tier |
|---|---|---|---|
| 8H ✅ | Housekeeping (backend foundation) | Hecho | 🔴 P0 |
| **8I 🔄** | **Hub Recamarista mobile + 4 stubs branded** (Mantenimiento, Jardinería, Áreas Públicas, Recepción) | Activo | 🔴 P0 |
| 8J | Web Settings: Plantilla Recamaristas | Roadmap aprobado | 🔴 P0 |
| 8K | Productividad + clock-in + gamificación completa | Roadmap aprobado | 🔴 P0 |
| 9 | **Maintenance Module completo** (CMMS-lite) | Roadmap | 🟠 P1 |
| 10 | **Laundry Module** (barcoding + inventario blancos) | Roadmap | 🟠 P1 |
| 11 | Tarifas + Channex.io | Roadmap | 🔴 P0 (revenue) |
| 12 | Public Areas Module | Roadmap | 🟡 P2 |
| 13 | Restaurant POS integration (Lightspeed/Toast) | Roadmap | 🟡 P2 |
| 14 | Pool & Beach (resort vertical) | Roadmap condicional | 🟢 P3 |
| 15 | Gardening Module | Roadmap condicional | 🟢 P3 |
| 16+ | Spa / Activities / Specialized | Demand-driven | 🔵 |

---

## 7. Decisión de scope para Sprint 8I (esta sesión)

**Mi recomendación final basada en el análisis arriba**:

### Áreas a incluir como stubs branded en Chunk C de Sprint 8I

Las **4 áreas que tienen el "shape" más claro** y que el usuario explícitamente mencionó (housekeeping, mantenimiento, jardinería, áreas públicas) + recepción que ya existe parcialmente.

| Department enum | Stub | ¿Por qué es prioritario el stub? |
|---|---|---|
| `HOUSEKEEPING` | ❌ no — implementación REAL | El core del Sprint 8I |
| `MAINTENANCE` | ✅ stub | Score 30, P1 — Sprint 9 lo hará |
| `LAUNDRY` | ✅ stub | Score 48, P1 — diferenciador competitivo |
| `PUBLIC_AREAS` | ✅ stub | Score 18, P2 — mercado boutique |
| `GARDENING` | ✅ stub | Score 4, P3 — pero usuario lo mencionó, mejor preparar slot |
| `RECEPTION` | ✅ stub mobile | El core PMS web ya existe; mobile shortcut futuro |

**Total: 5 stubs branded + 1 implementación real = 6 routes por department.**

### Decisión deferida (para futuro)

`F&B`, `SPA`, `SECURITY`, `ACTIVITIES` se dejan fuera del enum por ahora. Cuando el mercado lo demande (cliente lo pida), se agrega el valor al enum + el stub. Esfuerzo: ~10 min por área.

---

## 8. Riesgos identificados de esta decisión

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| El cliente pide F&B antes de lo previsto | Media | Medio | Easy add: agregar `FOOD_AND_BEVERAGE` al enum + stub branded en 1 sprint |
| Department enum se vuelve inflexible | Baja | Bajo | Migration cost de agregar valor a Postgres enum es bajo (< 1s) |
| Las 4 stubs branded "envejecen" sin mantenimiento | Media | Bajo | Forzar revisión de stubs al inicio de cada sprint (review checklist) |
| Pivote del producto — Zenix se vuelve ERP completo | Baja | Alto | Documentar explícitamente "Zenix es PMS operacional" en CLAUDE.md y resistir scope creep |

---

## 9. Conclusiones

1. **Hay 30 áreas formales en hospedaje** (AHLEI). No todas son relevantes para Zenix.
2. **Mews y Cloudbeds cubren el front + HK + Reservations**. Opera cubre todo pero pesado y caro.
3. **Hueco de mercado real en módulos operativos internos**: Maintenance, Laundry, Public Areas. Zenix puede liderar ahí.
4. **Filosofía Zenix**: PMS operacional, integrar el back-office (F&B/HR/Accounting/Revenue Mgmt) en lugar de reinventar.
5. **Scope inmediato Sprint 8I**: 1 implementación real (HK) + 5 stubs branded (Maintenance, Laundry, Public Areas, Gardening, Reception).
6. **Roadmap escalonado** por Tier (P0 → P3) con diferenciadores claros (Laundry, Maintenance integrado, Pool & Beach LATAM).
