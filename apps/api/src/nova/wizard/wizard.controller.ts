/**
 * WizardController — endpoints del Wizard Zenix Activate (Day 16).
 *
 * Surface: /v1/nova/wizard/*
 *
 * Endpoints:
 *   POST /v1/nova/wizard/health/channex   — ping real a Channex
 *   POST /v1/nova/wizard/health/stripe    — stub Day 16, real Day 17
 *   POST /v1/nova/wizard/health/pac       — stub Day 16, real Day 17
 *   POST /v1/nova/wizard/health/smtp      — stub Day 16, real Day 17
 *   POST /v1/nova/wizard/activate         — transactional create
 *
 * Auth: Solo PLATFORM_ADMIN / PARTNER_ADMIN / PARTNER_MEMBER (NovaTiers).
 * El cliente NUNCA accede al wizard (§172 D-NOVA-14).
 *
 * NO requiere X-Acting-Organization-Id porque al momento del wizard la
 * Organization aún NO existe — la estamos creando.
 */
import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import type { JwtPayload } from '@zenix/shared'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { NovaTiers, NovaTiersGuard } from '../guards/nova-tiers.guard'
import {
  HealthCheckChannexDto,
  HealthCheckPacDto,
  HealthCheckSmtpDto,
  HealthCheckStripeDto,
  WizardActivateDto,
} from './dto/wizard-dto'
import { WizardHealthService } from './wizard-health.service'
import { WizardActivationService } from './wizard-activation.service'

@Controller('v1/nova/wizard')
@UseGuards(AuthGuard('jwt'), NovaTiersGuard)
@NovaTiers('PLATFORM', 'PARTNER_ADMIN', 'PARTNER_MEMBER')
export class WizardController {
  constructor(
    private readonly health: WizardHealthService,
    private readonly activation: WizardActivationService,
  ) {}

  @Post('health/channex')
  @HttpCode(200)
  async healthChannex(@Body() dto: HealthCheckChannexDto) {
    return this.health.checkChannex(dto)
  }

  @Post('health/stripe')
  @HttpCode(200)
  async healthStripe(@Body() dto: HealthCheckStripeDto) {
    return this.health.checkStripe(dto)
  }

  @Post('health/pac')
  @HttpCode(200)
  async healthPac(@Body() dto: HealthCheckPacDto) {
    return this.health.checkPac(dto)
  }

  @Post('health/smtp')
  @HttpCode(200)
  async healthSmtp(@Body() dto: HealthCheckSmtpDto) {
    return this.health.checkSmtp(dto)
  }

  @Post('activate')
  @HttpCode(201)
  async activate(@Body() dto: WizardActivateDto, @CurrentUser() actor: JwtPayload) {
    return this.activation.activate(dto, actor)
  }
}
