# Runbook — Migración asistida (white-glove) · Zenix Onboard

> Servicio de cierre que ofrece ZaharDev: **nosotros migramos**, el cliente no toca
> nada. Mismo motor que el self-service (MIGRATION-CORE), operado por un consultor.
> Objetivo: cero overbooking el día 1, cero pérdida de historial, cutover sin downtime.
>
> Plan técnico: [docs/sprints/MIGRATION-CORE-plan.md](../sprints/MIGRATION-CORE-plan.md) ·
> Diccionario de la plantilla: [docs/sprints/migration/zenix-import-template.md](../sprints/migration/zenix-import-template.md)

## Quién y cuándo

- **Quién:** consultor ZaharDev (Nova tier PLATFORM/PARTNER) con el cliente seleccionado en `/nova/clientes`.
- **Cuándo:** después de crear la organización en el wizard (Zenix Activate) y ANTES de poner el hotel a recibir reservas en Zenix.

## Pre-checks (antes de tocar el PMS de origen)

1. **Inventario en Zenix listo:** propiedades + room types + habitaciones creadas y con números/nombres consistentes (el matching de habitaciones depende de esto). Hostal: camas creadas.
2. **Acceso al PMS de origen** confirmado (el cliente exporta, o nos da acceso de solo-lectura).
3. **Alcance acordado por escrito** (qué migra / qué no):
   - ✅ Reservas + huéspedes (+ inventario/contabilidad histórica en fases siguientes).
   - ❌ Datos de tarjeta (PCI — ningún PMS los exporta).
   - ❌ Conexiones OTA en vivo → se reconectan vía Channex tras el cutover.
   - ❌ Métricas pace/STLY → no son reconstruibles; se acumulan desde el día 1 en Zenix.
4. **Moneda base** de la LegalEntity correcta (rellena las reservas sin moneda explícita).

## Estrategia de cutover (sin downtime, sin doble-reserva)

1. **Parallel-run / carga histórica:** exporta el histórico + futuro del PMS origen y cárgalo en Zenix mientras el origen sigue operando. Esto valida el mapeo y el inventario sin presión.
2. **Fecha de congelamiento (freeze):** acuerda con el cliente una hora de corte. A partir de ahí **no se crean reservas nuevas en el PMS origen** (se pausan canales o se opera solo en Zenix).
3. **Import del delta final:** vuelve a exportar del origen y carga **solo lo nuevo** desde el último export. La idempotencia (`UNIQUE (migrationJobId, migrationSourceId)`) hace que re-importar lo ya cargado NO duplique — pero usa un job nuevo para el delta.
4. **Reconectar OTAs vía Channex** (Booking/Expedia/Airbnb) → Zenix pasa a ser la fuente de verdad de disponibilidad.
5. **Sign-off:** revisa el reporte de migración con el cliente (cargadas / omitidas / fallidas) y archívalo como evidencia del handover.

## Procedimiento paso a paso (en Nova → Migración)

1. **Elige el origen:**
   - **Plantilla Zenix** (recomendado): el cliente exporta y rellena `zenix-import-template.csv` (botón "Descargar plantilla"). Sin mapeo.
   - **Adapter dedicado** (Cloudbeds, Mews): sube el export tal cual; el pre-mapeo se aplica solo.
   - **CSV genérico**: cualquier export; el **wizard de mapeo** te deja decir "esta columna = fecha de llegada". Auto-detecta delimitador (`,`/`;`/tab — el `;` es típico de Excel es-MX).
2. **Sube el archivo** → Zenix lo parsea a un área temporal (staging, no toca producción).
3. **(Genérico) Mapea las columnas** → al menos `sourceId`, `checkIn`, `checkOut`. Revisa la vista previa.
4. **Preview / dry-run:** revisa el resumen — OK, avisos, **empalmes** (dos reservas misma habitación/cama mismas fechas) y errores.
5. **Resuelve los conflictos por fila:** *omitir* / *aceptar empalme histórico* (con razón, queda en audit) / *reasignar habitación*.
6. **Gate:** no se puede importar mientras queden conflictos bloqueantes (errores) sin resolver.
7. **Importar a producción:** crea las reservas reales (`source='MIGRATED'`), idempotente. Tolerancia por fila: una fila mala no aborta el lote (termina `COMPLETED` o `PARTIAL`).
8. **Descarga el reporte** (botón "Ver reporte") y compártelo con el cliente para el sign-off.

## Rollback / recuperación

- Antes del load nada toca producción → "Descartar" borra el staging en cascada, sin rastro.
- Si el load queda `PARTIAL`, corrige las filas fallidas (reasigna habitación / arregla fechas en el archivo) y **re-importa**: las ya cargadas se cuentan como "ya existían" (idempotencia), solo entran las nuevas.
- Las reservas migradas tienen `source='MIGRATED'` + `migrationJobId` → son identificables y reversibles si hubo un error masivo (operación de BD asistida por ingeniería, no auto-servicio).

## Checklist de sign-off

- [ ] Conteo de reservas Zenix ≈ conteo del origen (menos canceladas/no-shows si se excluyeron).
- [ ] Reporte de migración descargado y archivado.
- [ ] Empalmes revisados con el cliente (cuáles eran reales).
- [ ] OTAs reconectadas vía Channex; disponibilidad cuadra.
- [ ] Cliente confirma que ve su historial en el calendario.
