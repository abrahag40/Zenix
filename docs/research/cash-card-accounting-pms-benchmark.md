# Estudio — Manejo de efectivo, TDC, arqueo y reportería contable en PMS de la competencia

> **Fecha:** 2026-06-14 · **Autor:** investigación asistida (deep-research manual, fuentes citadas) · **Para:** fundamentar el módulo Zenix **CASH-DRAWER-REPORTS** ([plan](../sprints/CASH-DRAWER-REPORTS-plan.md)).
>
> **Método:** búsqueda multi-fuente sobre documentación OFICIAL de los PMS (help centers/knowledge bases), reviews de usuarios (G2/Capterra/HotelTechReport), SOPs de industria (SetupMyHotel, hospitalitylawyer), estándares (AHLEI *Managing Front Office Operations*, USALI, Visa CRR) y fuentes LATAM en español. **Marcado de evidencia:** ✅ verificado con fuente primaria · 🟡 verificado parcial / fuente secundaria · ⚠️ asumido / inferencia razonada (sin fuente primaria accesible).
>
> **Nota honesta de cobertura:** un primer intento automatizado (workflow de 6 búsquedas en paralelo) fue bloqueado por rate-limit del servidor y devolvió 0 fuentes. Este estudio se rehízo de forma secuencial y manual; la profundidad por PMS es desigual (Cloudbeds/OPERA/Mews fuertes; Sirvoy/Little Hotelier débiles por falta de doc oficial sobre cajero-turno).

---

## 1. Resumen ejecutivo (lo esencial para el producto)

1. **El arqueo por turno de cajero es un estándar universal, no un lujo.** Cloudbeds, OPERA y RoomRaccoon lo traen nativo (apertura con fondo → cierre con conteo → over/short). Los PMS "ligeros" (Little Hotelier, Sirvoy) lo tienen débil o ausente porque asumen pago con tarjeta integrada. **Para LATAM, donde el efectivo domina, NO tener arqueo serio es descalificante.** ✅🟡
2. **El "blind drop" (conteo a ciegas) es el control anti-fraude canónico.** OPERA lo expone como parámetro (`BLIND_CASH_DROP_YN`); la SOP de industria lo prescribe. El esperado se oculta al cajero y solo aparece en el reporte de cierre/night audit. **Nuestra D-CASH5 está alineada con el estándar.** ✅
3. **Lo que el área contable MÁS ODIA es la reportería:** poca profundidad, poca personalización, exportación pobre, y conciliación dolorosa (pagos bulk contra múltiples facturas; OTA VCC que no cuadran). Es el flanco más quejado de Mews y un dolor transversal. **Aquí está la mayor oportunidad de diferenciación.** 🟡
4. **Las OTA Virtual Cards son un "operational nightmare" reconocido** (ventanas de activación/expiración, no cubren incidentales → ruteo manual, ventana de reconciliación de Expedia limitada). Validan nuestra decisión §87/§197 de exponer los datos de la VCC a recepción y reconciliar OTA-collect vs hotel-collect. ✅
5. **Multi-divisa per-fondo es práctica LATAM establecida** ("en hoteles fronterizos, dos fondos: uno en moneda nacional y otro en dólares"). Confirma D-CASH3 (reconciliar per-divisa, nunca agregado). 🟡
6. **El handover de turno con responsabilidad per-cajero es el corazón operativo** (recibir X → mover → entregar cuadrando). Cloudbeds lo encadena ("ending balance = next starting balance") y recomienda una gaveta por usuario; el estándar exige firmar al recibir + testigo al entregar. **Debe ser de primera clase en Zenix** (ampliación §3.1-bis). ✅
7. **El arqueo sorpresa ("inesperado") es cultura contable LATAM, pero lo hace la GERENCIA, no es una tarea que detiene al cajero.** Decisión owner (Opción C): el conteo obligatorio del recepcionista ocurre solo al recibir/entregar/cerrar; el arqueo a mitad de turno es una herramienta de solo lectura del supervisor, sin interrumpir a recepción. 🟡⚠️

---

## 2. Tabla comparativa por PMS (manejo de caja / TDC / arqueo / reportes)

| PMS | Cashier shift / cash drawer | Blind drop | Multi-divisa en caja | TDC / tokenización | Night audit | Reportes contables | Notas |
|---|---|---|---|---|---|---|---|
| **Oracle OPERA** | ✅ Completo — Close Cashier por cajero, fondo, drop al safe | ✅ Parámetro `BLIND_CASH_DROP_YN`; over/short solo en Cashier Summary del night audit | ✅ Sí (multi-currency cashiering) | ✅ Tokenización + EMV + interfaces de pago certificadas | ✅ Robusto, multi-propiedad, batch nocturno | ✅ El más completo; muchos reportes | Estándar de lujo; pesado, caro, requiere consultor |
| **Cloudbeds** | ✅ Cash Drawer + Cashier Report; Drawer Balance vs System Balance; Cash Drop; filtros "overages/shortages only"; email de cierre | 🟡 No expone blind-drop explícito (muestra system balance) | ✅ "How does multi-currency work with Cash Drawer" — soporta varias divisas | ✅ Cloudbeds Payments (Adyen) + tokenización; void de transacciones | ✅ Sí | 🟡 Cashier Report + Transactions Report; integración QuickBooks vía 3rd-party | Buen balance funcional para SMB |
| **Mews** | 🟡 Maneja efectivo pero el foco es card-first; "accounting editor" + bills | ⚠️ No documentado público | 🟡 Soporta multi-currency a nivel folio | ✅ Mews Payments (card-first, PCI fuerte) | ✅ "Automated night audit" (lo venden como diferenciador) | 🟡 Accounting report + **trial balance bloqueable**; pero **reporting criticado por poca profundidad/personalización** | Fuerte en automatización; débil en reportería custom |
| **RoomRaccoon** | ✅ Cash Drawer + "Cash Drawer Report at the Front Desk" | ⚠️ No documentado | ⚠️ No claro | ✅ RoomRaccoon Pay (card-first) | 🟡 Sí | 🟡 Básico | SMB europeo; cash drawer existe pero simple |
| **Little Hotelier** | ⚠️ Débil/ausente — foco en "Invoices and Payments" + card processing | ❌ | ❌ | ✅ Payment processing integrado | 🟡 Limitado | 🟡 Básico | Owner-operator pequeño; no es su fuerte el cajero-turno |
| **Sirvoy** | ⚠️ Sin doc oficial clara de cashier-shift | ❌ | ❌ | ✅ Stripe integrado | 🟡 | 🟡 | Muy simple por diseño |
| **Hotelogix / WebRezPro** | 🟡 Tienen night audit + shift report (legacy-style) | ⚠️ | 🟡 | 🟡 | ✅ | 🟡 | Data oficial parcial |

**Leyenda:** ✅ presente/fuerte · 🟡 presente/parcial · ⚠️ sin evidencia clara · ❌ ausente/débil.

> **Lectura de producto:** los **grandes (OPERA)** tienen todo pero son pesados; los **medianos (Cloudbeds)** son el benchmark realista a igualar; los **ligeros (LH/Sirvoy/RR)** tienen huecos en cajero-turno multi-divisa serio. **Zenix puede igualar a Cloudbeds en lo básico y superar en (a) multi-divisa per-fondo LATAM, (b) blind drop por defecto, (c) arqueo sorpresa a mitad de turno, (d) reportería exportable que el contador realmente ama.**

---

## 3. Detalle por eje

### 3.1 Manejo de efectivo / arqueo

- **Apertura con fondo (opening float / "bank"):** estándar AHLEI — el cajero requisita al General Cashier un fondo en denominaciones para dar cambio; debe rendir cuentas al cierre. ✅
- **Cierre con drop al safe + testigo:** cada cajero hace el drop de efectivo/cheques/vouchers al drop-safe del hotel inmediatamente al terminar su turno, **con un testigo**. ✅ (SetupMyHotel SOP + AHLEI)
- **Blind drop (conteo a ciegas):** OPERA `BLIND_CASH_DROP_YN=Y` oculta el monto esperado; el cajero ingresa lo que tiene en mano; el **over/short aparece solo en el Cashier Summary del night audit** (no en el cierre del cajero). Propósito: "prevents cashiers from seeing the expected amount before reconciling, which promotes accuracy and prevents bias." ✅
- **Over/short:** *overage* = (efectivo + cheques + paid-outs) > recibos; *shortage* = lo inverso. Estándar AHLEI/Wikipedia "cashier balancing". ✅
- **Cloudbeds concreto:** "Drawer Balance" (lo físico antes de retirar) vs "System Balance" (lo esperado) — deben coincidir; **Cash Drop** = lo que se retira y se descuenta del siguiente arranque; filtros de reporte por *Ending Balance Overages/Shortages Only*; los destinatarios reciben **email con Drawer Closure Summary** al cerrar. ✅
- **Multi-divisa LATAM:** "en los hoteles fronterizos es recomendable tener **dos fondos: uno en moneda nacional y otro en dólares**"; el cambio de divisa es servicio al huésped según política del hotel. 🟡 Confirma reconciliar per-divisa.
- **Arqueo sorpresa (cultura LATAM):** "el arqueo… **siempre debe hacerse de una manera inesperada** para auditar movimientos de cuentas incorrectas y mal manejo del fondo y de moneda extranjera." 🟡

### 3.1-bis Handover de turno y responsabilidad per-recepcionista (ampliación 2026-06-14)

> Añadido tras cuestionamiento del owner: el traspaso de turno con transferencia de responsabilidad es el corazón operativo y el primer estudio lo trató implícito. Evidencia dirigida:

- **Cada cajero responde por SU efectivo (banco personal / imprest).** "One cashier's bank assigned per employee each shift"; "some hotels have common banks… though this approach creates accountability challenges"; "only one user per shift = highest accountability, held solely responsible." El **imprest fund** es un fondo fijo de cambio asignado al cajero. ✅ (hospitalitylawyer + 4 FAM 390 + retail SOP)
- **Cloudbeds encadena turnos explícitamente:** "the **ending shift balance will be equal to the starting balance** next time the drawer is opened"; el cash drop entered se descuenta del arranque siguiente; y recomienda **"create one cash drawer per user"**. ✅ — Esto ES el modelo "recibo X → muevo → entrego" que el owner describe.
- **Firma al recibir + testigo al entregar (transferencia de responsabilidad):** "verify and **sign for the bank** if issued at the start of each shift"; "at least one additional employee should **witness and sign** for each employee's drop"; "the outgoing cashier **signs off** confirming the count and handover is complete, and register access is transferred formally." ✅
- **Handover verbal + log:** cada cambio de turno incluye 10–15 min de handover (huéspedes VIP, pendientes) + un **handover log digital** que evita pérdida de información. ✅
- **Cierre con cuadre contra el sistema:** "the drawer must be **counted and reconciled at shift end with system totals**, documenting any variances with an explanation." ✅

**Modelo canónico (lo que Zenix debe implementar):** RECIBIR (contar + aceptar/firmar el fondo → responsabilidad del entrante) → MOVER (pagos efectivo in, cambios/paid-outs out) → ENTREGAR/CERRAR (contar → esperado = fondo + Σcobros − Σsalidas per-divisa → variance) → traspaso al siguiente (que acepta como su apertura) **o** drop al safe con testigo. Cada turno = un Cashier Shift Report individual.

### 3.2 Tarjetas / TDC

- **Card-first en los modernos:** Mews/RoomRaccoon/Little Hotelier/Sirvoy empujan su propio procesador (Adyen/Stripe) con tokenización → reducen su superficie PCI (SAQ A). ✅⚠️
- **Pre-auth de incidentales:** patrón estándar (auth al check-in, capture al checkout). ⚠️ (conocimiento de industria; no extraje doc primaria en esta pasada)
- **OTA Virtual Cards = dolor reconocido:** "VCCs… are an **operational nightmare** for many hotels"; cada VCC tiene **fecha de activación, ventana de expiración y límite de cargo**; la VCC llega como método primario **aunque no cubre incidentales** → requiere **ruteo manual** de los cargos del huésped a un bill separado; Expedia solo permite reconciliar **desde el check-in hasta el día 4 del mes siguiente al checkout** (no futuras). ✅
- **Implicación Zenix:** ya tenemos `channexGuaranteeMeta` (§197) exponiendo la VCC a recepción + `paymentModel` OTA_COLLECT/HOTEL_COLLECT/HYBRID (§87). El estudio valida que esto es un diferenciador real.

### 3.3 Night audit

- **6 pasos canónicos:** (1) postear room+tax, (2) reunir cargos/pagos del huésped, (3) reconciliar finanzas departamentales, (4) reconciliar A/R, (5) trial balance, (6) night audit report. ✅
- **Automatización como venta:** Mews promociona el "automated night audit"; OPERA lo corre batch multi-propiedad. ✅
- **Zenix ya tiene** `NightAuditScheduler` multi-timezone (§12) — el over/short del cajero debe aterrizar en el reporte de cierre nocturno (patrón OPERA: over/short se revela en el Cashier Summary del night audit).

### 3.4 Reportería contable (el flanco caliente)

- **Mews trial balance bloqueable:** "download a **locked trial balance** for any date with revenue, payments and taxes clearly split → less stressful audits and faster month-end closes." ✅ (esto lo AMAN)
- **Pero el reporting de Mews es criticado:** "reporting features lacking in depth", "limited options for customizing reports and data visualization", y dolor de "matching **bulk wire payments to multiple invoices**, with invoices piling up that can't be posted." 🟡 (esto lo ODIAN)
- **Integración GL:** el puente PMS→QuickBooks suele ser 3rd-party (ej. reseñas de "The Percentage App" conectando Cloudbeds→QuickBooks "saves literally hours"); es un valor enorme cuando funciona. 🟡
- **USALI 12th ed.** (HFTP/AHLA, vigente 2026) es el marco de cuentas uniforme; el contador hotelero espera revenue por departamento/centro. ✅ (estándar)

---

## 4. Lo que el usuario contable/administrativo AMA / ODIA / DESEA (priorizado, con evidencia)

### 💚 AMA (imitar)
1. **Trial balance bloqueado por fecha, con revenue/pagos/impuestos separados** → cierres de mes más rápidos y auditorías sin estrés (Mews). 🟡 — *Imitar.*
2. **Cierre de caja con email-resumen automático** a los destinatarios configurados (Cloudbeds Drawer Closure Summary). ✅ — *Imitar.*
3. **Filtros directos "solo sobrantes / solo faltantes"** en el reporte de cajero (Cloudbeds). ✅ — *Imitar (es barato y muy querido).*
4. **Night audit automatizado** que entrega el reporte sin trabajo manual (Mews/OPERA). ✅ — *Ya lo tenemos; conectarlo al cierre de caja.*
5. **Integración contable que "ahorra horas"** (PMS→QuickBooks/Xero). 🟡 — *Diferir el conector, pero entregar export CSV/Excel limpio desde día 1.*

### 💔 ODIA (evitar)
1. **Reportes sin profundidad ni personalización, exportación pobre** (queja transversal, fuerte en Mews). 🟡 — *Evitar: export CSV/Excel completo y reportes con desglose real desde el inicio.*
2. **Conciliación dolorosa de pagos bulk vs múltiples facturas / OTA VCC que no cuadran** (Mews community + OTA VCC nightmare). ✅🟡 — *Evitar: `transactionGroupId` ya agrupa; exponer OTA-collect claramente.*
3. **VCC como nightmare manual** (ventanas, no cubre incidentales, ruteo manual). ✅ — *Evitar: exponer la VCC a recepción + estado OTA-collect (ya §197).*
4. **Setup complejo / formularios con campos irrelevantes** (Mews "complex to set up, forms with many fields"). 🟡 — *Evitar: caja con mínimos campos (fondo, conteo, razón si descuadra).*
5. **Costos que escalan por integraciones de terceros necesarias** (Mews). 🟡 — *Evitar: arqueo + reportes nativos, sin add-on.*

### ✨ DESEA (oportunidad de diferenciación)
1. **Arqueo SORPRESA a mitad de turno sin cerrar el turno** (cultura LATAM "inesperado"). 🟡⚠️ — *Casi nadie lo cubre bien → diferenciador.*
2. **Multi-divisa per-fondo de verdad** (dos fondos MXN/USD reconciliados por separado, fronterizo). 🟡 — *Diferenciador LATAM; Cloudbeds lo toca, los ligeros no.*
3. **Blind drop por defecto** como control anti-fraude (OPERA lo tiene como opción; ponerlo bien por default es señal de seriedad). ✅ — *Diferenciador de confianza.*
4. **Trazabilidad cajero↔transacción↔CFDI** para defensa fiscal y disputa interna. ⚠️ — *Único en LATAM si lo hacemos bien.*
5. **Cuadre que ata efectivo + TDC + transferencia + OTA + cortesía por divisa en una sola vista** (shift report agregando todos los tender types, solo CASH se reconcilia físico — patrón AHLEI). ✅ — *Imitar+mejorar.*

---

## 5. Hallazgos LATAM-específicos

- **Efectivo domina** → el arqueo serio no es opcional; es el control diario del dueño. 🟡
- **Multi-divisa real** (USD + moneda local), con **fondos separados** en zona fronteriza/turística. 🟡 → per-divisa obligatorio (D-CASH3).
- **Arqueo sorpresa** como práctica de control del contador. 🟡 → habilitar snapshot a mitad de turno.
- **CFDI on payment** (México): el cobro genera factura; el arqueo debe poder enlazar el pago con su comprobante fiscal. ⚠️ → reservar el hook (no construir CFDI aquí; es CFDI-CORE).
- **El dueño revisa la caja personalmente** → reporte legible/imprimible/exportable es lo primero que pedirá.

---

## 6. Recomendaciones de diseño para Zenix (ajustes a las decisiones D-CASH)

| # | Recomendación | Acción sobre el plan |
|---|---|---|
| R1 | **Blind drop por DEFAULT**, no opcional. Validado por OPERA + SOP. | **Confirma D-CASH5.** Cambiar de "recomendado" a default-on. |
| R2 | **Reconciliación per-divisa con fondos separados** (MXN/USD/EUR). | **Confirma D-CASH3.** Sin cambios. |
| R3 | **Variance > umbral → razón + supervisor**, over/short revelado en el reporte/night audit (no al cajero en el cierre). | **Confirma D-CASH6 + ajusta:** el over/short se muestra al supervisor / en el Cashier Summary, no al cajero (patrón OPERA). |
| R4 | **Conteo obligatorio solo en fronteras del turno (recibir/entregar/cerrar); arqueo "spot" opcional y de solo lectura del SUPERVISOR** (Opción C, decisión owner). Sin ninguna acción que interrumpa al recepcionista — el supervisor cuenta él mismo si quiere un arqueo a mitad de turno. | **D-CASH13** + historia en E2. |
| R11 | **NUEVO — Handover de turno con cadena + doble firma** (recibir/aceptar → mover → entregar). Cada turno encadena `actualClose`→`openingFloat` del siguiente; el entrante cuenta y acepta (transfiere responsabilidad). | **Agregar D-CASH14** + E1/E5. |
| R12 | **NUEVO — Banco personal (imprest) por default** (one drawer per user). Máxima responsabilidad individual. | **Agregar D-CASH15** + Settings (`cashBankModel`). |
| R5 | **Cashier Shift Report agrega TODOS los tender types**, solo CASH se reconcilia físico. | **Confirma D-CASH7.** Sin cambios. |
| R6 | **Email/print del cierre de caja** (Drawer Closure Summary) + filtros "solo sobrantes/faltantes". | **Agregar a E4** (reportes). Barato, muy amado. |
| R7 | **Export CSV/Excel limpio desde día 1**; el conector GL (QuickBooks/Xero) se difiere pero el export NO. | **Confirma E4.** Priorizar export. |
| R8 | **Trazabilidad cajero↔pago↔(hook CFDI)** + OTA-collect visible. | Ya cubierto por §87/§197 + `collectedById`; reservar hook CFDI. |
| R9 | **Mínimos campos en la UI de caja** (evitar el "Mews con 40 campos"). | Principio de diseño para E5. |
| R10 | **Enforcement gradual** (`cashShiftRequired` off por default en el piloto vivo). | **Confirma D-CASH4.** Sin cambios. |

**Veredicto:** el plan `CASH-DRAWER-REPORTS` está bien encaminado y alineado con el estándar. Tras el cuestionamiento del owner (2026-06-14), el ajuste **más importante** es **(R11) hacer el handover de turno de primera clase** — recibir/aceptar → mover → entregar, con cada turno como registro de responsabilidad individual; era el hueco real. Le siguen: **(R4) spot count como herramienta del supervisor, no popup al cajero**; **(R3) ocultar el over/short al cajero**; **(R1) blind drop por default**; **(R12) banco personal imprest**; y **(R6/R7) reportes exportables** — el flanco débil de la competencia.

---

## 7. Fuentes

**Documentación oficial PMS**
- Cloudbeds — [Cashier Report](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/25931992998683-Cashier-Report), [Close Cash Drawer & cashier's report](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/360059266553-Close-Cash-Drawer-and-generate-a-cashier-s-report), [Cash Drawer — everything](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/217995958-Cash-Drawer-Everything-you-need-to-know), [Multi-Currency + Cash Drawer](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/360057123834-Multi-Currency-How-does-it-Work-with-Cash-Drawer-), [Void transactions](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/1260805465149-How-to-void-transactions), [Expedia FAQ](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/360047222133-Expedia-FAQ)
- Oracle OPERA — [BLIND CASH DROP setting](https://docs.oracle.com/cd/E98457_01/opera_5_6_core_help/blind_cash_drop_yn_param.htm), [Close Cashier](https://docs.oracle.com/cd/E98457_01/opera_5_6_core_help/close_cashier.htm), [Closing Cashiers](https://docs.oracle.com/cd/F18689_01/doc.193/f38312/t_cashiers_closure.htm)
- Mews — [Accounting report](https://help.mews.com/en/articles/4245918-accounting-report), [Best Hotel Accounting Software](https://www.mews.com/en/products/accounting-software), [What is a Night Audit](https://www.mews.com/en/blog/hotel-night-audit-automation), [Community: issues with invoices and reconciliation](https://community.mews.com/united-states-based-members-37/issues-with-invoices-and-reconciliation-1640)
- RoomRaccoon — [Cash Drawer Report at the Front Desk](https://contact.roomraccoon.com/en/support/solutions/articles/150000015406-how-to-use-the-cash-drawer-report-at-the-front-desk), [How to use the Cash Drawer](https://contact.roomraccoon.com/en/support/solutions/articles/150000015394-how-to-use-the-cash-drawer)
- Little Hotelier — [Invoices and Payments](https://www.littlehotelier.com/billing-and-payment/)

**OTA Virtual Cards**
- [ChargeAutomation — Process OTA VCCs automatically](https://chargeautomation.com/process-virtual-credit-cards-booking-expedia-automatically/) · [Cloudbeds Expedia reconciliation](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/22794187290011-Expedia-reconciliation-feature-Cancel-and-update-reservations-from-within-Cloudbeds-PMS) · [RateGain — Expedia Virtual Card](https://rategain.com/blog/streamlining-payments-with-expedia-virtual-card-for-hoteliers/)

**Estándares / SOP**
- [SetupMyHotel — Cash Drop Safe SOP](https://setupmyhotel.com/hotel-sop-standard-operating-procedures/finance-accounting-sop/sop-finance-and-accounting-cash-drop-safe-procedure/) · [SetupMyHotel — Cashier's report](https://setupmyhotel.com/glossary/cashiers-report/) · [hospitalitylawyer — Cashier bank audit procedures (PDF)](https://hospitalitylawyer.com/wp-content/uploads/2019/01/Cashier-bank-audit-procedures.pdf) · [Wikipedia — Cashier balancing](https://en.wikipedia.org/wiki/Cashier_balancing) · [AHLEI — Managing Front Office Operations 11e](https://info.ahlei.org/mfoo/) · [Wikipedia — Night auditor](https://en.wikipedia.org/wiki/Night_auditor)

**LATAM (español)**
- [Clavijero — Manejo de las cajas de recepción](https://cursos.clavijero.edu.mx/cursos/078_pch/modulo2/contenidos/tema2.4.html?opc=0) · [Diario del Hotelero — Área de caja](https://www.diariodelhotelero.com/nota-area-de-caja-de-un-hotel-169456) · [SENA — Manual de caja](https://sena-cajayauditoria.blogspot.com/p/manual-de-caja.html) · [SiHoteles — PMS México](https://sihoteles.com/pms-hotelero/)

**Reviews**
- [Mews en G2](https://www.g2.com/products/mews/reviews) · [Research.com — Mews pros/cons](https://research.com/software/reviews/mews-operations) · [Capterra — Hotel PMS](https://www.capterra.com/p/128022/Hotel-PMS/reviews/)

> **Limitación declarada:** Sirvoy, Little Hotelier y Clock/Hotelogix/WebRezPro quedaron con cobertura parcial (sin doc oficial clara de cajero-turno multi-divisa). Las afirmaciones ⚠️ sobre pre-auth de incidentales y SAQ A son conocimiento de industria, no extracción de fuente primaria en esta pasada. Recomendable una segunda pasada dirigida si se quiere cerrar esos huecos.
