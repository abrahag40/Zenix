import { Module } from '@nestjs/common'
import { CompsetService } from './compset.service'
import { CompsetController } from './compset.controller'
import { StubCompsetAdapter } from './stub-compset.adapter'
import { GooglePlacesService } from './google-places.service'
import { CompsetRefreshScheduler } from './compset-refresh.scheduler'

/**
 * CompsetModule — Fase 3 RATES-METRICS-COMPSET.
 * Chunk 1: schema + service + stub adapter + endpoints.
 * Chunk 2: scheduler diario (usa stub hoy, swap a Playwright en chunk 3).
 *
 * GooglePlacesService (2026-06-07): real hotel search via Places API New
 * cuando GOOGLE_PLACES_API_KEY está en env. Sin esa key, searchHotel devuelve []
 * honesto (sin "X Hotel" fake del StubAdapter).
 */
@Module({
  providers: [CompsetService, StubCompsetAdapter, GooglePlacesService, CompsetRefreshScheduler],
  controllers: [CompsetController],
  exports: [CompsetService],
})
export class CompsetModule {}
