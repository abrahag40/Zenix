import { Test } from '@nestjs/testing'
import { ConfigModule } from '@nestjs/config'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ScheduleModule } from '@nestjs/schedule'
import { ThrottlerModule } from '@nestjs/throttler'
import { ClsModule } from 'nestjs-cls'
import { RatesController } from './rates.controller'
import { RatesModule } from './rates.module'
import { PrismaModule } from '../../prisma/prisma.module'
import { AvailabilityModule } from '../availability/availability.module'
import { ChannexModule } from '../../integrations/channex/channex.module'
import { AccessControlModule } from '../../common/access-control/access-control.module'
import { AuditModule } from '../../common/audit/audit.module'
import { EmailModule } from '../../common/email/email.module'
import { PrismaService } from '../../prisma/prisma.service'
import { PoliticaDePublicacionService } from '../../public-booking/politica-de-publicacion.service'

/**
 * Prueba de ARRANQUE, no de lógica.
 *
 * `RatesModule` pasó a importar `PublicBookingModule` para reusar el control de
 * publicación en vez de copiarlo. Un error de cableado ahí NO lo ve `tsc`: los
 * tipos compilan y la aplicación revienta al arrancar, en producción, con un
 * «Nest can't resolve dependencies». Esta prueba lo convierte en fallo de CI.
 */
describe('RatesModule — cableado', () => {
  it('resuelve RatesController con el control de publicación inyectado', async () => {
    const mod = await Test.createTestingModule({
      // Se montan sólo los módulos de infraestructura global que la app trae
      // en `AppModule`; lo demás se resuelve por el grafo real del módulo, que
      // es justo lo que queremos comprobar.
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        EventEmitterModule.forRoot(),
        ScheduleModule.forRoot(),
        ClsModule.forRoot({ global: true }),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
        // Los seis módulos `@Global()` que `AppModule` monta una vez y todo
        // el grafo consume. Montarlos aquí es replicar la app, no simularla.
        PrismaModule,
        AvailabilityModule,
        ChannexModule,
        AccessControlModule,
        AuditModule,
        EmailModule,
        RatesModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile()

    const controller = mod.get(RatesController)
    expect(controller).toBeDefined()
    expect(mod.get(PoliticaDePublicacionService)).toBeInstanceOf(PoliticaDePublicacionService)
    await mod.close()
  })
})
