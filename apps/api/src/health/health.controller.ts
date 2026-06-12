import { Controller, Get } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { Public } from '../common/decorators/public.decorator'

/**
 * HealthController — liveness para Render health-check + keep-alive pinger.
 *
 * En free tier el servicio duerme tras ~15min sin tráfico → los crons
 * (night audit, schedulers) NO corren dormido. Un pinger externo gratuito
 * (cron-job.org / UptimeRobot) golpea `/api/health` cada ~10min y lo mantiene
 * despierto 24/7. Público + sin DB (responde aunque la BD esté lenta).
 */
@ApiExcludeController()
@Controller('health')
@Public()
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', service: 'zenix-api', ts: new Date().toISOString() }
  }
}
