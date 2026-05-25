/**
 * MxSwSapienAdapter — adapter PAC México vía SW Sapien (Day 19).
 *
 * Backup adapter de Facturama. SW Sapien tiene mejor SLA enterprise pero
 * pricing más alto. Útil cuando el cliente ya tenía SW Sapien contratado
 * antes de Zenix (migration friendly).
 *
 * Day 19 scope: STUB-shaped. Real wiring queda para v1.0.2 CFDI-CORE
 * cuando un cliente real lo solicite (Facturama es el default Zenix).
 *
 * Sandbox: https://services.test.sw.com.mx
 * Auth: Bearer token (no Basic auth como Facturama).
 */
import { Injectable } from '@nestjs/common'
import type {
  IPacAdapter,
  PacAdapterMetadata,
  PacCredentials,
  PacHealthCheckResult,
} from './pac-adapter.interface'

@Injectable()
export class MxSwSapienAdapter implements IPacAdapter {
  metadata(): PacAdapterMetadata {
    return {
      id: 'MX_SW_SAPIEN',
      countryCode: 'MX',
      displayName: 'SW Sapien (México, CFDI 4.0)',
      providerHomepage: 'https://sw.com.mx',
      implementationStatus: 'STUB', // Day 19 — real wiring v1.0.2 CFDI-CORE
    }
  }

  async healthCheck(credentials: PacCredentials | null): Promise<PacHealthCheckResult> {
    const start = Date.now()
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 700))
    const latencyMs = Date.now() - start

    if (!credentials || !credentials.configured) {
      return {
        status: 'warning',
        message:
          'SW Sapien no contratado todavía. El cliente puede activar y operar sin emitir CFDI. ' +
          'Cuando contrates SW Sapien, agrega el bearer token en /nova/settings/legal-entities. ' +
          '(Adapter en modo STUB — real wiring en v1.0.2 CFDI-CORE.)',
        latencyMs,
        detail: { stub: true, allowOverride: true },
      }
    }

    // Day 19 stub: si credentials configured, respondemos success deterministico.
    // Real call llega en v1.0.2 cuando el wizard requiera CFDI emission stamping.
    return {
      status: 'success',
      message: 'SW Sapien credenciales aceptadas (stub Day 19 — real wiring v1.0.2 CFDI-CORE).',
      latencyMs,
      detail: { stub: true },
    }
  }
}
