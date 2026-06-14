# Cloudbeds export schema → mapeo al DTO canónico de Zenix Onboard

> **⚠️ `ASSUMED` (Sprint 0).** Este schema se construyó a partir de la **documentación oficial pública** de Cloudbeds (help-center + import templates), **no de un export real** (el prospecto no pudo compartirlo). Los nombres de columna y formatos son fieles a la doc, pero pueden variar por versión/locale de la cuenta. **Se reemplaza por el formato real** cuando consigamos (a) un export de un trial de Cloudbeds o (b) el archivo real del prospecto (Sprint 6 / piloto). Ver estrategia en [pms-export-landscape.md](pms-export-landscape.md) y el plan [MIGRATION-CORE-plan.md](../MIGRATION-CORE-plan.md).
>
> **Muestra sintética:** [samples/cloudbeds-sample.csv](samples/cloudbeds-sample.csv) — 15 filas con casos borde deliberados para los tests del adapter + CollisionDetector.

---

## 1. Columnas del export de reservas (Reservations export de Cloudbeds)

| Columna (origen) | Tipo | Ejemplo | → Campo canónico (`MigrationReservationDto`) | Notas |
|---|---|---|---|---|
| `Reservation ID` | string | `CB-100001` | `sourceId` | Clave de idempotencia + trazabilidad. |
| `Status` | string | `Checked Out` | `status` | Mapear: Confirmed→ARRIVING, Checked In→IN_HOUSE, Checked Out→CHECKED_OUT, No Show→NO_SHOW, Cancelled→CANCELLED. |
| `Guest First Name` | string | `María` | `guestFirstName` | UTF-8 con acentos (verificar encoding del archivo). |
| `Guest Last Name` | string | `Hernández` | `guestLastName` | `guestName` = first + " " + last. |
| `Email` | string? | `maria.h@example.com` | `guestEmail` | Clave primaria de dedup de huéspedes. |
| `Phone` | string? | `+52 998 123 4567` | `guestPhone` | Formatos heterogéneos (con/sin +, espacios) — normalizar. |
| `Country` | string? | `MX` | `guestCountry` | ISO-2 en la muestra; puede venir nombre completo. |
| `Check-in` | date | `01/02/2026` | `checkIn` | **`DD/MM/YYYY` en la muestra** (locale-dependent en Cloudbeds) → normalizar a ISO. |
| `Check-out` | date | `04/02/2026` | `checkOut` | Idem. |
| `Room Name` | string? | `101` / `Dorm A - Bed 1` | `roomLabel` | Para dorms trae la cama → mapear a bed-level. Puede venir vacío (sin asignar). |
| `Room Type` | string | `Standard Queen` | `roomTypeLabel` | Match contra RoomType de la property. |
| `Rate Plan` | string? | `BAR` | (metadata) | No hay rate plans en v1.0.0 — informativo. |
| `Source` | string? | `Booking.com` | `sourceChannel` | Normalizar con el resolver de OTA (timeline.constants). |
| `Adults` | int | `2` | `adults` | |
| `Children` | int | `0` | `children` | |
| `Total` | decimal | `3600.00` | `totalAmount` | **Puede venir negativo** (dato sucio) → conflicto `NEGATIVE_AMOUNT`. |
| `Balance` | decimal | `1200.00` | (deriva `amountPaid` = Total − Balance) | |
| `Currency` | string | `MXN` | `currency` | Si falta → moneda base de la LegalEntity. |
| `OTA Reference` | string? | `BDC-44821` | `otaReservationCode` | El código que ve el huésped (Booking/Expedia). Vacío en directas. |

---

## 2. Casos borde sembrados en la muestra (para los tests)

| Fila | Caso | Qué debe pasar |
|---|---|---|
| CB-100001 / 100008 | **Huésped duplicado** (mismo email, 2 reservas) | Dedup → 1 perfil, 2 reservas. Conflicto `DUP_GUEST` (WARN). |
| CB-100003 / 100009 | **Empalme misma habitación** (103, 20-22 jun vs 20-23 jun) | ★ Conflicto `ROOM_OVERLAP` (ERROR). |
| CB-100006 / 100007 | **Dos camas distintas mismo dorm** (Bed 1 vs Bed 2, mismas fechas) | NO es empalme — ambas migran. |
| CB-100006 / 100011 | **Misma cama, fechas distintas** (Dorm A Bed 1, mar vs ene) | NO es empalme (no solapan). |
| CB-100010 | **Habitación vacía** (`Room Name` en blanco) | Conflicto `NO_ROOM_MATCH` → el consultor reasigna en el preview. |
| CB-100013 | **Fecha inválida** (checkout 08/07 < checkin 10/07) | Conflicto `BAD_DATE` (ERROR), fila no cargable. |
| CB-100014 | **Monto negativo** (`Total` = -500) | Conflicto `NEGATIVE_AMOUNT` (WARN/ERROR según política). |
| CB-100015 | **Acentos + nombre compuesto** (`José Ángel Núñez Peña`) | Encoding correcto, sin mojibake. |
| CB-100001 | **Fecha `DD/MM/YYYY`** | Normalizar a ISO correctamente (no confundir día/mes). |
| CB-100005 | **Cancelada** | Migra como histórico pero NO genera empalme contra otras. |

---

## 3. Qué NO viene en el export (límites verificados)

- **Datos de tarjeta / PAN** — nunca (PCI-DSS, universal). El balance/pagos migran como montos, no como instrumentos de pago.
- **Conexiones OTA en vivo** — no se migran; se re-conectan vía Channex. El `OTA Reference` histórico sí migra.
- **Métricas calculadas** (pace/pickup/STLY) — no exportables; arrancan desde la migración.

---

## 4. Pre-mapeo del `CloudbedsAdapter` (Sprint 1)

El `CloudbedsAdapter` define este `columnMapping` para que el consultor **no mapee a mano** cuando el origen es Cloudbeds:

```
reservation: {
  sourceId: 'Reservation ID', status: 'Status',
  guestFirstName: 'Guest First Name', guestLastName: 'Guest Last Name',
  guestEmail: 'Email', guestPhone: 'Phone', guestCountry: 'Country',
  checkIn: 'Check-in', checkOut: 'Check-out',
  roomLabel: 'Room Name', roomTypeLabel: 'Room Type',
  adults: 'Adults', children: 'Children',
  totalAmount: 'Total', currency: 'Currency',
  sourceChannel: 'Source', otaReservationCode: 'OTA Reference',
},
dateFormat: 'DD/MM/YYYY',
```

Si el export real difiere (nombres de columna distintos por versión/locale), basta ajustar este mapeo — el motor genérico (`GenericCsvAdapter`) ya soporta cualquier header vía el wizard.
