# Zenix PMS — Roadmap versionado

> Plan de trabajo global de Zenix organizado por versiones de release.
> Source of truth para alinear engineering, sales, y planificación de mercado.
>
> Última actualización: 2026-04-30 — post-Sprint 8I planning.

---

## Filosofía del producto

Zenix es un **PMS operacional** para hoteles boutique y hostales de LATAM. **No es un ERP hotelero completo.**

Lo que Zenix hace nativamente: operación diaria del hotel (rooms, check-in, housekeeping, maintenance, laundry, inventory, dashboard).
Lo que Zenix integra (no reinventa): F&B (Lightspeed/Toast), HR (Workday/BambooHR), Accounting (QuickBooks/Xero), Revenue Mgmt (IDeaS/Duetto), Marketing (HubSpot/Mailchimp).

Diferenciador competitivo: cubrir el hueco entre Cloudbeds básico y Opera enterprise — operación profunda sin la pesadez legacy.

---

## V1.0 — Core PMS (en desarrollo, Sprint 8 en curso)

**Objetivo**: PMS operacional viable para hoteles boutique 10-80 habitaciones LATAM.

### Módulos incluidos

| Módulo | Status | Sprint |
|---|---|---|
| **Calendario PMS** (web) | ✅ | Etapa 1 + Sprint 6/7 |
| **Reception / Check-in / Check-out** (web) | ✅ | Sprint 8 + 8E |
| **Housekeeping** (backend) | ✅ | Sprint 8H |
| **Housekeeping** (mobile Hub Recamarista) | 🔄 Sprint 8I | 8I-Chunk C |
| **Housekeeping** (web admin de turnos/cobertura) | 📋 | Sprint 8J |
| **Housekeeping** (productividad + clock-in + gamificación) | 📋 | Sprint 8K |
| **Notifications** (mobile + web) | ✅ | Sprint 7D + 8I |
| **No-Shows + Night Audit fiscal** | ✅ | Sprint 5 + 8F |
| **Soft-lock advisory** (intra-Zenix overbooking UX) | ✅ | Sprint 7C |
| **Pricing / Tarifas + Channex.io** | 📋 | Sprint 9 |

### Lanzamiento V1.0 estimado

- **Beta cerrada**: post-Sprint 8K (~Q3 2026 si ritmo se mantiene)
- **GA público**: post-Sprint 9 con tarifas + Channex (~Q4 2026)

---

## V1.1 — Operación profunda (próxima fase)

**Objetivo**: cubrir las áreas operativas internas que Mews/Cloudbeds ignoran.

### Módulos incluidos

| Módulo | Sprint estimado | Justificación |
|---|---|---|
| **Maintenance Module** (CMMS-lite con HK→Maintenance loop) | 10 | Score PT×EF×DE = 30, P1. HK→Mtto cierra el loop más doloroso. |
| **Public Areas Module** | 11 | Mews/Cloudbeds lo agrupan con HK; mercado boutique los separa. |
| **Laundry Module** (barcoding de blancos) | 12 | Score 48, P1. 25-30% overhead operativo en hostales LATAM. **Depende de Inventory v1.2.** |

### Diferenciadores en V1.1

- **HK→Maintenance integrado**: housekeeper reporta ticket desde mobile con foto → auto-asigna a técnico por specialty → si CRITICAL bloquea habitación del inventario.
- **Public Areas con schedules rotativos**: checklists por hora del día con reminders push.
- **Laundry barcoding**: cada sábana/toalla con QR — tracking de pérdidas.

### Lanzamiento V1.1 estimado

- **Pre-lanzamiento V1.2** (los módulos de v1.2 aterrizan junto con v1.1 dependientes): si Laundry depende de Inventory, podemos shippear Laundry-básico-sin-inventory en V1.1 y completar tracking en V1.2.

---

## V1.2 — Inventory + Costos (NUEVO — añadido 2026-04-30)

**Objetivo**: visibilidad real de costos por habitación-noche con auto-débit por consumo.

### Módulo Inventory (cross-cutting)

**Catálogo de SKUs**:
- Amenities: jabón, shampoo, acondicionador, gel, body lotion, kit dental, shower cap
- Blancos: sábanas (queen/king/twin), fundas, toallas (cuerpo/manos/cara), bata, manteles
- Consumibles guest: café, té, azúcar, agua embotellada, snacks de mini-bar
- Suministros: papel higiénico, kleenex, bolsas de basura, productos de limpieza
- Parts mantenimiento: focos, filtros, sellos, herramientas
- F&B futuro (V2.0+): ingredientes, bebidas

**Funcionalidades**:
- CRUD de SKUs con foto, categoría, unidad de medida, costo, threshold de bajo stock
- **Compras (Purchase Orders)**: crear PO → enviar a proveedor → recibir mercancía → ajuste automático de stock
- **Recepción**: scan barcode/QR → match con PO → auto-update inventory + cost
- **Auto-débit por consumo cross-módulo**:
  - HK marca tarea verificada → debit de amenities consumidos (configurable por room type)
  - Laundry completa ciclo → debit de jabón industrial + suavizante
  - Maintenance resuelve ticket → debit de parts usados
- **Alertas low-stock** (push + email al área de compras)
- **Cost dashboards**: costo por habitación-noche, comparativo mensual, ROI de productos

**Integraciones cross-módulo (críticas)**:

```
        ┌────────────┐
        │ Inventory  │ ← single source of truth para stock + costos
        └─────┬──────┘
              │
   ┌──────────┼──────────┬──────────┐
   ▼          ▼          ▼          ▼
[Housekeeping] [Laundry] [Maintenance] [F&B futuro]
auto-debit    auto-debit  auto-debit    auto-debit
amenities    jabones      parts          ingredientes
```

### Submódulo: Compras / Purchasing Workflow

- Catálogo de proveedores
- Crear PO desde alerta de bajo stock (1 click)
- Aprobación gerencial (workflow simple: requestor → manager → ordered → received)
- Histórico de compras + comparativo de precios entre proveedores
- Forecasting de necesidades (Sprint 14+: ML basado en consumo histórico)

### Lanzamiento V1.2 estimado

Sprints 13-15 (~Q1 2027). Es un módulo grande (3 sprints).

---

## V1.3+ — Verticales especializados

Módulos demand-driven que se activan según el cliente que firme.

| Módulo | Sprint | Activador |
|---|---|---|
| **Pool & Beach** (resort vertical) | TBD | Cliente resort LATAM (Cancún/Tulum) |
| **Gardening** | TBD | Cliente con áreas verdes significativas |
| **Restaurant POS integration** (Lightspeed/Toast) | TBD | Cliente con F&B |
| **Spa Module** | TBD | Cliente luxury con spa |
| **Activities Desk** (resort all-inclusive) | TBD | Cliente all-inclusive |
| **Concierge médico / Tour desk** | TBD | Cliente luxury |
| **Mini-bar replenishment** | TBD | Cliente con room types con mini-bar activo |

Todos cumplen el mismo pattern: cuando un cliente lo necesita, se levanta un sprint dedicado con stub branded primero, luego implementación.

---

## V2.0 — Plataforma multi-property + analytics

**Objetivo**: cadenas hoteleras (3-15 propiedades) gestionadas desde una sola cuenta.

### Funcionalidades

- **Property switcher** en la app web (ya esqueletado en sidebar)
- **Reportes consolidados** cross-property (revenue, ocupación, costos)
- **Benchmarks anonimizados** (data network effect — §"Data Network Effects" en CLAUDE.md)
- **Forecasting con ML**: ocupación, demanda, consumo de inventory
- **Roles cross-property** (gerente regional con acceso a 3 propiedades)

### Lanzamiento V2.0 estimado

2027 H2.

---

## Tabla de versiones consolidada

| Versión | Tema | Módulos clave | Sprints | Q estimado |
|---|---|---|---|---|
| V1.0 | Core PMS | Reception, HK, Notifications, No-shows, Pricing | 1-9 | Q4 2026 |
| V1.1 | Operación profunda | Maintenance, Public Areas, Laundry-básico | 10-12 | Q1 2027 |
| **V1.2** | **Inventory + Costos** | **Inventory cross-cutting, Purchasing, Laundry-completo** | **13-15** | **Q2 2027** |
| V1.3+ | Verticales | Pool/Beach, Gardening, F&B, Spa | 16+ | Demand-driven |
| V2.0 | Multi-property + ML | Property switcher, benchmarks, forecasting | TBD | H2 2027 |

---

## Decisiones de scope (no-negociables)

### Lo que Zenix HACE nativamente
- Operación diaria del hotel (rooms, check-in/out, housekeeping, maintenance, laundry, inventory)
- Dashboard operativo (KPIs adaptativos)
- Notificaciones in-app + push + WhatsApp
- Audit trail fiscal-grade (no-shows, payments, journey events)
- Multi-property (V2.0+)

### Lo que Zenix INTEGRA (no reinventa)
- F&B: Lightspeed POS / Toast / Square
- HR / Payroll: Workday / BambooHR / Gusto
- Accounting: QuickBooks / Xero / SAP
- Revenue Management: IDeaS / Duetto / RoomPriceGenie
- Marketing / CRM: HubSpot / Mailchimp / Customer.io
- Channel Manager: **Channex.io** (Sprint 9)

### Lo que Zenix NO hace ni planea hacer
- Booking engine público (frontal de reservas) — usuarios usan Hostfully, Bookassist o el WordPress del hotel
- Sistema de cerraduras electrónicas — integración con Salto/Assa Abloy
- Sistema de cámaras / CCTV — integración con Hikvision/Dahua
- WiFi captive portal — integración con UniFi/Tanaza
- POS standalone — siempre via integración

---

## Anti-pattern: scope creep

Cada vez que un cliente pida algo nuevo, el filtro de decisión es:

1. ¿Está ya en alguna versión planeada? → seguir el plan
2. ¿Es un "ajuste pequeño" a un módulo existente? → posiblemente si demanda, hot-fix
3. ¿Es un módulo nuevo no planeado? → evaluar Tier (PT × EF × DE) antes de prometer
4. ¿Encaja con la filosofía "PMS operacional, no ERP"? → **si NO, integrar via API**

Documentar todo cambio de scope en este archivo.
