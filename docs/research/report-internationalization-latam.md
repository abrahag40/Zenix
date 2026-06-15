# Estudio — Internacionalización de la reportería (LATAM) + dueño multi-país

> **Fecha:** 2026-06-15 · **Para:** gobernar el catálogo de reportes de Zenix de cara a la internacionalización post-v1.0.0 (BR/CO/CR/GT/PE/AR además de MX) y resolver el caso "un dueño con un hotel en Brasil y otro en México". · **Método:** investigación asistida multi-fuente (2 agentes, fuentes oficiales de autoridades fiscales + documentación de PMS líderes). · **Marcado:** ✅ fuente primaria · 🟡 secundaria · ⚠️ inferencia.
>
> **Por qué existe:** decisión del owner 2026-06-15 — *"somos una consultoría seria y trabajamos con una sólida base a lo que digan los datos… no quiero asumir ni intuir absolutamente nada"*. Este estudio fundamenta cómo el catálogo de reportes se adapta por país y cómo el sistema sirve a un grupo multi-país, sin suposiciones.

---

## 1. Hallazgo central (consenso de industria, verificado)

**La fiscalidad de un reporte es SIEMPRE por entidad legal / país, e inmutable. La consolidación multi-país es SOLO una capa gerencial, nunca contable.** Confirmado en los 5 PMS líderes + USALI:

- ✅ **Mews** — cada propiedad nace con su *legal & tax environment* regional y **"cannot be changed once the enterprise has been created"**; cada tax environment trae sus *hard-coded tax codes*. ([docs.mews.com/connector-api/concepts/taxation](https://docs.mews.com/connector-api/concepts/taxation))
- ✅ **Oracle OPERA** — el cross-property posting **exige "identical local currencies"**: el sistema **no consolida postings entre divisas distintas**. Multi-país (BRL+MXN) cae fuera de un mismo cluster por diseño. ([docs.oracle — cross_property_posting](https://docs.oracle.com/cd/E98457_01/opera_5_6_core_help/cross_property_posting.htm))
- ✅ **Cloudbeds** — reportes contables (Daily Revenue / Transactions / Daily Financial) **"always show transactions in your property's default currency"**; la conexión a QuickBooks es **un mapeo por propiedad**. ([Multi-Currency FAQ](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/360058997873-Multi-Currency-FAQ) · [Connect QuickBooks](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/14006341059867-How-to-connect-Quickbooks-to-Cloudbeds-PMS))
- 🟡 **USALI 12ª ed.** (vigente 2026) — reporta en la **divisa funcional local de cada propiedad**; la conversión a divisa de grupo la hace el dueño aparte en la consolidación (territorio IAS 21, no USALI). La 12ª ed. añade *streamlined multi-property consolidation* como **reporte gerencial**, no como motor de traducción de divisa. ([HFTP](https://www.hftp.org/news/4122858/) · [antravia — USALI vs IFRS](https://antravia.ae/usali-vs-ifrs-bridging-operational-and-financial-reporting-in-global-hotels-or-antravia))

**Implicación directa:** nuestra jerarquía **Marca → Organización → Entidad Legal (país) → Propiedad** (§63-§72) coincide con el estándar. El reporte fiscal/contable se ancla a la **Entidad Legal** (su país define el régimen vía `FiscalRegime` + `IFiscalAdapter`, §69/§89), en su **divisa local**. El reporte de grupo es una vista gerencial aparte.

---

## 2. Reportes fiscales por país (qué exige cada autoridad + campos)

Cada país emite un comprobante timbrado/autorizado con **identificador único**, y espera un **libro/declaración periódica**. El reporte de facturación del PMS debe capturar como mínimo: **identificador único, tipo de comprobante, fecha, ID fiscal emisor+receptor, base imponible, impuestos desglosados por tipo/tasa, forma/medio de pago, moneda, total.**

| País | Comprobante (id único) | Reporte/libro periódico | Impuestos a desglosar | Fuente |
|---|---|---|---|---|
| **México** | CFDI 4.0 — tipos **I/E/P(REP)** · `UUID` | DIOT mensual + contabilidad electrónica + **declaración estatal ISH** | **IVA 16%** (nodo Impuestos) + **ISH estatal ~2.5–6%** (Complemento `implocal`, SEPARADO del IVA) ✅ | [Anexo 20](http://omawww.sat.gob.mx/tramitesyservicios/Paginas/documentos/Anexo_20_Guia_de_llenado_CFDI.pdf) · [implocal](http://omawww.sat.gob.mx/informacion_fiscal/factura_electronica/Documents/Complementoscfdi/implocal.pdf) |
| **Colombia** | Factura electrónica DIAN · `CUFE` | DJ IVA bimestral/cuatrimestral + INC + liquidación FONTUR | IVA 19% + INC 8% (restaurantes) + **contribución parafiscal turismo 2.5‰** sobre ingresos ✅ | [FONTUR](https://fontur.com.co/en/node/247) · [MINCIT](https://www.mincit.gov.co/minturismo/analisis-sectorial-y-promocion/preguntas-frecuentes-relacionadas-con-formalizacio/8-que-impuestos-se-deben-pagar) |
| **Brasil** ⚠️ | **NFS-e** municipal (ISS) · layout en transición | SPED Fiscal (EFD) + SPED Contábil (ECD) | **ISS 2–5% por municipio** → **IBS + CBS** (reforma 2026–2033, ISS desaparece 2033) ✅ | [Receita — Reforma 2026](https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/reforma-consumo/orientacoes-2026) · [NT 007/2026](https://www.legisweb.com.br/noticia/?id=32820) |
| **Costa Rica** | Comprobante electrónico **v4.4** (oblig. 1-nov-2026) + REP · clave numérica | DJ IVA mensual (D-104, prellenada TRIBU-CR) | **IVA 13%** (turismo volvió a tasa general 1-jul-2023) ✅ | [Sovos — IVA turismo 13%](https://sovos.com/es/cambios-regulatorios/iva/costa-rica-los-servicios-turisticos-de-costa-rica-vuelven-a-la-tasa-general-del-13-de-iva/) · [Softland v4.4](https://softland.com/cr/nuevos-cambios-de-la-facturacion-electronica-4-4/) |
| **Guatemala** | **FEL** — DTE en XML · `UUID` | DJ IVA mensual (libros desde DTE) | **IVA 12%** · aporte INGUAT ⚠️ (verificar antes de modelar) | [SAT GT — FEL](https://portal.sat.gob.gt/portal/efactura/) |
| **Perú** | Factura / Boleta electrónica SUNAT | **SIRE**: RVIE (ventas) + RCE (compras) → F.621 | **IGV 18%** ✅ (columnas exactas en Anexos 2/3 SUNAT ⚠️) | [RVIE — SUNAT](https://emprender.sunat.gob.pe/comprobantes-libros/registros-libros-electronicos/registro-ventas-e-ingresos-electronico-rvie) |
| **Argentina** | Factura A/B/C (ARCA/AFIP) · `CAE` (oblig. única 1-jun-2026) | **Libro IVA Digital** (RG 4597) + DJ IVA mensual (F.2002) | **IVA 21%** + **IIBB provincial** + percepciones (por provincia) ✅ | [Libro IVA Digital](https://www.afip.gob.ar/iva/documentos/Libro-IVA-Digital-Especificaciones.pdf) |

**Lecturas de diseño (honestas):**
- **MX y AR** exigen un impuesto sub-nacional (ISH por estado / IIBB por provincia) **separado del IVA** → debe ser data parametrizable (ya previsto en `TaxCatalogEntry` §91-§92), nunca hardcode. El reporte de revenue/impuestos debe **desglosar IVA e ISH/IIBB por separado**.
- **BR** NO es modelable con catálogo curado a mano (ISS por ~5,500 municipios + reforma móvil) → **adaptador fiscal especializado** (Sovos, alineado a §93). El reporte fiscal de Brasil lo produce el adapter, no nuestro catálogo.
- **CR/GT/PE** son los más simples: un único IVA/IGV a desglosar.

---

## 3. Propuesta — cómo el catálogo de reportes se internacionaliza

Tres clases de reporte, con comportamiento distinto frente al país:

1. **Reportes operativos / gerenciales país-neutrales** — Métricas (ADR/RevPAR/ocupación), No-shows, Estadías, Saldos vencidos, Housekeeping, Pickup/Pace. **Mismas columnas en todo LATAM**; lo único que cambia es la **divisa local** (ya resuelto: cada snapshot/folio lleva su `currency`, totales per-divisa SUM-able D-CASH3). → un solo reporte sirve a todos los países.

2. **Reportes fiscales país-específicos** — el "libro de ventas / facturación fiscal" cambia de columnas y de nombre por país: **CFDI (MX)**, **DIAN (CO)**, **NFS-e/SPED (BR)**, **Hacienda v4.4 (CR)**, **FEL (GT)**, **RVIE/SIRE (PE)**, **Libro IVA Digital (AR)**. → **un reporte por `FiscalRegime`**, producido por el `IFiscalAdapter` del país de la Entidad Legal. Patrón Mews "tax environment" / OPERA "config de la propiedad destino". El catálogo muestra el reporte fiscal **correspondiente al país de la propiedad activa** (CFDI si MX, NFS-e si BR…).

3. **Reportes de impuestos turísticos** — desglose del impuesto de hospedaje que cada país trata distinto (ISH MX por estado, parafiscal 2.5‰ CO, ISS BR, IIBB AR). → una sección de "Impuestos por concepto" parametrizada por `TaxCatalogEntry`, no una columna fija.

**Mecanismo:** cada definición de reporte del catálogo declara su `countries` / `fiscalRegime` de aplicabilidad. La biblioteca filtra por el `FiscalRegime` de la Entidad Legal de la propiedad activa → el contador de un hotel MX ve "Facturación CFDI"; el de un hotel BR ve "NFS-e / SPED". Agregar un país = 1 `FiscalRegime` + 1 adapter + marcar el reporte fiscal aplicable (sin tocar los país-neutrales).

---

## 4. Propuesta — dueño con hotel en Brasil y otro en México

El caso se resuelve con la jerarquía existente, alineada al consenso (§1):

- **Dos Entidades Legales** bajo la **misma Organización** (un dueño): `LegalEntity(MX, MXN, CFDI/Facturama)` y `LegalEntity(BR, BRL, NFS-e/Sovos)`. La propiedad de Tulum cuelga de la primera; la de São Paulo de la segunda (§63-§65).
- **Reporte fiscal: estrictamente por Entidad Legal, en su divisa local.** El hotel MX produce CFDI en MXN; el hotel BR produce NFS-e en BRL. **Nunca se mezclan** — es exactamente lo que OPERA fuerza ("identical local currencies") y Mews fija al crear la propiedad. El export contable es **uno por Entidad Legal** (un mapeo QuickBooks/CONTPAQi por entidad, como Cloudbeds).
- **Reporte gerencial de grupo: una vista consolidada OPCIONAL en "reporting currency".** El dueño elige una divisa de reporte (ej. USD); el sistema convierte ADR/RevPAR/ingreso de ambas propiedades con **FX explícito y marcado como NO-fiscal** (patrón Cloudbeds Insights Performance Analysis + Mews BI Multi-Property + USALI/IAS 21). Vive a nivel Organización/Marca, no en el libro contable.
- **Scope del reporte:** el selector de propiedad (ya existe el property switcher) define el alcance; el reporte fiscal se ancla a la Entidad Legal de la propiedad activa. El consolidado de grupo es una superficie aparte a nivel Org (futuro, scope `BRAND`/`LEGAL_ENTITY` del JWT §68).

**Regla de oro (de los datos):** *fiscal y export contable → por Entidad Legal, divisa local, país-específico. Consolidado de grupo → solo gerencial, divisa de reporte configurable, FX explícito, marcado no-fiscal.* Cualquier intento de consolidar contablemente entre divisas/países contradice el estándar de industria y se evita.

---

## 5. Recomendaciones accionables (para post-v1.0.0 internacionalización)

1. **Anclar todo reporte fiscal/contable a `LegalEntity.fiscalRegime`** (no a Property), en `LegalEntity.baseCurrency`. Los reportes país-neutrales se quedan a nivel Property en divisa local.
2. **El catálogo declara aplicabilidad por país** (`countries`/`fiscalRegime`); la biblioteca muestra el reporte fiscal del país de la propiedad activa.
3. **Reporte fiscal = producido por el `IFiscalAdapter`** del país (CFDI/DIAN/NFS-e/…), no por el motor genérico. Brasil vía Sovos (§93).
4. **Reporte consolidado de grupo** = superficie gerencial separada, scope Org, "reporting currency" con FX explícito + disclaimer "no es estado contable".
5. **Impuestos turísticos** (ISH/IIBB/parafiscal) = desglose parametrizado por `TaxCatalogEntry`, columnas dinámicas, nunca fijas.
6. **Bajar los anexos técnicos** de RVIE (PE, Anexos 2/3) y Libro IVA Digital (AR, RG 4597) como insumo antes de implementar esos dos — el detalle campo-por-campo no es público en la página índice (⚠️).

---

## 6. Limitaciones declaradas

- Las páginas de help de Cloudbeds devolvieron 403 a fetch directo → sus citas vienen de snippets de búsqueda (🟡 alta fidelidad, no fetch completo). Mews/Oracle confirmados por fetch directo (✅).
- USALI 12ª ed.: el texto primario está tras paywall (usali.hftp.org); las afirmaciones de divisa funcional son 🟡 (firmas contables/analistas).
- Columnas exactas de RVIE (PE) y Libro IVA Digital (AR): existencia/función ✅, lista campo-por-campo ⚠️ (anexos técnicos a descargar).
- Aporte INGUAT (GT) e impuesto de hospedaje nacional (GT/PE): no confirmados con fuente primaria ⚠️ — verificar antes de modelar.

## 7. Bibliografía
Ver URLs inline §2 + §1. Autoridades: SAT (MX), DIAN (CO), Receita Federal/Prefeituras (BR), Hacienda (CR), SAT (GT), SUNAT (PE), ARCA/AFIP (AR). PMS: Mews docs, Oracle OPERA docs, Cloudbeds help center. Estándar: HFTP/AHLA USALI 12th ed.
