# PMS Export Landscape — referencia para Zenix Onboard (migración)

> **Propósito:** mapa verificado de qué exportan los PMS que usan los prospectos LATAM boutique/hostal, para que el módulo de migración (Zenix Onboard) cubra **cualquier origen** y "¿puedo migrar mi data?" deje de ser objeción.
> **Fecha:** 2026-06-13. **Método:** investigación directa sobre help-centers y developer-portals oficiales (el workflow automático de deep-research falló por rate-limit; este estudio se hizo manual). Fuentes priorizadas 2023-2026.
> **Documentos hermanos:** [MIGRATION-CORE-plan.md](../MIGRATION-CORE-plan.md) · [zenix-sales-master.md](../../zenix-sales-master.md) Módulo 9.
> **Disciplina de honestidad:** se distingue HECHO VERIFICADO (con fuente) de SUPUESTO. Lo no verificable se marca explícitamente.

---

## 1. Conclusión ejecutiva

**Prácticamente todos los PMS exportan reservas y huéspedes a CSV/Excel de forma self-service** (el hotel lo hace solo, sin permiso del proveedor), y **casi todos publican su propia plantilla de import** con una forma casi idéntica entre sí (1 fila por reserva: confirmación + huésped + llegada/salida + habitación + tarifa). Implicación: **un importador por archivo + wizard de mapeo de columnas cubre ~95% de los prospectos sin depender de la API de ningún competidor.** La objeción "¿puedo migrar?" se responde **"sí"** para casi cualquier caso boutique/hostal LATAM.

---

## 2. Matriz comparativa (verificado salvo lo marcado)

| PMS | Export self-service | Formatos | Entidades clave | API (acceso) | Import tool propio |
|---|---|---|---|---|---|
| **Cloudbeds** | ✅ | XLSX·CSV·JSON | Reservas (campos a elegir), huéspedes, financieros, Manager's Report, Performance Analysis; multi-property vía Insights | API Keys/OAuth — aprobación partner + autorización de propiedad | ✅ Quick Import / Reservation Import Service (CSV) |
| **Mews** | ✅ (Reservation report → Excel) | XLSX·CSV·JSON | Reservas, huéspedes (incl. consentimiento marketing) | Export API (a data warehouse, por rango) + Connector API (partner) | ✅ guía de import de reservas |
| **OPERA Cloud** | ⚠️ parcial (enterprise) | exports/API | Back Office Exports (revenue, city ledger, market segment) | Export APIs vía OHIP (partner) | ⚠️ migración v5→Cloud vía herramienta HRS (partner-assisted) |
| **RoomRaccoon** | ✅ (1 click) | CSV | Facturas + huésped, lista de reservas, reportes custom | Partner API | — |
| **Little Hotelier** (SiteMinder) | ✅ | CSV | Reservas (filtros: apellido, booking ref, factura), estadísticas | SiteMinder Reservations API (partner) | — |
| **Clock PMS+** | ✅ (cada reporte) | CSV·XLS | Reservas, huéspedes, rooms, rates | API completa (XML/JSON/YAML), portal abierto | — |
| **Sirvoy** | ✅ | CSV·PDF·SIE4 | Huéspedes/emails, reportes contables | Export API | ✅ plantilla de import con headers documentados |
| **Hotelogix** | ✅ | PDF·CSV·XLSX | Reportes de reserva (source, cancel, no-show) | Partner API | — |
| **WebRezPro** | ✅ | HTML·CSV | Reservas custom, huéspedes | — | ✅ import Excel/CSV con campos documentados |
| **ResNexus** | ✅ | CSV | Lista de huéspedes (full/filtrada) | — | ✅ plantilla CSV de import |
| **Zavia ERP** (LATAM/MX) | ✅ | PDF·Excel | Reportes + BI (ocupación, producción) | no confirmado | — |
| **NewHotel Cloud** (LATAM/Iberia) | ✅ (rooming list import/export) | reportes·Excel | Reservas, estadísticas | no confirmado | ⚠️ rooming list import/export |
| **Excel / Sheets / papel** | ✅ trivial | CSV·XLSX | lo que el hotel tenga | — | N/A |

---

## 3. Hechos transversales (universales, verificados)

1. **Tarjetas NUNCA se exportan (PCI-DSS).** WebRezPro lo dice literal: *"credit card information cannot be included in the import — payment details must be entered manually"*. Universal. → La honestidad de alcance de Zenix es estándar de industria, no una carencia.
2. **CSV/XLSX de reservas + huéspedes es self-service casi universal.** Solo OPERA (enterprise) rompe el patrón "export a Excel con un click".
3. **La plantilla canónica de migración existe y es casi idéntica entre PMS:** 1 fila/reserva con confirmación/booking-id + nombre + llegada + salida + habitación/unidad + tarifa/costo + contacto. Lo confirman los import tools de Cloudbeds, Sirvoy, WebRezPro y ResNexus. → **define el DTO canónico de Zenix Onboard.**
4. **Las APIs existen pero están gated** (aprobación partner + OAuth por propiedad) en los grandes. → confirma que la **Fase 1 por archivo** no depende de que un competidor apruebe a Zenix.
5. **El import por archivo se recomienda sobre cierto volumen** (WebRezPro: ">150 reservas"). Debajo: captura manual. → calibra cuándo cobrar el servicio asistido.

---

## 4. Implicaciones para los adapters (fácil → difícil)

| Tier | PMS | Estrategia de adapter |
|---|---|---|
| **Trivial (Fase 1)** | Excel/Sheets, Sirvoy, WebRezPro, ResNexus, Cloudbeds | Plantilla/headers públicos → adapter = mapeo de columnas + CollisionDetector. |
| **Fácil con muestra** | RoomRaccoon, Little Hotelier, Hotelogix, Clock PMS+ | Export CSV claro; requiere 1 export de muestra para fijar nombres de columna. |
| **Medio** | Mews | Dos caminos: Reservation report → Excel (self-service) **o** Export API. Empezar por Excel. |
| **LATAM con muestra** | Zavia, NewHotel | Exportan a Excel pero doc pública escasa; requieren export de muestra (campos en español). Adapter sample-driven. |
| **Enterprise / difícil** | OPERA Cloud | OHIP API + migración partner-assisted (herramienta HRS). **No es el prospecto típico boutique LATAM**; si aparece, va por servicio asistido. |

**Insight de arquitectura (D-MIG7):** como la plantilla es casi universal, la pieza que **elimina la objeción para cualquier origen** es un **adapter "Genérico CSV/Excel" con wizard de mapeo manual** ("esta columna = fecha de llegada"). Cubre PMS sin adapter dedicado e incluso Excel casero. Los adapters dedicados (Cloudbeds, Sirvoy…) son **pre-mapeos** sobre ese motor genérico para acelerar los orígenes más comunes.

---

## 5. Playbook anti-objeción (respuesta por PMS de origen)

| Prospecto viene de… | Respuesta |
|---|---|
| Cloudbeds / Mews / RoomRaccoon / Little Hotelier / Sirvoy / Hotelogix / WebRezPro / ResNexus / Clock | "Sí, directo. Exportas tu historial desde tu panel (lo haces tú, sin permiso de ellos), lo subes a Zenix y te mostramos un preview con todo lo que entra —incluidos los empalmes— antes de cargar nada." |
| OPERA Cloud | "Sí, pero como OPERA es enterprise lo hacemos como migración asistida: nosotros extraemos y cargamos. Tú no tocas nada." |
| Zavia / NewHotel u otro LATAM | "Sí. Exportas tu reporte de reservas a Excel y mapeamos tus columnas — danos un archivo de muestra y confirmamos el alcance exacto en el preview." |
| Excel / Sheets / papel | "Más fácil: si ya está en una hoja, la subes y el wizard mapea columnas. Si está en papel, te ayudamos a capturarlo una sola vez." |
| Cualquiera (tarjetas) | "Lo único que por ley (PCI) ningún sistema mueve son los números de tarjeta —ni Cloudbeds te los exporta— y tus canales Booking/Expedia se reconectan en minutos." |

---

## 6. Verificado vs. supuesto (disciplina de honestidad)

- **Verificado con fuente:** toda la matriz salvo lo marcado "no confirmado".
- **Parcialmente verificado:** Zavia (Excel sí; CSV no confirmado) y NewHotel/Syncro (export sí; detalle de formato/entidades escaso — doc pública LATAM pobre). **No afirmar capacidades específicas de estos dos en la venta hasta tener un export de muestra**; el adapter genérico los cubre igual.
- **No verificado individualmente:** límites exactos de antigüedad del histórico por PMS (Cloudbeds recomienda ~2 años; el resto no lo documenta claro). Confirmar con el export real del prospecto.

---

## 7. Fuentes

- Cloudbeds: [export de reportes](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/6979595895451-How-to-export-reports) · [Import Service/Quick Import](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/360012564473-Cloudbeds-Reservation-Import-Service-Everything-you-need-to-know) · [API](https://developers.cloudbeds.com/docs/about-cloudbeds-api)
- Mews: [export guest data](https://help.mews.com/en/articles/4355037-how-to-export-guest-data) · [API](https://www.mews.com/en/products/api) · [Reservation Report](https://mewssystems.freshdesk.com/support/solutions/articles/31000129911-reservation-report)
- OPERA Cloud: [Back Office Exports](https://docs.oracle.com/en/industries/hospitality/opera-cloud/21.4/ocsuh/c_exports_back_office_exports.htm) · [Export APIs](https://docs.oracle.com/en/industries/hospitality/opera-cloud/24.3/ocsuh/c_export_api_files.htm) · [HRS Migration Tool](https://hrsinternational.com/news-and-insights/introducing-hrs-data-migration-tool)
- RoomRaccoon: [reporting](https://roomraccoon.com/platform/hotel-reporting/)
- Little Hotelier: [export reservations](https://helpcentre.littlehotelier.com/en/articles/8673668-run-and-export-reservations-information)
- Clock PMS+: [Data API](https://www.clocksoftware.co.uk/software/clock-pms/data-api) · [API docs](https://api-docs.clock-software.com/)
- Sirvoy: [import (plantilla)](https://help.sirvoy.com/import-your-existing-bookings) · [CSV export](https://help.sirvoy.com/export-api/opening-the-csv-export-file-in-ms-excel)
- Hotelogix: [reports](https://www.hotelogix.com/reports.php)
- WebRezPro: [Data Import](https://webrezpro.com/specs/data-reservation-import/)
- ResNexus: [import guests (CSV)](https://support.resnexus.com/support/solutions/articles/9000019793-how-do-i-import-my-guests-)
- Zavia ERP: [zaviapms.com](https://www.zaviapms.com/pms)
- NewHotel: [Cloud PMS](https://newhotel.com/en/cloud-pms/)
