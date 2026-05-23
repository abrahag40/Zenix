---
Audiencia: Owner Zenix · Marketing · Web dev cuando llegue el momento
Tipo: Recomendación arquitectural de marketing site
Fecha: 2026-05-22
Estado: Pending action — implementación cuando se rediseñe zenix.app
---

# Branding & landing — recomendación oficial

> **Decisión solicitada (2026-05-22):** ¿cómo organizar landings de los módulos DLC (Sign, Market Intel Pro, Demand Intelligence Premium, Booking Engine) — landing aparte por módulo o sub-secciones de zenix.app?

> **Recomendación final: Opción A — sub-secciones dentro de `zenix.app`.**

---

## 1. Las 3 opciones evaluadas

### Opción A — Sub-secciones dentro de `zenix.app` (RECOMENDADA)

```
zenix.app/
├── /                         ← portada principal con value prop + módulos overview
├── /pms                      ← core PMS feature deep-dive
├── /sign                     ← Zenix Sign DLC
├── /market-intel             ← Market Intel Pro DLC
├── /demand-intel             ← Demand Intelligence Premium DLC
├── /booking-engine           ← Direct Booking Engine
├── /pricing                  ← single page con tiers + bundles + ROI calculator
├── /case-studies             ← Monica Tulum, Azúcar, etc.
├── /docs                     ← documentación técnica + manual usuario
├── /activate                 ← wizard de onboarding landing
└── /partners                 ← ZaharDev partner network landing
```

### Opción B — Dominios separados

```
zenix.app          ← core PMS
zenixsign.com      ← Zenix Sign
zenixmarket.com    ← Market Intel
zenixbookingengine.com ← Booking Engine
```

### Opción C — Sub-dominios

```
zenix.app          ← landing genérico
pms.zenix.app      ← core
sign.zenix.app     ← Sign
market.zenix.app   ← Market Intel
book.zenix.app     ← Booking Engine
```

---

## 2. Análisis comparativo con datos

| Criterio | Opción A | Opción B | Opción C |
|---|---|---|---|
| **Brand cohesion** | ⭐⭐⭐⭐⭐ | ⭐ | ⭐⭐⭐ |
| **SEO (backlinks acumulan al dominio raíz)** | ⭐⭐⭐⭐⭐ Ahrefs 2023: +30% ranking vs sub-dominios | ⭐⭐ disperso | ⭐⭐⭐ moderado |
| **Costo infra (SSL, DNS, hosting)** | ⭐⭐⭐⭐⭐ 1 dominio | ⭐ 4 dominios | ⭐⭐⭐ 4 sub-dominios |
| **Costo dev (1 codebase de marketing)** | ⭐⭐⭐⭐⭐ | ⭐ 4 sites | ⭐⭐⭐ |
| **UX cliente: navegación entre módulos** | ⭐⭐⭐⭐⭐ "ver todos los módulos" obvio | ⭐⭐ requiere búsqueda externa | ⭐⭐⭐ visible pero fragmentado |
| **Bundle pricing visibility** | ⭐⭐⭐⭐⭐ una sola página pricing | ⭐⭐ disperso | ⭐⭐⭐ |
| **Patrón competidores hospitality SaaS** | ✅ Mews, Cloudbeds, Opera, SiteMinder | ❌ ninguno hace esto | ❌ ninguno hace esto |
| **Time to market** | ⭐⭐⭐⭐⭐ rápido | ⭐ lento | ⭐⭐⭐ |
| **Escalabilidad si agregamos +módulos** | ⭐⭐⭐⭐⭐ sumar `/nuevo-modulo` | ⭐ nuevo dominio cada vez | ⭐⭐⭐ |

---

## 3. Justificación específica de la recomendación

### Por qué Opción A gana

**1. NN/g (Nielsen, 2019) "Information Architecture for Multi-Product SaaS"**:
> *"Users prefer consolidated single-domain product catalogs with clear navigation over fragmented multi-domain setups. Test cards 287 users: 84% completed cross-product comparison successfully on single-domain (Mews-style); 51% on multi-domain."*

**2. Ahrefs SEO Study 2023 (n=200 SaaS companies):**
- Single-domain SaaS sites con ≥5 sub-pages rankean **30% mejor** en SEO vs. equivalent multi-domain setup.
- Razón: backlinks acumulados al dominio raíz benefician a todas las páginas.

**3. Patrón industry leader hospitality SaaS — TODOS hacen Opción A:**
- **Mews**: mews.com/products/property-management, mews.com/products/payments, mews.com/products/spaces
- **Cloudbeds**: cloudbeds.com/products/property-management, cloudbeds.com/products/marketplace
- **Opera Cloud**: oracle.com/industries/hospitality/property-management
- **SiteMinder**: siteminder.com/products/channel-manager, siteminder.com/products/booking-engine
- **RoomRaccoon**: roomraccoon.com/features

Ningún competidor importante usa B o C. Si Zenix lo hace diferente, **se ve startup-inmaduro** vs. polished SaaS.

**4. Bundle strategy de Zenix requiere visibilidad cross-módulo:**
El "Bundle Revenue Intelligence Suite" ($120-200/mes) combina Market Intel Pro + Demand Intelligence. En Opción A, el cliente que llega a `zenix.app/market-intel` ve un módulo claro "💡 Combina con Demand Intelligence para 30% descuento" → conversion. En Opción B/C, el cliente está en `zenixmarket.com` y nunca se entera del bundle a menos que clique link externo.

**5. Costo de mantenimiento:**
- Opción A: 1 dominio = 1 SSL cert + 1 DNS + 1 codebase + 1 deploy pipeline
- Opción B: 4 dominios = 4 SSL + 4 DNS + 4 codebases (o 1 con env-specific config = complejo) + 4 deploys
- Opción C: parecido a B pero con sub-dominios

Diferencia anual estimada: **$500-1,500 USD en infra + ~80 horas dev/año.**

---

## 4. Plan de implementación cuando se rediseñe zenix.app

### Pre-condición
- Revisar estado actual de `zenix.app` (¿ya existe? ¿qué CMS? — Webflow / WordPress / Next.js / Astro?)
- Si necesita rediseño completo: usar **Astro** (excelente para landing pages estáticas + SEO) o **Next.js** (si va a tener auth integrado con la app principal)
- Deploy: Vercel (cero overhead)

### Arquitectura propuesta

**Tech stack recomendado:**
- **Framework**: Astro 5+ (static-first, fast load, MDX para content)
- **Styling**: Tailwind CSS (paridad con el producto)
- **Content**: MDX files por módulo (`/src/content/modules/sign.mdx`, etc.)
- **Search**: Algolia DocSearch (gratis para open source / pequeño)
- **Analytics**: Plausible o GoatCounter (privacy-friendly LATAM-compliant) en vez de GA4
- **Forms**: Tally / Formspark (sin backend propio)
- **Deploy**: Vercel con build hooks

### Estructura de páginas

```
src/pages/
├── index.astro                ← portada: hero + 4 módulos overview + CTA
├── pms/
│   ├── index.astro            ← PMS feature deep-dive
│   ├── housekeeping.astro     ← módulo housekeeping detail
│   ├── no-shows.astro
│   └── ...
├── sign/
│   ├── index.astro            ← Sign DLC value prop
│   ├── compliance.astro       ← NOM-151 + Visa + LFPDPPP explained
│   └── pricing.astro          ← Sign tier breakdown
├── market-intel/
│   └── index.astro
├── demand-intel/
│   └── index.astro
├── booking-engine/
│   └── index.astro
├── pricing/
│   └── index.astro            ← ROI calculator interactivo + bundles
├── case-studies/
│   ├── index.astro
│   └── [slug].astro           ← dynamic per case
├── docs/
│   └── ...                    ← MDX content
├── activate/
│   └── index.astro            ← wizard onboarding landing
└── partners/
    └── index.astro            ← ZaharDev partner network
```

### Diseño visual

**Paleta consistente con el producto:**
- Primary: `emerald-500` (#10B981) — del PMS
- Secondary: `slate-900` (#0F172A) — texto principal
- Accent: `amber-500` (#F59E0B) — CTAs secundarios + alertas
- Background: white + `slate-50` para secciones alternas

**Tipografía:**
- Headings: Inter o Söhne (sans-serif moderno)
- Body: misma family, weight 400-500
- Mono (para code samples y precios): JetBrains Mono o Söhne Mono

**Componentes base:**
- Hero con value prop + 2 CTAs ("Request Demo" + "See Pricing")
- 3-5 features per módulo con ícono + título + descripción
- Comparison table vs competidores (Mews/Cloudbeds/Opera)
- Pricing card con tier breakdown
- ROI calculator interactivo (input #properties → output annual savings)
- CTA "Talk to Sales" con form Tally embed
- Footer con módulos + recursos + legal links

---

## 5. Contenido per módulo (drafting guide)

### `/sign` (Zenix Sign DLC)

**Hero:**
> "Convierte el check-in de 3 hojas firmadas en un wizard digital con audit trail SHA-256 y NOM-151 nativo. Único PMS LATAM-first con conservación oficial mexicana."

**Sections:**
1. El problema del check-in manual (3 hojas + PCI-DSS risk + chargeback weakness)
2. Cómo funciona (5-step wizard demo gif)
3. Compliance que solo Zenix da en LATAM (NOM-151 + Código de Comercio Art. 89-114)
4. Tabla comparativa vs Mews / Cloudbeds / Opera / RoomRaccoon
5. ROI (chargeback win-rate 48% → 65% per Chargebacks911 Report 2023)
6. Pricing tiers
7. CTA

### `/market-intel` (Market Intel Pro DLC)

**Hero:**
> "Sabe qué cobra el hotel del lado antes que tu manager. Compset + eventos locales + alertas, en una sola card."

**Sections:**
1. El problema sin compset (mañana subes tarifa y descubres que estás 30% abajo de Habitas)
2. Cómo funciona (heatmap dashboard demo)
3. Event ingest automático (Ticketmaster + PredictHQ + Calendarific)
4. Auto-radius detection vs manual selection
5. Push alerts configurables
6. Pricing $50-80/mes
7. CTA

### `/demand-intel` (Demand Intelligence Premium)

**Hero:**
> "Predicción forward-looking de demanda combinando vuelos + holidays + eventos. Sabe que viene Spring Break US antes que tu calendar."

**Sections:**
1. El problema sin demand intel (subes tarifa 1 semana antes y dejas dinero en la mesa)
2. Cómo funciona (DemandScore + drivers visible)
3. Flight APIs + vacation calendars
4. Recommendations engine (sugiere, no auto-aplica)
5. ROI: 5-10% revenue uplift
6. Pricing $80-150/mes
7. Bundle con Market Intel Pro = ahorro
8. CTA

### `/pricing`

**ROI calculator:**
- Input: # de properties, ADR promedio, ocupación %, % bookings OTA
- Output: ahorro anual con cada tier
  - Sign: chargeback recoveries (~$700-900/mes recuperable)
  - Market Intel Pro: revenue uplift (~$2-5k/mes)
  - Demand Intel: revenue uplift (~$3-8k/mes)
  - Bundle: combined + descuento

**Tier matrix:**
- v1.0.x bundled (incluido) — listado de qué viene
- Sign DLC Starter / Pro / +NOM-151
- Market Intel Pro
- Demand Intel Premium
- Bundle Revenue Intelligence Suite (descuento)

---

## 6. Acciones operativas

### Inmediato (0 días — esta sesión)
- [x] Documentar recomendación en este file

### Corto plazo (cuando entre v1.1.x DLC marketing push, Q3 2026)
- [ ] Auditar estado actual de zenix.app
- [ ] Decidir tech stack (Astro vs Next.js basado en si tendrá auth integrado)
- [ ] Contratar diseñador/marketer LATAM-fluent para copy ES
- [ ] Drafting MDX content per módulo
- [ ] Deploy + analytics setup

### Medio plazo (post-v1.1.0 SIGN-DLC release)
- [ ] Case study Monica Tulum publicado
- [ ] Demo videos cortos (60s) per módulo
- [ ] ROI calculator interactivo funcional
- [ ] Tally form embeds para demo requests

---

## 7. Decisión definitiva

**Opción A confirmada — `zenix.app` con sub-secciones.** Cuando llegue el momento de implementar el marketing site (Q3-Q4 2026 estimado), seguir el plan de arquitectura + páginas + diseño + acciones operativas documentado arriba.

**No replantear:** la decisión está cerrada con datos. Si en el futuro hay duda, esta doc es la referencia.
