/**
 * Subscription DTOs — input validation con class-validator.
 *
 * Sprint BILLING-CORE Day 3. Pattern alineado con WizardActivateDto +
 * BookingsService DTOs del repo.
 */
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator'

export const PLAN_TIERS = ['STARTER', 'PRO', 'ENTERPRISE'] as const
export type PlanTier = (typeof PLAN_TIERS)[number]

export const BILLING_CYCLES = ['monthly', 'annual'] as const
export type BillingCycle = (typeof BILLING_CYCLES)[number]

export class CreateSubscriptionDto {
  @IsString()
  @Length(8, 64)
  organizationId!: string

  @IsIn(PLAN_TIERS)
  planTier!: PlanTier

  @IsInt() @Min(1) @Max(50)
  propertyCount!: number

  @IsIn(BILLING_CYCLES)
  billingCycle!: BillingCycle

  @IsIn(['MXN', 'USD'])
  currency!: 'MXN' | 'USD'

  // Email del Org Owner — Stripe lo usa para Customer + recibos
  @IsEmail()
  ownerEmail!: string

  @IsString() @Length(2, 120)
  ownerName!: string

  // Trial opcional (días). 0 = sin trial.
  @IsOptional()
  @IsInt() @Min(0) @Max(30)
  trialDays?: number

  // Coupon ID Stripe (cuando hay descuento — DiscountCodeService Day 4)
  @IsOptional()
  @IsString()
  stripeCouponId?: string

  // Si true, no se requiere método de pago al crear (Stripe permite
  // arrancar trial sin tarjeta — para clientes piloto v1.0.0 manual)
  @IsOptional()
  @IsBoolean()
  allowIncompleteWithoutPaymentMethod?: boolean
}

export class ChangePlanDto {
  @IsIn(PLAN_TIERS)
  newPlanTier!: PlanTier

  @IsInt() @Min(1) @Max(50)
  newPropertyCount!: number

  // 'upgrade' o 'downgrade' — determina proration_behavior
  // Si el cambio es ambiguo (mismo tier pero más properties = upgrade),
  // el service decide; cliente puede override.
  @IsOptional()
  @IsIn(['upgrade', 'downgrade', 'auto'])
  changeKind?: 'upgrade' | 'downgrade' | 'auto'
}

export class PauseSubscriptionDto {
  @IsInt() @Min(1) @Max(6)
  pauseMonths!: number

  @IsOptional()
  @IsString()
  pauseReason?: string
}

export class CancelSubscriptionDto {
  @IsString()
  @IsIn([
    'PRICE_TOO_HIGH',
    'NOT_USING_FEATURES',
    'COMPETITOR',
    'TEMPORARY_CLOSURE',
    'SUPPORT_ISSUES',
    'OTHER',
  ])
  cancellationReason!: string

  @IsOptional()
  @IsString()
  feedbackText?: string

  // Cuando true, cancel inmediato (no at_period_end). Solo PLATFORM_ADMIN
  // o casos extremos. Default false.
  @IsOptional()
  @IsBoolean()
  immediate?: boolean
}

export class CreateCustomerPortalSessionDto {
  @IsOptional()
  @IsString()
  returnUrl?: string
}
