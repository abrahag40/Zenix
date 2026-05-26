# Zenix — Visión Estratégica Maestra

> Carpeta master de la visión Zenix + ZaharDev. Toda decisión estratégica de producto, negocio, partners, y datos vive aquí.
> Última actualización: 2026-05-15

## Índice

| Doc | Contenido | Audiencia |
|-----|-----------|-----------|
| [01-vision-zahardev-zenix.md](01-vision-zahardev-zenix.md) | Las 5 capas del negocio, 14 streams de revenue, flywheel ZaharDev↔Zenix | Founder, inversionistas, partners |
| [02-product-family.md](02-product-family.md) | Naming framework "Zenix [Product]", bundles, pricing tiers | Ventas, marketing, producto |
| [03-roadmap-v1-v2.md](03-roadmap-v1-v2.md) | Ladder v1.0 → v2.0 con justificación por versión | Ingeniería, producto, comercial |
| [04-module-pos.md](04-module-pos.md) | Zenix POS — punto de venta hotelero (v1.3) | Producto, ingeniería |
| [05-module-procure.md](05-module-procure.md) | Zenix Procure — compras y costos (v1.4) | Producto, ZaharDev consulting |
| [06-module-stay-access.md](06-module-stay-access.md) | Zenix Stay (Guest App + NFC) y Zenix Access (cerraduras) — v1.5/v1.6 | Producto, hardware, marketing |
| [07-module-people.md](07-module-people.md) | Zenix People — recursos humanos hoteleros (v1.7) | Producto, legal por país |
| [08-module-books.md](08-module-books.md) | Zenix Books — contabilidad multi-país (v1.8) | Producto, legal fiscal, finance |
| [09-partner-network.md](09-partner-network.md) | Modelo SAP/SuccessFactors: tiers, portal, certificación | Partners, alianzas, comercial |
| [10-data-strategy-abi.md](10-data-strategy-abi.md) | Política de datos, consent, anonimización, productos ABI | Legal, BI, ZaharDev consulting |
| [11-multi-tenant-architecture.md](11-multi-tenant-architecture.md) | Modelo 4-level Brand→Org→LegalEntity→Property + migration v1.0.5 | Ingeniería, ZaharDev consulting |
| [12-infrastructure-devops.md](12-infrastructure-devops.md) | 4 fases de infra (Vercel+Render+Neon → AWS → enterprise) + DevOps | Ingeniería, ops |
| [13-consultant-setup-wizard.md](13-consultant-setup-wizard.md) | Zenix Activate — 8 etapas + templates inventory + health checks | Producto, partners, comercial |
| [14-payment-currency-tax-architecture.md](14-payment-currency-tax-architecture.md) | 9 sub-módulos de cobros, divisas, impuestos LATAM + GuestCredit + CFDI E | Ingeniería, producto, fiscal |
| [15-subscription-billing.md](15-subscription-billing.md) | Modelo de cobro Zenix tipo Netflix (mensual) + Stripe Billing wiring + discount codes negociables por consultor + retention save offers (Liverpool pattern) + dunning multi-canal (email/WhatsApp) + dashboards consultor y cliente | Comercial, ingeniería, partners |

## Reglas de uso de esta carpeta

1. **CLAUDE.md NO duplica esto.** CLAUDE.md trata decisiones técnicas ejecutables. `docs/vision/` trata visión estratégica. Si una sección de CLAUDE.md crece más de 2 párrafos sobre estrategia, mover acá.

2. **Cada doc es autoexplicativo.** Cualquiera que entre nuevo al proyecto debe poder leer el doc sin tener que cruzar con CLAUDE.md ni con código.

3. **Versionar cambios mayores.** Si un módulo cambia de timeline o scope significativamente, anotar en la sección "Bitácora de revisiones" al final del doc.

4. **No introducir nomenclatura nueva sin actualizar [02-product-family.md](02-product-family.md).** El naming es contrato comercial — cambiarlo descoordinadamente rompe sales decks y partner docs.

5. **Decisiones legales/fiscales por país viven en cada módulo afectado**, no en un doc separado. Books y People tienen subsecciones por país (MX, CO, PE, AR).

## Para qué NO usar esta carpeta

- ❌ Detalle técnico de sprints (eso vive en CLAUDE.md §Roadmap y `docs/sprints/`)
- ❌ Documentación de uso del producto (eso vive en `docs/engineering-playbook.md` y futuros user guides)
- ❌ Research histórico (eso queda en `docs/archive/`)
- ❌ Material de ventas final (eso vive en `docs/zenix-sales-master.md` y `docs/prices-packages.md`)

## Documentos hermanos (fuera de vision/)

- **CLAUDE.md** (raíz) — instrucciones técnicas para el agente IA + decisiones no-negociables del código
- **docs/zenix-sales-master.md** — pitch comercial completo (alimentado por estos docs)
- **docs/prices-packages.md** — packaging y pricing detallado (alimentado por 02-product-family.md)
- **docs/engineering-playbook.md** — patrones de implementación
- **docs/sprints/** — planes de sprint con detalle técnico
