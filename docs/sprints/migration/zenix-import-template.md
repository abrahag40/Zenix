# Plantilla de importación Zenix (CSV) — diccionario de datos

> Patrón SuccessFactors: el consultor **exporta** las reservas del PMS actual del
> cliente, **pega** los datos en esta plantilla (Excel → *Guardar como CSV*) y la
> **sube** en Nova → Migración. Como los encabezados ya son los campos canónicos
> de Zenix, **no hay que mapear columnas**.
>
> Fuente de verdad de las columnas: [`zenix-template.adapter.ts`](../../../apps/api/src/migration/adapters/zenix-template.adapter.ts)
> (`TEMPLATE_FIELDS`). Descarga la plantilla viva desde el botón **"Descargar plantilla"**
> de la pantalla (endpoint `GET /v1/nova/migration/template`) — este doc solo explica las columnas.

## Reglas generales

- **Formato:** CSV UTF-8. Una fila por reserva. La primera fila son los encabezados (no la borres).
- **Fechas:** ISO `YYYY-MM-DD` (ej. `2026-07-15`). La salida debe ser posterior a la entrada.
- **Montos:** número sin símbolo de moneda (`1200`, no `$1,200`).
- **Tarjetas:** **nunca** se migran datos de tarjeta (PAN/CVV) — restricción PCI, ningún PMS los exporta.
- **Borra las filas de ejemplo** antes de subir.

## Columnas

| Columna | Obligatoria | Formato / valores | Notas |
|---|---|---|---|
| `sourceId` | **Sí** | texto | ID de la reserva en el PMS de origen. Clave de idempotencia: re-subir no duplica. |
| `guestName` | **Sí*** | texto | Nombre completo. *Obligatoria si no usas `guestFirstName`/`guestLastName`. |
| `guestFirstName` | No | texto | Nombre(s). |
| `guestLastName` | No | texto | Apellido(s). |
| `guestEmail` | No | email | |
| `guestPhone` | No | texto | Con o sin guiones/espacios. |
| `guestCountry` | No | texto / ISO | País o nacionalidad. |
| `guestDocument` | No | texto | Documento de identidad (sin tarjeta). |
| `checkIn` | **Sí** | `YYYY-MM-DD` | Entrada. |
| `checkOut` | **Sí** | `YYYY-MM-DD` | Salida (posterior a la entrada). |
| `roomLabel` | No | texto | Número/nombre de la habitación o cama (ej. `201`, `Dorm A - Cama 3`). Si no empareja con una habitación de Zenix, se resuelve en el preview (REASSIGN). |
| `roomTypeLabel` | No | texto | Tipo del origen (ej. Estándar, Suite, Dorm 6). |
| `ratePerNight` | No | número | Tarifa por noche. |
| `totalAmount` | No | número | Importe total de la estadía. |
| `amountPaid` | No | número | Monto ya pagado. |
| `currency` | No | ISO 4217 | `MXN`, `USD`, `EUR`. Si falta, usa la moneda base del hotel. |
| `status` | No | enum | `ARRIVING` · `IN_HOUSE` · `CHECKED_OUT` · `NO_SHOW` · `CANCELLED`. También acepta términos del origen (confirmed, checked out, no show…). Default `ARRIVING`. |
| `sourceChannel` | No | texto | Canal de la reserva (Booking.com, Directo, Walk-in…). |
| `otaReservationCode` | No | texto | Código de reserva de la OTA, si aplica. |
| `adults` | No | entero | |
| `children` | No | entero | |
| `notes` | No | texto | Notas/comentarios. |

## Qué pasa después de subir

1. **Preview (dry-run):** Zenix valida sin tocar producción y muestra reservas OK, avisos, **empalmes** (dos reservas en la misma habitación/cama, mismas fechas) y errores.
2. **Resolución:** por fila puedes *omitir*, *aceptar* (empalme histórico real, con razón) o *reasignar* habitación.
3. **Gate:** no se puede importar mientras queden conflictos bloqueantes (errores) sin resolver.
4. **Importar:** crea las reservas reales (`source='MIGRATED'`) de forma idempotente. Re-importar el mismo archivo no duplica.
5. **Reporte:** al terminar, descarga el reporte (cargadas / omitidas / fallidas con su razón).

## Alcance honesto

Se migra: reservas + huéspedes (+ inventario y contabilidad histórica en fases siguientes).
**No** se migra: datos de tarjeta (PCI), conexiones OTA en vivo (se reconectan vía Channex),
ni métricas de pace/STLY (no son reconstruibles retroactivamente — se acumulan desde el día 1 en Zenix).
