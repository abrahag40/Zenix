# Zenix Learning — Pricing + bundling + marketplace

> Pricing DLC + bundling con Zenix Activate + modelo curso-regalo + roadmap marketplace.
> **Última actualización:** 2026-05-21

---

## 1. Tabla de SKUs Zenix Learning

| SKU | Nombre comercial | Pricing modelo | Bundling | Activación |
|-----|------------------|-----------------|----------|-----------|
| **ZNX-LRN-GIFT** | Curso de regalo (al cierre PMS) | Sin recurrente, 1 curso lifetime | Bundle al cerrar contrato PMS | Manual por ZaharDev sales |
| **ZNX-LRN-L1** | Learning Core | $7 USD / staff activo / mes | Bundle con Zenix Activate. Min 5 staff | Self-serve desde Activate o Settings |
| **ZNX-LRN-L2** | Learning Pro | $12 USD / staff activo / mes | Upgrade desde L1 | Self-serve desde Settings |
| **ZNX-LRN-L3-MKT** | Cursos marketplace | Per-course $30-300 USD | Sin recurrente | Comprar individual desde catálogo |
| **ZNX-LRN-L4-CUST** | Custom course authoring (ZaharDev) | $5,000-25,000 USD/curso | Servicio consultoría | Contacto sales |

### Definición "staff activo"

Staff que tuvo **≥1 login mobile o web en los últimos 30 días**. Staff dado de baja o de licencia no cuenta. Cobro mensual basado en peak de los últimos 30 días (modelo iSpring Learn — más justo para hoteles con rotación estacional).

---

## 2. Hook "Curso de regalo" — operativa comercial

### Flujo de venta del DLC L0

```
PROSPECT EVALUANDO PMS ZENIX
                │
                ▼
       Demo + propuesta comercial
                │
                ▼
        ¿Convencido? ─── Sí ─── [Cierra cuenta PMS solo]
                │
                No / Duda
                │
                ▼
   "Cierro PMS contigo HOY y te REGALO
    el curso 'Distintivo H + NOM-035'
    para todo tu equipo. Lo certificas
    antes del fin de año y tu auditoría
    STPS queda blindada."
                │
                ▼
    Conversión incremental ~15-25%
    (Cialdini 1984 — reciprocidad)
```

### Lo que el cliente recibe con el GIFT

- Plan Learning Core activado por **12 meses gratis**
- 1 curso enrolado a TODO el staff actual
- DC-3 PDFs ilimitados del curso
- Compliance report STPS para auditoría
- Dashboard manager básico

### Lo que NO incluye el GIFT (upsell oportunidades)

- Otros cursos del catálogo CORE → upgrade a L1 ($7/staff/mes)
- SCORM/xAPI player → upgrade a L2 ($12/staff/mes)
- Course authoring → L4
- Cursos AHLEI premium del marketplace → L3 per-course

### Costo marginal Zenix del regalo

- Cursos ya producidos (DLC L1 catalog) → **$0 marginal**
- Storage R2/S3 → ~$0.10/staff/mes
- Bandwidth → ~$0.50/staff/mes
- Servicio compute → ~$0.20/staff/mes
- **Total: ~$1 USD/staff/mes** que Zenix absorbe

Para un hostal típico (15 staff) = $15/mes × 12 meses = $180 USD de costo para Zenix.
Valor percibido por cliente = 1 capacitación in-person de Distintivo H promedio MX = MXN $3,000-8,000 (USD $150-400).
**ROI del hook: 10:1 a 22:1** si convierte un PMS deal típico ($300-500/mes MRR × 12 = $3,600-6,000 ARR).

---

## 3. Bundling con Zenix Activate (§77-§80)

### Etapa 6 "Staff" del wizard — toggle Learning

Ver wireframe en doc 05 §5. Resumen:

- Toggle "Activar Zenix Learning" → checkbox secundario "Regalo de bienvenida: Distintivo H"
- Al activar:
  - Aprovisiona Learning Core (L1)
  - Crea `LearningAssignmentRule` por defecto: todos los staff → curso GIFT
  - Trigger primer push de bienvenida "Bienvenido a tu primera capacitación"
- Si solo se activa el regalo (L0 sin L1):
  - Solo se enrolla el curso gift, sin acceso al catálogo CORE adicional

### Activation Report PDF (§80) — sección Learning

El reporte generado al activar la organization debe incluir:

```
─── Capacitación (Zenix Learning) ───

✅ Plan activado: Learning Core
✅ Curso de regalo: "Distintivo H + NOM-035-STPS"
✅ Staff enrollados: 12 de 12 (100%)
✅ Estimación cumplimiento STPS: 100% al completar
✅ DC-3 generator: habilitado
   Folio prefix: ZNX-LRN-2026
   URL pública verificación: https://verify.zenix.com/cert/{serial}

Próximos pasos para el manager:
1. Comunicar al equipo en su próxima junta
2. Asignar 2 horas/semana de tiempo dedicado por staff
3. Revisar manager dashboard cada lunes
```

---

## 4. Pricing comparison vs competencia

| Plataforma | Pricing | Target | LMS | DC-3 MX | Mobile offline |
|-----------|---------|--------|-----|---------|---------------|
| **Zenix Learning Core (L1)** | $7 USD/staff/mes | Boutique LATAM 5-50 hab | ✅ | ✅ | ✅ |
| TalentLMS | $69-149/mes hasta 40 users | SMB genérico | ✅ | ❌ | ✅ |
| iSpring Learn | $200-500/mes 100 users | SMB con authoring | ✅ | ❌ | ✅ |
| Docebo | $15-25k/año desde 1er contrato | Enterprise | ✅ | ❌ | ✅ |
| Typsy | $99 USD/mes per-user | Boutique hospitality | Solo Typsy content | ❌ | ❌ |
| AHLEI Academy | Per-course $50-500 | Profesionales individuales | ❌ self-paced | ❌ | ❌ |
| Cornerstone OnDemand | $5-12/user/mes mínimo $$$$ enterprise | Enterprise multi-país | ✅ | Custom $$$ | ✅ |

**Zenix wins en:** precio per-seat más bajo en su tier de SMB hospitality, único con DC-3 MX nativo, único embebido al PMS.

---

## 5. Marketplace cursos externos (Fase 2 — v1.2+)

### Modelo commission

Zenix recibe **20-30% commission** por cada curso vendido del marketplace. Provider externo (AHLEI partner, eHotelier, EHL alumni, consultor independiente) recibe 70-80%.

### Partner onboarding (v1.2 LEARNING-MKT)

```
1. Partner aplica vía portal `partners.zenix.com/learning`
2. ZaharDev revisa credenciales (certificación, calidad muestra de curso)
3. Partner sube curso en formato SCORM 1.2/2004 (Fase 2 obligatorio)
4. Zenix QA valida (calidad audio, contenido sin sesgos, accesibilidad)
5. Curso publicado en marketplace con badge "Partner verificado"
6. Pricing definido por partner, Zenix toma commission auto al pago
```

### Categorías de partner

- **Hospitality content providers**: AHLEI partners, eHotelier authors, Typsy creators
- **Consultoras LATAM**: consultores Distintivo H, NOM-035 specialists, instructores SECTUR registrados
- **Academias**: EHL alumni, Cornell School of Hotel Administration, ITESM Hospitality
- **Individuales certificados**: instructores con CHTP, CHA, CHHE

### Anti-abuse

- Reviews públicos solo de staff que **completó** el curso (no solo enrolled)
- Refund window 14 días post-purchase si <25% completado
- Partner quality score → si baja de 4.0/5 por 30 días, suspensión

---

## 6. Pricing edge cases

### Hotel multi-property

- Pricing per **staff activo** total cross-properties bajo misma `Organization`
- Volume discount: 50-99 staff → 15% off; 100+ → 25% off (negociado, no auto)
- Cadena con LegalEntity multi-país → pricing en USD único, factura cada LegalEntity localmente (CFDI MX, DIAN CO, etc.)

### Staff temporal / estacional

- Plan **bursty**: cliente declara forecast de staff (ej: 12 base + 8 estacional dic-mar) y paga el promedio. Reconciliación trimestral con cobro retroactivo si excede +20% del promedio.
- Curso pago por compliance temporal (ej: tomar 1 curso para evento) — modelo Phase 2.

### Cliente que prepaga 12 meses

- 2 meses gratis (16% descuento efectivo)
- Lock pricing — no afecta updates de precios durante esos 12 meses

### Cliente que termina relación con Zenix PMS pero quiere mantener LMS

- Plan stand-alone LMS-only disponible: $10 USD/staff/mes (vs $7 embebido)
- Razón: sin PMS, Zenix pierde el flywheel data (no sabe roles, departments, hire dates, performance)
- Migración: certificates y enrollments quedan accesibles. Staff data se conserva en LMS-only mode

---

## 7. Update obligatorio a `docs/zenix-sales-master.md`

Según el principio CLAUDE.md "Actualización automática del documento de ventas", al avanzar Zenix Learning a "in dev" hay que agregar al sales master:

- Sección "Capacitación (Zenix Learning)" con el pitch de 3 promesas (compliance LFT + diferenciador combo + hook regalo)
- Pricing table actualizada con SKUs L1-L4
- Curso de regalo como negotiation tool
- ROI calculator para prospect (multa potencial $586k MXN evitada)
- Casos de uso (Hotel Monica Tulum como flagship)

Y a `docs/prices-packages.md`:
- SKU list Zenix Learning añadido
- Bundling rules con PMS
- Volume discounts
- Stand-alone pricing

---

## 8. Bitácora

- **2026-05-21** — Doc creado. SKUs L0-L4, hook gift detallado, bundling con Activate, comparativa competencia, marketplace Fase 2, edge cases pricing.
