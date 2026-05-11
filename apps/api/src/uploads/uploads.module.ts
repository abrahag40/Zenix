import { Module } from '@nestjs/common'
import { UploadsController } from './uploads.controller'
import { UploadsService } from './uploads.service'

/**
 * UploadsModule — infraestructura mínima de upload de imágenes (Sprint Mx-1B-W2).
 *
 * No depende de ningún módulo de dominio (mantenimiento, readiness, etc).
 * Cualquier módulo que necesite subir imágenes consume el endpoint
 * `POST /api/v1/uploads` desde el cliente; el servidor NO tiene wiring directo
 * — la `url` resultante se persiste en el modelo de dominio correspondiente
 * (ej. `MaintenanceTicketPhoto.url`).
 *
 * Mx-1C: este módulo se reescribe para S3 + lifecycle (Glacier 365d).
 * Los consumidores no necesitan cambios porque la interfaz `{ id, url }`
 * permanece igual.
 */
@Module({
  controllers: [UploadsController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
