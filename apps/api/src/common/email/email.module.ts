import { Module, Global } from '@nestjs/common'
import { EmailService } from './email.service'

/**
 * EmailModule — stub temporal.
 *
 * La versión original inyectaba `MailerModule` de `@nestjs-modules/mailer`.
 * Mientras la dependencia no esté instalada, este módulo solo expone el stub
 * de EmailService para que el resto del grafo compile.
 */
@Global()
@Module({
  providers: [EmailService],
  exports:   [EmailService],
})
export class EmailModule {}
