import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { DLCService } from './dlc.service'

/**
 * DLCArchiveScheduler — cron diario que archiva DLCs con grace period vencido.
 *
 * Lifecycle (§139, §140):
 *   - Día 0: cliente cancela → SUSPENDED + gracePeriodEndsAt = now + 30d
 *   - Día 1-30: SUSPENDED, data preservada, endpoints 402, "Reactivar" disponible
 *   - Día 31: scheduler corre 4am → ARCHIVED
 *   - Día 31-1825 (5 años): ARCHIVED, data preservada en BD, reactivación posible
 *   - Día 1826+: PurgeScheduler (futuro, no implementado en Fase 1) puede hard-delete
 *
 * Idempotente: si corre 2x el mismo día, segundo run no encuentra nada.
 * Fail-soft: si BD cae, el scheduler retorna 0 y log warning (no crash).
 */
@Injectable()
export class DLCArchiveScheduler {
  private readonly logger = new Logger(DLCArchiveScheduler.name)

  constructor(private readonly dlcService: DLCService) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM, { name: 'dlc-archive', timeZone: 'America/Mexico_City' })
  async run() {
    try {
      const archived = await this.dlcService.archiveExpiredGracePeriods()
      if (archived > 0) {
        this.logger.log(`DLCArchiveScheduler: ${archived} DLCs auto-archivados`)
      }
    } catch (err) {
      this.logger.error(`DLCArchiveScheduler failed: ${(err as Error).message}`, (err as Error).stack)
    }
  }
}
