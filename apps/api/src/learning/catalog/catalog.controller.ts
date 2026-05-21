import { Controller, Get, Param, Query } from '@nestjs/common'
import { LearningCourseTier } from '@prisma/client'
import { JwtPayload } from '@zenix/shared'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CatalogService } from './catalog.service'

/**
 * Catalog Controller — endpoints públicos del catálogo Learning para learners.
 * Mounted at `/v1/learning/courses` y `/v1/learning/me/dashboard`.
 */
@Controller()
export class CatalogController {
  constructor(private readonly service: CatalogService) {}

  @Get('v1/learning/courses')
  list(
    @Query('category') category?: string,
    @Query('tier') tier?: LearningCourseTier,
    @Query('language') language?: string,
    @Query('search') search?: string,
  ) {
    return this.service.list({ category, tier, language, search })
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
