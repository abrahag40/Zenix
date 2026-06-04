import { Module } from '@nestjs/common'
import { CompsetService } from './compset.service'
import { CompsetController } from './compset.controller'
import { StubCompsetAdapter } from './stub-compset.adapter'

/**
 * CompsetModule — Fase 3 RATES-METRICS-COMPSET (chunk 1).
 * PrismaService es global. Chunk 2 agrega ScraperDiyCompsetAdapter + scheduler.
 */
@Module({
  providers: [CompsetService, StubCompsetAdapter],
  controllers: [CompsetController],
  exports: [CompsetService],
})
export class CompsetModule {}
