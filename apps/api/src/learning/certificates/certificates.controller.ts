import { Controller, Get, Param } from '@nestjs/common'
import { Public } from '../../common/decorators/public.decorator'
import { CertificatesService } from './certificates.service'

/**
 * CertificatesController — verificación pública del certificado.
 *
 * §131 (reservado): el endpoint de verificación NO requiere auth.
 * Auditor STPS valida con QR sin credenciales del cliente.
 */
@Controller()
export class CertificatesController {
  constructor(private readonly service: CertificatesService) {}

  @Public()
  @Get('v1/learning/certificates/:serialNumber')
  verify(@Param('serialNumber') serialNumber: string) {
    return this.service.verifyBySerial(serialNumber)
  }
}
