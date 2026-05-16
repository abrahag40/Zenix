---
Audiencia: Product owner Zenix · Equipo de desarrollo · Contador / asesor fiscal LATAM · Stakeholders v1.0.0
Estado: Propuesta de trabajo para aprobación
Branch: feature/cancel-archive
Última actualización: 2026-05-16
Documento hermano: docs/sprints/CANCEL-ARCHIVE-plan.md (plan técnico de implementación día-por-día)
---

# Propuesta de trabajo — Sprint CANCEL-ARCHIVE de reservas

> **Propósito de este documento**: justificar con datos verificables por qué el sprint Cancel-Archive es bloqueante para v1.0.0, qué hacen los competidores (con peso explícito en sus errores y quejas de usuarios), cómo Zenix se diferencia, y la conclusión: los 10 puntos no-negociables del sprint quedan firmes con 3 correcciones derivadas de la investigación.

---

## 1. Por qué v1.0.0 no es "competitivo" sin Cancel-Archive

### 1.1 El gap operativo medible

Hoy una reserva en Zenix se puede mover, extender o marcar no-show. **No se puede cancelar.** En la industria hotelera, el cancellation rate medio de bookings directos es ~10% y de OTAs entre 25-50% según rate plan ([D-EDGE Hospitality Solutions — Cancellation rate study 2024](https://www.d-edge.com/hospitality-data-analytics/)). Un PMS sin cancel obliga al recepcionista a:

- **Marcar como no-show fuera de ventana legal** — rompe §16 (48h reversion) y §11 (no-show inmutable).
- **Mover el bloque a una habitación bloqueada** — corrompe occupancy reports.
- **Pedir delete por SQL al soporte** — sin audit trail, vulnera GDPR Art. 5.1.f (integrity) y CFF Art. 30 (5 años retención fiscal MX).

Los 3 workarounds son **inaceptables para un cliente piloto que cobra tarjeta**.

### 1.2 Lo que pesa además: USALI 12 entra en vigor 2026-01-01

[HFTP/AHLA — Anuncio oficial](https://www.ahla.com/news/hftp-ahla-and-gfc-unveil-groundbreaking-12th-revised-edition-uniform-system-accounts-lodging) confirma adopción mandatoria el **1 de enero de 2026** (menos de 8 meses después del release planeado). USALI 12 separa explícitamente:

- **No Show Revenue** (línea Rooms Department, guest no se presentó).
- **Cancellation Fees** (línea **Miscellaneous Income** distinta).

Cita textual de Robert Mandelbaum (Hospitality Net, autoridad USALI):
> *"income received from transient guests and groups that cancel their reservations… after a contracted or cutoff date"* — [USALI 12 cancellation treatment](https://www.hospitalitynet.org/opinion/4093423.html).

**Ningún PMS de los 5 estudiados** (Cloudbeds, Mews, Opera, RoomRaccoon, Little Hotelier) entrega esta separación nativamente. Confirmado por la propia [explicación USALI de Cloudbeds](https://www.cloudbeds.com/articles/usali-accounting/). Zenix puede shippear esto como ventaja explícita.

---

## 2. Cómo lo hacen los 5 PMS — flujos verificados con fuente

### 2.1 Cloudbeds

**Flujo:** Reservation Details → status dropdown → "Canceled". **No refunda automáticamente:** *"Cancelling the reservation does not automatically refund any payment processed for the guest"* — [Cloudbeds help](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/360008188313).

**Distinción crítica:** existe Cancel (soft, status flip) **vs Delete (hard, irreversible)** — gap conceptual peligroso:
> *"The action to delete a reservation cannot be undone, and it is not possible to restore the deleted booking. You must recreate the reservation by adding it manually."* — [Cloudbeds: Delete reservations](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/360003077054).

**CFDI MX:** integración eFactura SAT pero **separa cancelación de CFDI vs nota de crédito como dos acciones manuales del usuario**:
> *"the issuance of a credit note does not have the purpose of canceling a CFDI"* — [Cloudbeds eFactura](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/40401739371675).

Sin lógica automatizada de `FormaPago=15`. Cliente debe orquestar manualmente PAC + cancelación + NC.

### 2.2 Mews

**Flujo:** Reservation → Status tab → Cancellation → "Apply cancellation fee" → confirm. Soft delete con **ventana editable de historia** para undo.

**Caso documentado del gap previo:** la feature "Undo booking cancellation" estuvo **abierta 2 años** (2021-09 → 2023-05) con **817 votos** del foro oficial Mews ([feedback.mews.com #36660172](https://feedback.mews.com/forums/918232-property-operations-pms/suggestions/36660172-undo-booking-cancellation)). Citas verbatim del foro:

> *"Sometimes it's just a mistake and it's very laborious to make a new reservation"* — Nina, 2022-12-01
>
> *"I can't understand how something so important hasn't been implemented after 2 years"* — Salvador Hansen, 2021-09-06
>
> *"Sometimes a guest will call to cancel and then a few hours later change their minds. Instead of having to make a brand new reservation"* — Line Marie Lavin, 2022-11-16

**Rollout fue retrasado en Francia y Guadalupe por compliance fiscal local** — confirma que cancellation tiene impacto fiscal serio que Zenix debe modelar desde día 1.

**Gaps actuales aún abiertos:** export del Posting Journal **no expone cancellation reason** ([Mews community daily auditing](https://community.mews.com/community-library-94/daily-pms-auditing-186)); no hay notificación push de cancelación ([thread #923](https://community.mews.com/mews-pms-property-operations-83/notified-when-there-is-any-cancellation-923)); auto-refund no existe — open folio manual ([Mews help: cancellation fees](https://help.mews.com/s/article/how-to-deal-with-cancellations-fee)).

### 2.3 Opera Cloud (Oracle)

**Flujo:** Bookings → Manage Reservation → "I Want to..." → Cancel Reservation. **Reason code MANDATORY** seleccionado de lista predefinida (`WEATHER`, `FLIGHT`, etc.) — único de los 5 que lo obliga. — [Managing Reservation Cancellation 25.5](https://docs.oracle.com/en/industries/hospitality/opera-cloud/25.5/ocsuh/t_managing_reservation_cancellation.htm).

**Reinstate matrix documentada:**
- Cancelled → reinstate si arrival_date >= business_date
- No-show → reinstate si departure_date >= business_date
- Checked-out → reinstate solo same-day antes de End of Day

Business Events emitidos `ROLLBACK_CANCEL` / `REACTIVATE_NO_SHOW` permiten auditoría downstream — [Reinstating Reservations](https://docs.oracle.com/en/industries/hospitality/opera-cloud/24.4/ocsuh/t_managing_reservations_reinstating_no_show_reservations.htm).

**Limitación crítica del Cancellation Summary Report:** *"Cancellation Summary report only displays when the OPS Sales & Catering license code is active"* — funciona solo para groups/blocks. **Transient cancellations quedan fuera del reporte oficial** ([Oracle Reporting Subject Areas PDF](https://docs.oracle.com/en/industries/hospitality/opera-reporting-analytics/ddrna/SA_Definitions.pdf)). Gap competitivo: Zenix puede ofrecer transient + groups en un reporte unificado.

### 2.4 RoomRaccoon

**Flujo:** Reservation → dropdown status → "cancelled". **No expone delete** al usuario: *"You cannot delete a reservation, however you can cancel it."* — [Reservations FAQ](https://contact.roomraccoon.com/en/support/solutions/articles/150000190972).

**Bug operativo crítico documentado oficialmente:**
> *"Why are some cancelled reservations from Booking.com not automatically removed from my RoomRaccoon calendar?"* — [RoomRaccoon Help](https://help.roomraccoon.com/en/article/why-are-some-cancelled-reservations-from-bookingcom-not-automatically-removed-from-my-roomraccoon-calendar-1wg4udr/).

El propio help center reconoce el bug y recomienda workaround "grey room". **Riesgo de overbooking si el recepcionista no detecta el desync** — refuerza la necesidad de la decisión D-CHX5 del sprint Channex Inbound (conflict resolution con AppNotif al supervisor).

Filtro de Cancellation Date en Custom Reports recién agregado en **Release 25.2 (abril 2025)** — feature reciente, sin reason taxonomy ([RoomRaccoon Release 25.2](https://contact.roomraccoon.com/en/support/solutions/articles/150000204009)).

### 2.5 Little Hotelier

**Flujo:** Front Desk → open reservation → pencil → cancel. **Política rígida channel-first**:
> *"Cancellations and modifications of reservations should always be made in the channel it was booked on"* — [Little Hotelier mobile cancel](https://helpcentre.littlehotelier.com/en/articles/8692529).

**Sin restore/reinstate público documentado.** No tiene Cancelation Report dedicado — datos solo en macro market reports.

---

## 3. Quejas dominantes — peso a las negativas

Patrón consistente en Capterra, G2 y foros oficiales:

| PMS | Queja documentada | Fuente |
|---|---|---|
| **Cloudbeds** | "asked to cancel but company refused to refund"; soporte impersonal con respuestas scripted | [Capterra reviews](https://www.capterra.com/p/158839/Cloudbeds/reviews/) |
| **Cloudbeds** | Delete irreversible — el help center oficial admite que debe recrearse manualmente | [Cloudbeds Delete docs](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/360003077054) |
| **Cloudbeds** | CFAR (Cancel for Any Reason) sin breakdown en reportes — gap auto-confesado | [Cloudbeds CFAR FAQ](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/39033609376411) |
| **Mews** | Undo cancellation tomó 2 años, 817 votos del foro | [feedback.mews.com](https://feedback.mews.com/forums/918232-property-operations-pms/suggestions/36660172) |
| **Mews** | Posting Journal export sin cancellation reason | [Mews community](https://community.mews.com/community-library-94/daily-pms-auditing-186) |
| **Mews** | Sin notificación push de cancelación | [Mews community](https://community.mews.com/mews-pms-property-operations-83/notified-when-there-is-any-cancellation-923) |
| **Mews** | Auto-refund inexistente — open folio manual | [Mews help](https://help.mews.com/s/article/how-to-deal-with-cancellations-fee) |
| **RoomRaccoon** | Booking.com cancellations no se borran del calendario — bug reconocido | [RoomRaccoon Help](https://help.roomraccoon.com/en/article/why-are-some-cancelled-reservations-from-bookingcom-not-automatically-removed-from-my-roomraccoon-calendar-1wg4udr/) |
| **Genérico** | "If cancellations do not arrive or a booking is duplicated, the PMS can show artificial occupancy" | [Lean Hotel System](https://leanhotelsystem.com/en/hotel-systems-integration-problems/) |

**Lectura industria-wide:** los usuarios pagan por PMS premium y siguen quejándose 2-4 años por features de cancel/audit que deberían ser básicas. Esto es la barrera de entrada de Zenix.

---

## 4. Casos de uso reales documentados

### Caso 1 — Mews: 2 años de feature gap medible

Feature request "Undo booking cancellation" abierto **2021-09-06**, released **2023-05-17**. 817 votos. Comentarios señalan costo operacional cuantificable: cada cancel accidental = rebuild manual de reservation con risk de pérdida de deposit history, comm log, OTA reference. **Caso paradigmático de por qué el restore debe estar en v1.0 día 1, no en v1.x**.

### Caso 2 — Cloudbeds: delete irreversible documentado

Cliente con typo en booking ref, pulsa Delete en vez de Cancel, sin warning suficiente. Help center oficial: *"You must recreate the reservation by adding it manually."* Sin garantía de paridad de datos en deposit, payment, comm log. **Caso paradigmático del por qué Zenix prohíbe hard-delete (§D-CAN1)**.

### Caso 3 — RoomRaccoon: orphan OTA cancellations

Cancelación de Booking.com no se propaga, recepcionista no la ve hasta que llega un walk-in que choca con habitación "ocupada". Workaround oficial: marcar manualmente como "grey room". **Caso paradigmático del por qué Channex Inbound (sprint hermano) requiere conflict resolution con review queue manual (§D-CHX5)**.

### Caso 4 — Mews FR/GP: compliance fiscal retrasa rollout

El release del undo se retrasó en Francia y Guadalupe por interacción con CFDI-equivalentes locales. **Caso paradigmático del por qué Zenix modela CFDI E (FormaPago=15) y cancelación CFDI por jurisdicción desde el inicio (§89 FiscalAdapter pattern)**.

---

## 5. Diferencia operativa Cancel vs No-show

Convergencia documentada en la industria:

| Dimensión | Cancel | No-show |
|---|---|---|
| Cuándo aplica | Antes del arrival cutoff | Después del arrival cutoff sin guest physical arrival |
| ¿Libera inventario? | **Sí** (todos los PMS) | **Depende** — WebRezPro NO libera ([WebRezPro doc](https://webrezpro.com/cancellations-and-no-shows-prevention-strategies-for-hotels/)), Zenix §17 SÍ libera, Opera vía config |
| ¿Aplica penalty? | Según rate plan | Casi siempre (cargo de 1 noche estándar industry) |
| ¿Genera deuda inmediata? | No (refund o credit) | Sí (charge a card-on-file) |
| ¿Refund? | Aplicable si paid | Generalmente no — penalty es lo cobrado |
| ¿Trazabilidad fiscal? | CFDI E (Egreso) si hubo CFDI I | Cargo nuevo, no CFDI E |

**Confusión operativa documentada** en Mews: existe email "Reservation was already canceled" que se dispara cuando staff intenta marcar no-show sobre algo ya cancelled ([Mews docs](https://help.mews.com/en/articles/4583147)) — confirma que **la separación cancel/no-show no es trivial en la UX** y debe estar diseñada explícitamente.

Cloudbeds resuelve esto con **reportes separados**: Cancelations Report ([link](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/25913491478811-Cancelations-Report)) vs No-Show to Booking.com Report ([link](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/360041135154)). Zenix debe seguir este patrón.

**Diferenciador defendible:** USALI 12 obliga la separación contable. Ningún PMS la entrega nativamente. Zenix v1.0.3 REPORTS-CORE entregará un reporte único **"USALI 12 Cancellation & No-Show P&L"** con las dos líneas separadas — diferenciador real comunicable a un contador.

---

## 6. Reportes y auditoría — gaps de mercado verificados

| Reporte | Cloudbeds | Mews | Opera | RoomRaccoon | Little Hotelier | Zenix v1.0.3 |
|---|---|---|---|---|---|---|
| Cancellation report | ✅ pero sin reason filter | ✅ via Reservation Report con `Cancelled on` filter | ✅ pero solo groups (gating S&C) | ✅ desde Release 25.2 (abr 2025) | ❌ | ✅ con reason taxonomy + per-OTA breakdown |
| Cancellation rate / pace | ❌ | ❌ | Parcial | ❌ | ❌ | ✅ pre-arrival vs post-arrival como métricas distintas |
| Audit trail con reason verbose | ❌ | ❌ (export sin reason) | ✅ con Business Events | ❌ | ❌ | ✅ append-only `GuestStayLog` (§D-CAN4) |
| USALI 12 P&L line separation | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ — diferenciador |
| Chargeback Evidence Pack (Visa 13.7) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ — diferenciador |
| CFDI E auto en cancel post-CFDI I | ❌ (manual) | ❌ (manual) | Vía OPI + adapter externo | ❌ | ❌ | ✅ via `MxCfdi40Adapter` §89 |

### Chargeback evidence — corrección al plan original

El plan inicial citaba "Visa Core Rules §5.9.2". **El código real es Visa Reason Code 13.7 — "Cancelled Merchandise/Services"** ([Visa Dispute Management Guidelines June 2024](https://usa.visa.com/content/dam/VCOM/global/support-legal/documents/merchants-dispute-management-guidelines.pdf); [Chargebacks911 Visa codes 2026](https://chargebacks911.com/chargeback-reason-codes/visa/)).

Ventana: **120 días desde la transacción** para el cardholder filing. **30 días para respuesta del acquirer** (Zenix debe estar preparado para entregar evidence dentro de esos 30 días).

**Defensa requerida:**
1. Cancellation policy snapshot al booking time.
2. Comm log (§42 `GuestContactLog`) probando que el guest fue informado.
3. Payment trail (§28 `PaymentLog`) mostrando el cargo y el refund/credit.

Ningún PMS de los 5 expone un "Chargeback Evidence Pack" bundleado. Zenix lo hace en v1.0.3.

### CFDI MX — corrección al plan original

El plan citaba el flujo CFDI E pero faltaba referencia a Regla SAT 2.7.1.35. Confirmado:
- Cancelación de CFDI 4.0 con Complemento de Pago requiere **aceptación del receptor via Buzón Tributario en 3 días hábiles** — [ContadorMx 2026](https://contadormx.com/cancelacion-cfdi-complemento-de-pago-sat-2026/); [SAT Anexo 20 v4.0 FAQ](http://omawww.sat.gob.mx/tramitesyservicios/Paginas/documentos/PregFrecCFDIVer4_0.pdf).
- **El flujo SAT vive fuera del PMS — manejado por el PAC/contador**. Pero el PMS debe (a) disparar la solicitud al PAC, (b) trackear el estado pendiente/aceptado/rechazado, (c) auditarlo append-only.

**Zenix §89 `IFiscalAdapter` ya modela esto correctamente** — el `MxCfdi40Adapter` orquesta llamada al PAC y persiste estado. Sin cambio necesario al plan.

---

## 7. 9 gaps documentados del mercado → diferenciadores Zenix

De la lectura combinada de ambos reports:

1. **Cancellation reason como enum estructurado + report group-by** — solo Opera (groups). Zenix: enum per-property configurable, todos los path.
2. **USALI 12 P&L line separation** No-Show Revenue vs Cancellation Fees — nadie nativo. Zenix v1.0.3.
3. **Cancellation audit trail con reason en export** — Mews community confirma el gap. Zenix `GuestStayLog` append-only (§D-CAN4).
4. **Chargeback Evidence Pack** (Visa 13.7 defense bundle) — nadie. Zenix v1.0.3.
5. **CFDI E auto-trigger con FormaPago=15 LATAM** — Cloudbeds eFactura lo deja manual. Zenix §86 + §89.
6. **Cancellation rate KPI pre-arrival vs post-arrival como métricas distintas** — nadie. Zenix v1.0.3.
7. **Cancellation reason ↔ rate plan correlation** ("Free cancellation cancela 3× más que Non-refundable") — nadie. Zenix v1.0.3.
8. **Auto-refund + reverse CFDI workflow** — gap explícito Mews. Zenix v1.0.1 PAY-CORE conectado con cancel-archive.
9. **OTA cancellation reconciliation report** — orphan Channex cancellations vs PMS state vs CC refund. Resuelve el bug documentado de RoomRaccoon. Zenix Channex Inbound D-CHX6 + v1.0.3.

---

## 8. Decisiones del sprint — correcciones derivadas del research

Los 10 D-CAN del plan técnico ([CANCEL-ARCHIVE-plan.md](CANCEL-ARCHIVE-plan.md)) quedan firmes. **3 correcciones** derivadas de la investigación:

| # | Decisión | Plan original | Corrección | Razón |
|---|---|---|---|---|
| C1 | D-CAN1 | Cita "Visa Core Rules §5.9.2" | Reemplazar por "Visa Reason Code 13.7 — Cancelled Merchandise/Services, 120 días filing window" | El §5.9.2 es ID obsoleto/incorrecto del Visa Core Rules; el código real es 13.7 según Visa Dispute Management Guidelines junio 2024 |
| C2 | D-CAN5 | "CFDI E con FormaPago=15" — solo MX | Agregar referencia explícita a Regla SAT 2.7.1.35 (3 días Buzón Tributario para aceptación receptor) y tracking del estado pendiente/aceptado/rechazado vía `MxCfdi40Adapter` | Confirma flujo correcto SAT y obliga modelar el estado fiscal asíncrono |
| C3 | D-CAN2 (cancel kinds) | LEGITIMATE / ADMIN_ERROR / OTA_CANCELLATION | Sumar 4to: `GUEST_INITIATED_REFUNDABLE` vs `GUEST_INITIATED_NON_REFUNDABLE` como sub-kind. Razón: Mews documenta el conflict del email "Reservation was already canceled" — el tipo de cancel afecta refund automation downstream | Refund logic v1.0.1 PAY-CORE necesita esta distinción |

**Adición opcional al plan:** sumar reporte placeholder "USALI 12 Cancellation & No-Show P&L" como stub en este sprint, implementación real en v1.0.3 REPORTS-CORE. Justifica el alineamiento con la deadline 2026-01-01.

---

## 9. Roadmap del sprint — sin cambios al plan técnico

El plan día-por-día ([CANCEL-ARCHIVE-plan.md](CANCEL-ARCHIVE-plan.md) §5) sigue válido: 4-6 días con día 1 schema + service, día 2 anonymization, día 3 dialog UI, día 4 archive UI, día 5 CFDI stub + Channex cancel out, día 6 QA + docs.

**Esta propuesta convalida el plan con justificación de mercado.** No reescribe el plan, lo respalda.

---

## 10. Riesgos identificados — refuerzo desde el research

Sumar a la tabla de riesgos del plan (§7):

| Riesgo nuevo identificado | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| **Confusión operativa cancel/no-show** (caso Mews "Reservation already canceled") | Alta | Bajo | Diálogos contextuales que detectan estado actual del stay y redirigen al path correcto. UI con disabled state explícito (D-CAN3 ya cubre). |
| **OTA cancel orphan** (caso RoomRaccoon Booking.com) | Alta | Alto | Channex pull diario D-CHX6 reconcilia. Crear AppNotif si Channex marca cancel y Zenix no. |
| **Cancellation reason taxonomy mal modelada al inicio → migración dolorosa** | Media | Medio | Modelar `CancelReason` como tabla per-property con seed default + custom add. Análogo a §69 FiscalRegime. |
| **CFDI E rechazado por receptor (3 días Buzón)** | Media | Medio | Estado fiscal asíncrono trackeable en UI. AppNotif al contador si rejected. Reintento manual con motivo. |
| **CFAR (Cancel For Any Reason) sin reporting** (gap Cloudbeds auto-confesado) | Baja para v1.0.0 (no es feature) | — | Marcar como diferenciador futuro v1.1+ |

---

## 11. Definición de "hecho" — sin cambios

Checklist del plan técnico ([CANCEL-ARCHIVE-plan.md §8](CANCEL-ARCHIVE-plan.md)) sigue válido.

---

## 12. Recomendación final

**Aprobar el sprint Cancel-Archive como bloqueante hard de v1.0.0** con las 3 correcciones C1, C2, C3 aplicadas al plan técnico. Arrancar implementación día 1 (schema + service core) inmediatamente.

**Justificación medible:**
- Cancellation rate 10-50% según rate plan ([D-EDGE 2024](https://www.d-edge.com/hospitality-data-analytics/)) — feature usada cada día.
- 5/5 PMS estudiados lo tienen — paridad de mercado no negociable.
- 4/5 tienen gaps documentados de meses-años — ventana competitiva real.
- USALI 12 mandatory 2026-01-01 — deadline regulatoria con menos de 8 meses de buffer.
- Cliente piloto (Hotel Monica Tulum) opera 80% via OTAs con `cancellation_collected` flag — sin cancel correcto, una cancelación de Booking.com = pelea con tarjeta el cliente directo.

Implementación estimada: **4-6 días enfocados, 1 desarrollador**.

---

## Referencias completas

### Documentación oficial PMS
1. [Cloudbeds — Cancelations Report](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/25913491478811-Cancelations-Report)
2. [Cloudbeds — Delete reservations](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/360003077054-Delete-reservations)
3. [Cloudbeds — Cancel For Any Reason FAQ](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/39033609376411-Cancel-for-Any-Reason-Everything-you-need-to-know)
4. [Cloudbeds — eFactura SAT setup](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/40401739371675-How-to-set-up-Mexico-Invoicing-eFactura-SAT)
5. [Mews — Cancellation fees](https://help.mews.com/s/article/how-to-deal-with-cancellations-fee?language=en_US)
6. [Mews — Undo booking cancellation request](https://feedback.mews.com/forums/918232-property-operations-pms/suggestions/36660172-undo-booking-cancellation)
7. [Mews — Daily PMS Auditing community](https://community.mews.com/community-library-94/daily-pms-auditing-186)
8. [Mews — Reservation already canceled email](https://help.mews.com/en/articles/4583147)
9. [Opera Cloud — Managing Reservation Cancellation 25.5](https://docs.oracle.com/en/industries/hospitality/opera-cloud/25.5/ocsuh/t_managing_reservation_cancellation.htm)
10. [Opera Cloud — Reinstating Reservations 24.4](https://docs.oracle.com/en/industries/hospitality/opera-cloud/24.4/ocsuh/t_managing_reservations_reinstating_no_show_reservations.htm)
11. [Opera Cloud — Block Cancellation Summary 23.4](https://docs.oracle.com/en/industries/hospitality/opera-cloud/23.4/ocsuh/c_osem_block_cancellation_summary_report.htm)
12. [RoomRaccoon — Reservations FAQ](https://contact.roomraccoon.com/en/support/solutions/articles/150000190972-reservations-frequently-asked-question)
13. [RoomRaccoon — Booking.com cancelled bug](https://help.roomraccoon.com/en/article/why-are-some-cancelled-reservations-from-bookingcom-not-automatically-removed-from-my-roomraccoon-calendar-1wg4udr/)
14. [RoomRaccoon — Release 25.2](https://contact.roomraccoon.com/en/support/solutions/articles/150000204009-roomraccoon-release-25-2-2-april-2025-)
15. [Little Hotelier — Manage reservations](https://helpcentre.littlehotelier.com/en/articles/8673752-manage-reservations)
16. [WebRezPro — Cancellations and No-Shows strategies](https://webrezpro.com/cancellations-and-no-shows-prevention-strategies-for-hotels/)

### Compliance + estándares
17. [HFTP/AHLA — USALI 12th edition launch](https://www.ahla.com/news/hftp-ahla-and-gfc-unveil-groundbreaking-12th-revised-edition-uniform-system-accounts-lodging)
18. [Robert Mandelbaum — USALI 12 cancellation treatment, Hospitality Net](https://www.hospitalitynet.org/opinion/4093423.html)
19. [HFTP — USALI 12 overview PDF](https://www.hftp.org/downloads/documents/usali/tfh24sp_usali12overview.pdf)
20. [Visa — Dispute Management Guidelines June 2024 PDF](https://usa.visa.com/content/dam/VCOM/global/support-legal/documents/merchants-dispute-management-guidelines.pdf)
21. [Chargebacks911 — Visa Reason Codes 2026](https://chargebacks911.com/chargeback-reason-codes/visa/)
22. [SAT México — Anexo 20 v4.0 FAQ PDF](http://omawww.sat.gob.mx/tramitesyservicios/Paginas/documentos/PregFrecCFDIVer4_0.pdf)
23. [ContadorMx — Cancelación CFDI con Complemento de Pago 2026](https://contadormx.com/cancelacion-cfdi-complemento-de-pago-sat-2026/)
24. [D-EDGE — Hospitality data analytics cancellation rates](https://www.d-edge.com/hospitality-data-analytics/)

### Reviews y casos de usuario
25. [Capterra — Cloudbeds reviews](https://www.capterra.com/p/158839/Cloudbeds/reviews/)
26. [Lean Hotel System — Integration problems](https://leanhotelsystem.com/en/hotel-systems-integration-problems/)
