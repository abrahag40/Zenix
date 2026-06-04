import { Module } from '@nestjs/common'
import { CompsetService } from './compset.service'
import { CompsetController } from './compset.controller'
import { StubCompsetAdapter } from './stub-compset.adapter'
import { CompsetRefreshScheduler } from './compset-refresh.scheduler'

/**
 * CompsetModule — Fase 3 RATES-METRICS-COMPSET.
 * Chunk 1: schema + service + stub adapter + endpoints.
 * Chunk 2: scheduler diario (usa stub hoy, swap a Playwright en chunk 3).
 */
@Module({
  providers: [CompsetService, StubCompsetAdapter, CompsetRefreshScheduler],
  controllers: [CompsetController],
  exports: [CompsetService],
})
export class CompsetModule {}
