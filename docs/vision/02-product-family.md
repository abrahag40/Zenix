# 02 · Familia de Productos Zenix

> Naming framework, módulos del ecosistema, bundles, pricing tiers.
> Este doc es contrato comercial — cambiar nombres requiere actualizar sales decks, partner docs, y código.

---

## 1. Naming framework "Zenix [Product]"

Todos los módulos del ecosistema siguen el patrón `Zenix [Sustantivo Corto]`. Esta convención:
- Permite presentar la familia como catálogo coherente
- Facilita partner training (un patrón mental, no 9 nombres dispares)
- Funciona en español e inglés sin traducción

### La familia completa

| Producto | Tagline | Función primaria | Versión activación |
|----------|---------|------------------|--------------------|
| **Zenix PMS** | "El cerebro del hotel" | Property management — reservas, calendario, folio | v1.0 ✅ |
| **Zenix POS** | "El motor del restaurante" | Punto de venta hotelero | v1.3 |
| **Zenix Procure** | "Compras inteligentes" | Procurement + inventario + COGS | v1.4 |
| **Zenix Stay** | "La experiencia del huésped" | Guest App + identidad NFC | v1.5 |
| **Zenix Access** | "Acceso sin llave" | Cerraduras + control de acceso NFC/BLE | v1.6 |
| **Zenix People** | "El equipo organizado" | HR — nómina, turnos, retención | v1.7 |
| **Zenix Books** | "Contabilidad nativa hotelera" | Accounting multi-país USALI | v1.8 |
| **Zenix Insights** | "Datos para tu hotel" | BI interno + benchmarks por ciudad | v1.2 |
| **Zenix Intelligence** | "Inteligencia para tu industria" | ABI externo (OTAs, gobiernos, REITs) | v2.0 |
| **Zenix Partners** | "Plataforma de distribución" | Partner portal + certificación + marketplace de leads | v1.2 |

**Apps físicas en el monorepo:**

| App | Audiencia | Stack | Versión |
|-----|----------|-------|---------|
| `apps/web` | Staff (gerencia, recepción, supervisor) | React + Vite + Tailwind | v1.0 ✅ |
| `apps/mobile` | Operativos (housekeeper, técnico) | Expo + React Native | v1.0 ✅ |
| `apps/api` | Backend monolito | NestJS + Prisma + Postgres | v1.0 ✅ |
| `apps/pos-terminal` | Meseros / barman (iPad) | React Native iPad o PWA | v1.3 |
| `apps/kds` | Cocina (Kitchen Display System) | Webview kiosk mode | v1.3 |
| `apps/guest` | Huéspedes | Expo branded "Zenix Stay" | v1.5 |
| `apps/partner` | Sub-consultoras / partners | React + Vite | v1.2 |

---

## 2. Bundles tiered (pricing comercial)

En lugar de vender módulos sueltos, Zenix se vende en 4 niveles. Modelo Toast / Salesforce — bundle pricing siempre genera más revenue que módulos sueltos.

### Tier Starter — $79 USD/mes/propiedad

**Para:** hostales y boutiques pequeños (1-15 habitaciones)
**Incluye:**
- Zenix PMS completo
- Zenix Insights básico (ocupación, ADR, RevPAR)
- Hasta 5 staff
- Soporte email
- 1 propiedad

**No incluye:** POS, Procure, People, Books, Access, Stay app, partner portal

### Tier Growth — $179 USD/mes/propiedad

**Para:** boutiques medianos con restaurante (15-40 habitaciones)
**Incluye:** Todo Starter +
- Zenix POS (1 restaurante incluido)
- Zenix Procure básico (sin recetas/BOM avanzado)
- Hasta 15 staff
- Soporte email + chat
- Zenix Insights estándar

**No incluye:** People, Books, Access hardware, Stay app, ABI

### Tier Premium — $329 USD/mes/propiedad

**Para:** hoteles boutique premium + cadenas pequeñas (30-80 habitaciones)
**Incluye:** Todo Growth +
- Zenix People (HR completo)
- Zenix Books (contabilidad)
- Zenix Stay (Guest App + NFC tap-to-pay)
- Hasta 50 staff
- Soporte email + chat + manager
- Zenix Insights avanzado + benchmarks por ciudad
- Multi-propiedad (hasta 3)

**No incluye:** Zenix Access hardware (cotización aparte), ABI external

### Tier Enterprise — Custom pricing

**Para:** cadenas regionales + grupos hoteleros (5+ propiedades)
**Incluye:** Todo Premium +
- Zenix Access (hardware + setup cotizado aparte)
- Zenix Intelligence (acceso a ABI)
- Multi-propiedad ilimitado
- Cross-property dashboard
- Partner portal access (si actúan como sub-consultora)
- White-label parcial
- Soporte 24/7 + manager dedicado
- SLA contractual (uptime ≥99.9%)

**Precio típico:** $200-500 USD/mes/propiedad + setup hardware Access $10K-50K por propiedad

---

## 3. Add-ons fuera de bundle

| Add-on | Precio | Aplica a tiers |
|--------|--------|----------------|
| Propiedad adicional | +$60-150/mes (varía por tier) | Todos |
| Restaurant adicional (en POS) | +$50/mes | Growth+ |
| NFC wristbands | $3-5 USD c/u + setup $300/propiedad | Premium+ |
| Cerraduras Zenix Access | $250-350 USD c/u + instalación | Enterprise (Premium puede sumar) |
| Custom report (Insights) | $500-2K USD/reporte | Premium+ |
| ABI Intelligence data | $5K-50K USD/año | Enterprise |
| Onboarding asistido | $500-3K USD (one-time) | Todos |
| Training partner-led | Por sesión $200-1K USD | Todos |

---

## 4. Estrategia de upsell

| Cliente actual | Trigger de upsell | Tier propuesto |
|---------------|-------------------|----------------|
| Starter sin restaurante | Compra restaurante o agrega F&B | → Growth |
| Growth con rotación alta | NPS de staff bajo | → Premium (con People) |
| Growth sin contabilidad nativa | Cliente usa Excel + Conta externa | → Premium (con Books) |
| Premium con 2+ propiedades | Cliente expande | → Enterprise |
| Cualquier tier | Cliente pide reportes custom | + Insights premium addon |
| Enterprise sin hardware | Cliente busca diferenciación | + Zenix Access hardware |

---

## 5. Política de descuentos

| Escenario | Descuento máximo permitido |
|-----------|---------------------------|
| Pago anual upfront | 15% off (estándar SaaS) |
| Multi-propiedad (3+) | 10% off por propiedad adicional |
| Partner-driven sale | Hasta 25% off (partner absorbe la mitad) |
| Cliente pre-piloto (early adopter) | Hasta 30% off por 12 meses |
| Strategic partner referral | 20% off lifetime |

**Anti-pattern:** descontar más de 30% sin aprobación de ZaharDev director. Genera precedente que destruye precio percibido.

---

## 6. Posicionamiento competitivo por tier

| Tier | Compite contra | Diferencial Zenix |
|------|----------------|-------------------|
| Starter | Cloudbeds Starter, Little Hotelier, Amenitiz | Mejor UX mobile + housekeeping nativo |
| Growth | Cloudbeds Pro, Mews Basic, Hotelogix | POS integrado + audit fiscal LATAM-grade |
| Premium | Mews Pro, Cloudbeds Premium, Clock PMS+ | Books + People + Stay integrados |
| Enterprise | Opera Cloud, Mews Enterprise, SAP Hospitality | Hardware propio + ABI + partner network |

---

## 7. Pricing internacional

| País | Currency | Adjustment vs USD |
|------|---------|-------------------|
| México | MXN | 1:1 conversión + tax IVA 16% |
| Colombia | COP | -10% (mercado más sensible) |
| Perú | PEN | -10% |
| Argentina | ARS | -15% + dolarización opcional |
| Chile | CLP | -5% |
| Brasil | BRL | -10% + impostos por cuenta del cliente |
| España | EUR | +20% (mercado más maduro) |

Pricing transparente en website + ajustado automático por geo-IP.

---

## 8. Política de bundling NO negociable

1. **Books NO se vende sin Procure.** Books necesita datos de COGS de Procure. Forzar adoption juntos = mayor lock-in.
2. **People NO se vende solo (sin PMS).** People depende de Staff foundation del PMS.
3. **Access (hardware) NO se vende sin Stay (Guest App).** El valor del NFC tap requiere la app + identidad del huésped.
4. **ABI NO se vende a clientes sin Insights tier premium.** Razón legal: el consent flow está en Insights premium.

---

## 9. Bitácora de revisiones

- **2026-05-13** — Documento creado. Naming framework consolidado, 4 tiers definidos, pricing inicial propuesto. Pendiente: validación de pricing con benchmarks de competencia LATAM en próximos 60 días.
