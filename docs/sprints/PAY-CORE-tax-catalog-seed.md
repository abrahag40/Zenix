# PAY-CORE / CFDI-CORE — Tax Catalog seed productivo

> **Audiencia:** TAX_CURATOR Zenix + ingeniería v1.0.2.
> **Versión target:** v1.0.2 CFDI-CORE (México) + v1.0.x DLC adapters (8 países LATAM restantes).
> **Estado del documento:** DRAFT — datos confirmados con fuentes secundarias, requieren validación final contra fuentes primarias (Periódico Oficial del Estado, decretos municipales) antes de ejecutar el seed productivo.
> **Última actualización:** 2026-05-15.

Este documento contiene el seed inicial completo del **`TaxCatalogEntry`** (§91-§92, ver [docs/vision/14-payment-currency-tax-architecture.md §J](../vision/14-payment-currency-tax-architecture.md)). Es la base de datos fiscal que el rol `TAX_CURATOR` Zenix mantendrá vigente y actualizada en producción.

**Cómo se ejecuta este seed:**
1. Revisar cada fila con tarifa actualizada al día de migración.
2. Marcar `status='AMBIGUOUS'` aquellas filas donde la fuente primaria no está accesible.
3. Ejecutar `prisma db seed` desde `apps/api/prisma/seeds/tax-catalog.ts`.
4. El `TAX_CURATOR` recibe alerta SSE cuando el cron mensual detecta cambio en el `sourceUrl.checksum` y debe revalidar.

---

## Pre-requisito: tabla `UmaValue` MX

Antes de los `TaxCatalogEntry` con `calculation: UMA_MULTIPLIER` o `UMA_PER_PERSON_TIERED`, sembrar:

```typescript
[
  { country: 'MX', value: '108.57', validFrom: '2024-02-01', validTo: '2025-01-31' },
  { country: 'MX', value: '113.14', validFrom: '2025-02-01', validTo: '2026-01-31' },
  { country: 'MX', value: '117.31', validFrom: '2026-02-01', validTo: null }, // vigente
]
```

> Cron `refreshUmaBasedEntries` (cada 1-feb 2 AM UTC) inserta automáticamente la nueva entrada cuando INEGI publica.

---

## México — 32 estados ISH 2026

### IVA federal (aplica a TODAS las properties MX)

```typescript
{
  country: 'MX',
  region: null,                              // federal — sin región
  municipality: null,
  taxType: 'VAT',
  calculation: 'PERCENT_OF_BASE',
  rateValue: '0.16',
  baseIncludesTaxes: ['LODGING_TAX', 'ENVIRONMENTAL'], // IVA grava base + ISH + DSA
  appliesToPlatformDigital: true,
  validFrom: '2024-01-01',
  validTo: null,
  sourceUrl: 'https://www.sat.gob.mx/...',
  legalReference: 'LIVA Art. 1 (16% general)',
  cfdiTrasladoCode: '002',                   // c_Impuesto SAT
  status: 'ACTIVE',
}
```

### IVA franja fronteriza norte (8% — estímulo fiscal)

Solo estos municipios: BC (todos), Sonora (frontera), Chihuahua (frontera), Coahuila (frontera), NL (frontera), Tamaulipas (frontera).

```typescript
{
  country: 'MX',
  region: 'MX-BCN',                          // ejemplo Baja California
  municipality: 'tijuana',                   // u otro fronterizo
  taxType: 'VAT',
  calculation: 'PERCENT_OF_BASE',
  rateValue: '0.08',
  baseIncludesTaxes: ['LODGING_TAX', 'ENVIRONMENTAL'],
  validFrom: '2024-01-01',
  validTo: null,
  sourceUrl: 'https://www.sat.gob.mx/minisitio/EstimulosFiscalesFronteraNorteSur/region_fronteriza_norte/',
  legalReference: 'Decreto IVA frontera norte 31-dic-2018, prorrogado',
  status: 'ACTIVE',
}
```

> **Override**: ya que el estado tiene IVA 16% federal por default, esta entrada con `municipality` específico tiene precedencia (resolución más-específica-primero en `resolveTaxesForProperty`).

### IVA franja fronteriza sur (8%)

Solo municipio Othón P. Blanco en Quintana Roo. **NO aplica a Cancún, Playa, Tulum, Cozumel** — esos pagan 16% completo.

```typescript
{
  country: 'MX',
  region: 'MX-ROO',
  municipality: 'othon-p-blanco',
  taxType: 'VAT',
  calculation: 'PERCENT_OF_BASE',
  rateValue: '0.08',
  validFrom: '2024-01-01',
  validTo: null,
  sourceUrl: 'https://www.sat.gob.mx/minisitio/EstimulosFiscalesFronteraNorteSur/region_fronteriza_sur_iva/en_que_consiste.html',
  legalReference: 'Decreto IVA frontera sur 2019',
  status: 'ACTIVE',
}
```

### ISH per-estado — 32 entradas

Fuentes verificadas: [El Contribuyente](https://www.elcontribuyente.mx/impuesto-sobre-hospedaje/) × [JA Del Río 2026](https://www.jadelrio.com/mx/es/blogs/tasas-actuales-del-impuesto-sobre-hospedaje-2026) × [Airbnb Help MX](https://www.airbnb.com/help/article/2288).

Patrón base por estado (`MX-AGU` = Aguascalientes, ISO 3166-2):

```typescript
{
  country: 'MX',
  region: 'MX-AGU',
  municipality: null,
  taxType: 'LODGING_TAX',
  calculation: 'PERCENT_OF_BASE',
  rateValue: '0.03',
  appliesToPlatformDigital: false,
  validFrom: '2026-01-01',
  validTo: null,
  sourceUrl: 'https://www.elcontribuyente.mx/impuesto-sobre-hospedaje/',
  legalReference: 'Ley de Hacienda del Estado de Aguascalientes',
  status: 'ACTIVE',
}
```

**Tabla completa** (ISH tradicional / ISH plataformas digitales):

| ISO | Estado | Tradicional | Plataforma | Notas |
|---|---|---|---|---|
| MX-AGU | Aguascalientes | 3% | — | — |
| MX-BCN | Baja California | 5% (7% moteles) | 5% | Crear 2 entradas: appliesToMotel=true para 7% |
| MX-BCS | Baja California Sur | 4% | 4% | — |
| MX-CAM | Campeche | 2% | 2% | — |
| MX-CHP | Chiapas | 2% (5% moteles) | 2% | — |
| MX-CHH | Chihuahua | 4% | — | Sin plataformas digitales registradas |
| MX-CMX | Ciudad de México | **3.5%** | **5%** | Diferenciada — 2 entradas |
| MX-COA | Coahuila | 3% | — | — |
| MX-COL | Colima | 3% (5% moteles) | 3% | — |
| MX-DUR | Durango | 3% (5% moteles) | — | — |
| MX-MEX | Estado de México | **4%** | **2%** | Plataformas MENOR (atípico) |
| MX-GUA | Guanajuato | 4% | — | — |
| MX-GRO | Guerrero | **4%** | **5%** | Diferenciada |
| MX-HID | Hidalgo | 2.5% | (incluido 2026) | Reforma reciente |
| MX-JAL | Jalisco | **4%** | **5%** | Diferenciada + ambiental |
| MX-MIC | Michoacán | 3% | 3% | — |
| MX-MOR | Morelos | 3.75% | — | — |
| MX-NAY | Nayarit | 5% | 5% | — |
| MX-NLE | Nuevo León | 3% | 3% | — |
| MX-OAX | Oaxaca | 3% | 3-5% | Verificar exactitud — usar 4% o crear range |
| MX-PUE | Puebla | 3% | 3% | — |
| MX-QUE | Querétaro | **3.5%** | **5%** | Diferenciada |
| MX-ROO | Quintana Roo | **5%** | **6%** | Diferenciada + DSA per-municipio (ver abajo) |
| MX-SLP | San Luis Potosí | 4% | — | Tarifa distinta PF/PM (analizar campo extra) |
| MX-SIN | Sinaloa | 3% | 3% | — |
| MX-SON | Sonora | 3% | 3% | — |
| MX-TAB | Tabasco | 3% | — | — |
| MX-TAM | Tamaulipas | 3% | — | — |
| MX-TLA | Tlaxcala | 2% | — | — |
| MX-VER | Veracruz | 2% | — | — |
| MX-YUC | Yucatán | **4.5% ↓** | **4.5%** | Bajó de 5% en 2026 — versionar con sucesor |
| MX-ZAC | Zacatecas | 3% | — | — |

**Patrón "diferenciada plataformas"** (ejemplo CDMX):

```typescript
// Entrada 1 — tradicional
{ region: 'MX-CMX', appliesToPlatformDigital: false, rateValue: '0.035', ... }
// Entrada 2 — plataformas digitales (Airbnb, Booking, Expedia)
{ region: 'MX-CMX', appliesToPlatformDigital: true,  rateValue: '0.05',  ... }
```

**Patrón "versionado con sucesor"** (ejemplo Yucatán):

```typescript
// Entrada vigente hasta 31-dic-2025 con 5%
{
  id: 'tcat-mx-yuc-ish-pre2026',
  region: 'MX-YUC', rateValue: '0.05',
  validFrom: '2024-01-01', validTo: '2025-12-31',
  status: 'DEPRECATED',
  successorId: 'tcat-mx-yuc-ish-2026',
}
// Entrada vigente desde 1-ene-2026 con 4.5%
{
  id: 'tcat-mx-yuc-ish-2026',
  region: 'MX-YUC', rateValue: '0.045',
  validFrom: '2026-01-01', validTo: null,
  status: 'ACTIVE',
}
```

### DSA Quintana Roo per-municipio

#### Cancún — `MX-ROO / cancun` (CONFIRMADO)

```typescript
{
  country: 'MX',
  region: 'MX-ROO',
  municipality: 'cancun',
  taxType: 'ENVIRONMENTAL',
  calculation: 'UMA_MULTIPLIER',
  rateValue: '0.70',                          // 70% UMA
  appliesToPlatformDigital: true,             // aplica también a Airbnb desde 2026
  validFrom: '2024-01-01',
  validTo: null,
  sourceUrl: 'https://playadelcarmen.gob.mx/saneamiento-ambiental',
  legalReference: 'Ley de Hacienda Municipal Benito Juárez',
  status: 'ACTIVE',
  verifiedBy: '<curator-id>',
  verificationNotes: 'Per-room confirmado en sitio oficial del Ayuntamiento (Riviera Maya).',
}
```

#### Playa del Carmen — `MX-ROO / playa-del-carmen` (CONFIRMADO)

```typescript
{
  country: 'MX',
  region: 'MX-ROO',
  municipality: 'playa-del-carmen',
  taxType: 'ENVIRONMENTAL',
  calculation: 'UMA_MULTIPLIER',
  rateValue: '0.30',
  appliesToPlatformDigital: true,
  validFrom: '2024-01-01',
  validTo: null,
  sourceUrl: 'https://playadelcarmen.gob.mx/saneamiento-ambiental',
  legalReference: 'Ley de Hacienda Municipal Solidaridad',
  status: 'ACTIVE',
  verifiedBy: '<curator-id>',
}
```

#### Tulum — `MX-ROO / tulum` ⚠️ **AMBIGUOUS** (pendiente verificación)

```typescript
{
  country: 'MX',
  region: 'MX-ROO',
  municipality: 'tulum',
  taxType: 'ENVIRONMENTAL',
  calculation: 'UMA_MULTIPLIER',                 // default per-room conservador
  rateValue: '0.30',
  tieredRates: [                                  // PRE-CARGADO por si se confirma per-person
    { occupants: 1, rate: 0.30 },
    { occupants: 2, rate: 0.20 },
    { occupants: 3, rate: 0.15 },
    { occupants: 4, rate: 0.10 },
  ],
  appliesToPlatformDigital: true,
  validFrom: '2024-01-01',
  validTo: null,
  sourceUrl: 'https://www.reportequintanaroo.com/que-es-el-derecho-de-saneamiento-ambiental-y-cuanto-debes-pagar/',
  legalReference: 'Decreto 191 (Cap. XXVIII Ley Hacienda Municipal Tulum, 22-dic-2021)',
  status: 'AMBIGUOUS',
  verifiedBy: null,
  verificationNotes: 'Fuentes secundarias se contradicen: sitio oficial Riviera Maya (Playa del Carmen Ayuntamiento) describe per-room; Reporte Quintana Roo 2026 describe per-person tiered. Decreto 191 texto literal NO accesible públicamente. Pendiente: confirmar con Tesorería Municipal Tulum o con declaración del contador del Hotel Monica Tulum. Default: UMA_MULTIPLIER per-room (modalidad soportada por fuente oficial municipal).',
}
```

#### Cozumel — `MX-ROO / cozumel`

```typescript
{
  country: 'MX',
  region: 'MX-ROO',
  municipality: 'cozumel',
  taxType: 'ENVIRONMENTAL',
  calculation: 'UMA_MULTIPLIER',
  rateValue: '0.30',
  validFrom: '2024-01-01',
  validTo: null,
  sourceUrl: 'https://playadelcarmen.gob.mx/saneamiento-ambiental',
  legalReference: 'Por analogía con Playa del Carmen y Tulum — confirmar con tesorería Cozumel',
  status: 'AMBIGUOUS',                          // mismo razonamiento que Tulum
  verificationNotes: 'No verificado directamente; sigue patrón Playa del Carmen.',
}
```

### Yucatán — impuesto ambiental al hospedaje

Reportado en boletín fiscal 2026 pero sin línea separada en SEFOTUR. Probablemente incluido en el 4.5% ISH.

```typescript
{
  country: 'MX',
  region: 'MX-YUC',
  taxType: 'ENVIRONMENTAL',
  calculation: 'PERCENT_OF_BASE',
  rateValue: '0',                               // incluido en ISH
  validFrom: '2026-01-01',
  validTo: null,
  sourceUrl: 'http://www.sefotur.yucatan.gob.mx/secciones/ver/impuesto-al-hospedaje',
  legalReference: 'Verificación pendiente — reportado en JA Del Río 2026',
  status: 'AMBIGUOUS',
  verificationNotes: 'Existe denominación "impuesto ambiental al hospedaje" en blog fiscal, no aparece como línea separada en sitio oficial SEFOTUR. Probable que esté incluido en ISH 4.5%. Pendiente confirmar.',
}
```

---

## LATAM — 9 países adicionales

### Colombia

```typescript
// IVA nacional
{
  country: 'CO',
  taxType: 'VAT',
  calculation: 'PERCENT_OF_BASE',
  rateValue: '0.19',
  validFrom: '2024-01-01',
  validTo: null,
  sourceUrl: 'https://www.dian.gov.co/impuestos/Formalizacion-Tributaria/Paginas/Turismo.aspx',
  legalReference: 'Estatuto Tributario Art. 468',
  status: 'ACTIVE',
}
```

```typescript
// San Andrés/Providencia/Sta Catalina — EXENTO IVA
{
  country: 'CO',
  region: 'CO-SAP',
  taxType: 'VAT',
  calculation: 'PERCENT_OF_BASE',
  rateValue: '0',                               // exento
  validFrom: '1993-01-01',
  validTo: null,
  sourceUrl: 'https://www.dian.gov.co/impuestos/Formalizacion-Tributaria/Paginas/Turismo.aspx',
  legalReference: 'Ley 47 de 1993',
  status: 'ACTIVE',
}
```

> Adicionalmente: Tasa pro-Turismo parafiscal 2.5‰ ingresos hoteleros — se modela como `TaxType.TOURISM_PARAFISCAL` con `calculation: PER_BOOKING` aplicado mensualmente (no per-noche).

### Costa Rica

```typescript
// IVA escalonado registrados ICT (2025-2028 transición)
{
  country: 'CR',
  taxType: 'VAT',
  calculation: 'PERCENT_OF_BASE',
  rateValue: '0.13',                            // tarifa plena
  validFrom: '2024-01-01',
  validTo: null,
  sourceUrl: 'https://www.hacienda.go.cr/docs/DeberestributariosHospedajesNoTradicionales.pdf',
  legalReference: 'Ley 9635 Fortalecimiento Finanzas Públicas',
  status: 'ACTIVE',
}
// Override per LegalEntity para ICT-registered con escalonado (4%/8%) via TaxCatalogOverride
```

### Perú

```typescript
// IGV general 18%
{
  country: 'PE',
  taxType: 'VAT',
  calculation: 'PERCENT_OF_BASE',
  rateValue: '0.18',                            // 16% IGV + 2% IPM
  validFrom: '2024-01-01',
  validTo: null,
  sourceUrl: 'https://orientacion.sunat.gob.pe/...',
  legalReference: 'TUO Ley del IGV',
  status: 'ACTIVE',
}
// MYPE turismo: override per LegalEntity con rateValue: 0.105 (8% IGV + 2% IPM)
// Ley 31556, vigente hasta 31-dic-2026
```

### Panamá

```typescript
{
  country: 'PA',
  taxType: 'VAT',
  calculation: 'PERCENT_OF_BASE',
  rateValue: '0.10',                            // ITBMS hospedaje
  validFrom: '2024-01-01',
  validTo: null,
  sourceUrl: 'https://dgi.mef.gob.pa/itbms/Itbms',
  legalReference: 'Ley 8 de 2010',
  status: 'ACTIVE',
}
```

### Guatemala

```typescript
// IVA
{ country: 'GT', taxType: 'VAT', calculation: 'PERCENT_OF_BASE', rateValue: '0.12', ... }
// INGUAT parafiscal
{
  country: 'GT',
  taxType: 'TOURISM_PARAFISCAL',
  calculation: 'PERCENT_OF_BASE',
  rateValue: '0.10',
  validFrom: '2024-01-01',
  validTo: null,
  sourceUrl: 'https://uip.inguat.gob.gt/...',
  legalReference: 'Ley Orgánica INGUAT',
  status: 'ACTIVE',
}
```

### El Salvador

```typescript
// IVA
{ country: 'SV', taxType: 'VAT', calculation: 'PERCENT_OF_BASE', rateValue: '0.13', ... }
// CORSATUR contribución especial turismo
{
  country: 'SV',
  taxType: 'TOURISM_PARAFISCAL',
  calculation: 'PERCENT_OF_BASE',
  rateValue: '0.05',
  validFrom: '2024-01-01',
  validTo: null,
  sourceUrl: 'https://elsalvador.eregulations.org/media/Ley%20de%20Turismo_1.pdf',
  legalReference: 'Ley de Turismo SV',
  status: 'ACTIVE',
}
```

### Honduras

```typescript
// ISV nacional
{ country: 'HN', taxType: 'VAT', calculation: 'PERCENT_OF_BASE', rateValue: '0.15', ... }
// Impuesto turístico nacional
{ country: 'HN', taxType: 'TOURISM_PARAFISCAL', calculation: 'PERCENT_OF_BASE', rateValue: '0.04', ... }
// Excepción Islas de la Bahía (Roatán/Utila/Guanaja) — ZOLITUR
{
  country: 'HN',
  region: 'HN-IB',                              // Islas de la Bahía
  taxType: 'VAT',
  calculation: 'PERCENT_OF_BASE',
  rateValue: '0',                               // zona libre, exonerado de ISV
  validFrom: '2006-01-01',                      // Ley ZOLITUR
  validTo: null,
  sourceUrl: 'https://www.tsc.gob.hn/web/leyes/Ley_y_reglamento_ley_zolitur.pdf',
  legalReference: 'Ley ZOLITUR (Zona Libre Turística Islas de la Bahía)',
  status: 'ACTIVE',
}
```

### Argentina

```typescript
// IVA nacional
{
  country: 'AR',
  taxType: 'VAT',
  calculation: 'PERCENT_OF_BASE',
  rateValue: '0.21',
  validFrom: '2024-01-01',
  validTo: null,
  sourceUrl: 'https://www.afip.gob.ar/viajeros/ayuda/reintegro-por-alojamiento.asp',
  legalReference: 'Ley de IVA',
  status: 'ACTIVE',
}
// TCT (Tasa de Conservación Turística) municipal — override per Property
// Ejemplos: Luján de Cuyo, Maipú (Mendoza), Bariloche
```

### Brasil — **NO incluir en v1.0.x**

`§93`: Brasil excluido. Entrar v1.2+ con Sovos como `FiscalAdapter`. No sembrar entradas Brasil en v1.0.x.

---

## Checklist de validación pre-seed productivo

Antes de ejecutar `prisma db seed`:

- [ ] Validar tarifas ISH 2026 de las 32 entradas MX contra **Periódico Oficial del Estado** (no solo blog fiscal). Prioridad alta: QR, Yucatán, CDMX, Jalisco, Guerrero, Querétaro (los que tienen tarifa diferenciada plataformas).
- [ ] Confirmar IVA frontera norte municipios elegibles (lista actualizada SAT) — el seed solo tiene un ejemplo.
- [ ] Confirmar DSA Tulum modalidad real con Tesorería Municipal Tulum o declaración del contador Hotel Monica Tulum.
- [ ] Confirmar DSA Cozumel — actualmente AMBIGUOUS por analogía sin verificación directa.
- [ ] Confirmar Yucatán impuesto ambiental — actualmente AMBIGUOUS (probablemente incluido en ISH 4.5%).
- [ ] Validar tarifas LATAM 8 países con fuentes primarias (Hacienda, DIAN, SUNAT, DGI, ICT, ATP, INGUAT, CORSATUR, AFIP).
- [ ] Validar Honduras ZOLITUR sigue vigente en 2026 (Ley ZOLITUR 2006, posibles reformas).
- [ ] Verificar URLs `sourceUrl` siguen vivas (cron de checksum se activará después).

---

## Quien ejecuta este seed

**Rol:** `TAX_CURATOR` (§91 CLAUDE.md).

**Quién es:** decisión pendiente. Tres opciones:
- (a) Abraham (founder) — bajo riesgo de fricción, alto costo de tiempo
- (b) Contador parcial contratado — 10 h/sem, ~$1.5-2k USD/mes
- (c) Partner certificado Zenix (post v1.2 cuando exista programa de partners §09)

**Recomendación:** (b) desde v1.0.2 — el founder no debería ser bottleneck para una pieza de mantenimiento recurrente. Buscar contador con experiencia en hospedaje LATAM, idealmente quien ya conozca CFDI 4.0.

---

## Transition plan — v1.0.0 (hoy) → v1.0.2 CFDI-CORE

### Estado v1.0.0 (post-sprint 2026-05-20)

Implementación **interim** sin `TaxCatalogEntry` todavía. Vive en `apps/api/src/pms/guest-stays/tax-breakdown.service.ts` con reglas hardcoded:

| Jurisdicción | Reglas hoy | Endpoint |
|---|---|---|
| **MX/Quintana Roo** (Cancún, Playa del Carmen, Tulum, Cozumel, Chetumal, Bacalar, Holbox, Akumal, Puerto Morelos, Isla Mujeres) | IVA 16% + ISH 6% + nota DSA pendiente | `GET /v1/guest-stays/:id/tax-breakdown` |
| **MX/otros estados** | IVA 16% federal + nota "ISH estatal pendiente con v1.0.2" | idem |
| **Países no-MX** | `configured: false` + nota "Pendiente con CFDI-CORE" | idem |

**Inferencia de jurisdicción**: `Property.city` (`apps/api/prisma/schema.prisma` Property model) → state lookup vía `Set<string>` hardcoded en `QR_CITIES`. Lista verificada contra INEGI municipios Quintana Roo 2026.

**Algoritmo reverse-engineering** (modelo INCLUSIVE actual): `totalAmount` registrado es bruto-incluyente → `base = totalGross / (1 + Σtasas)`. Para QR: 22% total → divisor 1.22.

**Frontend** (`apps/web/src/pages/ReservationDetailPage.tsx`): Pago tab → "Detalles del cálculo" card consume el endpoint y renderiza line items con detail "16% × USD X". Header del card muestra chip de jurisdicción.

### Migración v1.0.2 — paso a paso

**Pre-requisitos**:
1. Ejecutar Prisma migration `add-tax-catalog-entry` (ver [PAY-CORE-prisma-migration-draft.md](PAY-CORE-prisma-migration-draft.md))
2. Ejecutar `prisma db seed` para poblar 32 estados MX + 8 países LATAM con datos de este doc
3. Validar checklist pre-seed productivo (§Checklist arriba)

**Refactor del service** (apps/api/src/pms/guest-stays/tax-breakdown.service.ts):

```ts
// ANTES (v1.0.0 hardcoded):
const QR_CITIES = new Set([...])
if (isQuintanaRooCity(city)) {
  // Apply IVA + ISH hardcoded rates
}

// DESPUÉS (v1.0.2 catalog-driven):
async computeForStay(stayId: string) {
  const property = await this.prisma.property.findUnique({...})
  // Resolve catalog entries with PROPERTY > LEGAL_ENTITY > base precedence (§92):
  const entries = await this.taxCatalog.resolveTaxesForProperty(property.id)
  // Apply each entry's calculation type (PERCENT_OF_BASE | FIXED_PER_ROOM_NIGHT |
  // UMA_MULTIPLIER | UMA_PER_PERSON_TIERED | PER_BOOKING)
  return this.buildBreakdown(stay, entries)
}
```

**Cambios cero al frontend** — el endpoint mantiene la misma forma (`TaxBreakdown` interface en `tax-breakdown.service.ts`). El frontend ya consume `lineItems[]` sin asumir IVA/ISH específicos. Sólo añadir nuevas calculation types al type narrowing del frontend si DSA/UMA llega.

**Tests requeridos en v1.0.2**:
- Cada uno de los 32 estados MX devuelve la combinación correcta IVA + ISH
- QR municipios devuelven IVA + ISH + DSA (con modalidad confirmada por Activate wizard §94)
- Frontera norte devuelve IVA 8% (no 16%)
- Yucatán devuelve ISH 4.5% (no 5%, post-reforma 2026)
- LATAM 8 países: cada uno devuelve sus entradas
- Brasil devuelve `configured: false` con nota Sovos v1.2

**Sub-tareas concretas para sprint v1.0.2** (orden de ejecución):

1. **Día 1-2**: Prisma migration `TaxCatalogEntry` + `TaxCatalogOverride` + `UmaValue` + `FiscalRegime.fxAdapterClass` campo. Tests del schema (constraints, validFrom < validTo, unique keys).
2. **Día 3-5**: Seed productivo MX (IVA federal + 32 estados ISH + QR DSA por municipio). Validación contra Periódico Oficial Estado por estado (TAX_CURATOR).
3. **Día 6-7**: Seed LATAM 8 países (CO, CR, PE, PA, GT, AR, SV, HN). Validación contra fuentes primarias.
4. **Día 8-10**: Refactor `TaxBreakdownService.computeForStay` → catalog-driven. Mantener interface backward-compat para no romper frontend.
5. **Día 11-12**: `TaxCatalogOverride` UI en Settings (TAX_CURATOR + LegalEntity admin). Wizard Activate §94 carga overrides si DSA modalidad confirmada por Tesorería.
6. **Día 13-14**: Tests integración (catalog resolution per-jurisdiction). Migration data de Hotel Monica Tulum (validation real).
7. **Día 15**: `IFiscalAdapter` Strategy pattern (`MxCfdi40Adapter` baseline). FacturAdapter + SW Sapien fallback.
8. **Día 16-20**: CFDI 4.0 issuance (CFDI I emisión al cobrar, CFDI E al cancelar, CFDI REP al recibir pago tardío). Sandbox test con PAC.

**Riesgos identificados**:
- **TAX_CURATOR role contratación es bottleneck** — sin contador externo, founder se vuelve cuello de botella. Resolver ANTES de iniciar v1.0.2.
- **Wizard Activate verifica DSA Tulum/Cozumel** — modalidad per-room vs per-person debe quedar confirmada antes de migrar Hotel Monica Tulum a v1.0.2. Si Tesorería no responde, marcar `status=AMBIGUOUS` y bloquear emisión CFDI para ese caso (fail-closed).
- **Brasil out-of-scope** — flag warning en cualquier reserva con Channex `country=BR` hasta v1.2.

---

## Bitácora de revisiones

- **2026-05-15** — Versión inicial DRAFT. Datos confirmados con fuentes secundarias (El Contribuyente, JA Del Río, Airbnb Help, Playa del Carmen Ayuntamiento, Hacienda CR, DIAN, SUNAT, DGI PA, INGUAT, ZOLITUR, AFIP). Filas marcadas AMBIGUOUS: DSA Tulum, DSA Cozumel, Yucatán impuesto ambiental.
- **2026-05-20** — Sección "Transition plan v1.0.0 → v1.0.2" agregada. `TaxBreakdownService` interim implementado (hardcoded QR cities + IVA-only fallback). Sub-tareas v1.0.2 ordenadas día por día. Riesgos identificados (TAX_CURATOR contratación, wizard Activate verifica DSA, Brasil out-of-scope).
