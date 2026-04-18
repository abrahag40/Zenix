import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

/**
 * DashboardService — scaffold.
 *
 * Landing screen shown post-login. Business logic (KPIs, summaries,
 * widgets) intentionally NOT implemented in this sprint. Ticket scope
 * is only to stand up the module/controller/service trio.
 */
@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name)

  constructor(private readonly prisma: PrismaService) {}

  async getOverview(propertyId: string) {
    this.logger.debug(`getOverview(propertyId=${propertyId}) — scaffold`)
    return {
      propertyId,
      generatedAt: new Date().toISOString(),
      widgets: [],
    }
  }
}
