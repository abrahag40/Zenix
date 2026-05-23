import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { LearningCourseTier } from '@prisma/client'
import { JwtPayload } from '@zenix/shared'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { DLCGuard } from '../../dlc/dlc.guard'
import { RequiresDLC } from '../../dlc/requires-dlc.decorator'
import { CatalogService } from './catalog.service'

/**
 * Catalog Controller — endpoints públicos del catálogo Learning para learners.
 * Mounted at `/v1/learning/courses` y `/v1/learning/me/dashboard`.
 *
 * Todos los endpoints requieren DLC LEARNING_CORE activo. Si no:
 * HTTP 402 + payload con `activateUrl` para reactivar (data preservada).
 */
@UseGuards(DLCGuard)
@RequiresDLC('LEARNING_CORE')
@Controller()
export class CatalogController {
  constructor(private readonly service: CatalogService) {}

  @Get('v1/learning/courses')
  list(
    @CurrentUser() actor: JwtPayload,
    @Query('category') category?: string,
    @Query('tier') tier?: LearningCourseTier,
    @Query('language') language?: string,
    @Query('search') search?: string,
  ) {
    return this.service.list({ category, tier, language, search }, actor)
  }

  @Get('v1/learning/courses/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.service.findBySlug(slug)
  }

  @Get('v1/learning/me/dashboard')
  dashboard(@CurrentUser() actor: JwtPayload) {
    return this.service.getDashboardForActor(actor)
  }
}
