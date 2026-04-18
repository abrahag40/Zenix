import { Injectable, Logger } from '@nestjs/common'

/**
 * EmailService — stub temporal.
 *
 * El código original dependía de `@nestjs-modules/mailer` (no instalado en el
 * estado actual del monorepo). Para desbloquear la compilación y dejar el
 * calendario operativo, este stub loguea los envíos en lugar de despachar
 * correos. Cuando se instale `@nestjs-modules/mailer` y se configure SMTP,
 * restaurar la implementación original (ver git blame pre-stub).
 */

export interface CheckinConfirmationData {
  guestEmail:    string
  guestName:     string
  propertyName:  string
  roomNumber:    string
  checkIn:       Date
  checkOut:      Date
  nights:        number
  totalAmount:   number
  currency:      string
  pmsId:         string
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name)

  async sendCheckinConfirmation(data: CheckinConfirmationData): Promise<void> {
    this.logger.warn(
      `[STUB] sendCheckinConfirmation → ${data.guestEmail} (reserva ${data.pmsId}) — mailer no instalado`,
    )
  }

  async sendHousekeepingAlert(to: string, roomNumber: string): Promise<void> {
    this.logger.warn(`[STUB] sendHousekeepingAlert → ${to} (room ${roomNumber})`)
  }

  async sendMaintenanceAlert(to: string, ticketId: string): Promise<void> {
    this.logger.warn(`[STUB] sendMaintenanceAlert → ${to} (ticket ${ticketId})`)
  }
}
