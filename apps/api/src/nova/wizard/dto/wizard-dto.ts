/**
 * DTOs for Wizard Zenix Activate endpoints (Day 16).
 *
 * Schema-validated input para los 4 health-checks + activación final.
 * Validación class-validator alineada con frontend wizard store
 * (apps/web/src/store/wizard.ts).
 */
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'

// ─── Health-check DTOs ────────────────────────────────────────────────

export class HealthCheckChannexDto {
  /** propertyId Channex a probar. Si vacío, lista properties accesibles
   *  con la api-key configurada. */
  @IsOptional()
  @IsString()
  @Length(8, 64)
  channexPropertyId?: string
}

export class HealthCheckStripeDto {
  /** Stripe Connect account id del cliente (acct_...). Stub Day 16. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  connectAccountId?: string
}

export class HealthCheckPacDto {
  /** Adapter id elegido en Step 3 (MX_FACTURAMA / MX_SW_SAPIEN / CO_DIAN...). */
  @IsString()
  @MaxLength(40)
  pacAdapter!: string

  /** Tax ID (RFC/NIT/RUC) — para echo en mock response. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  taxId?: string
}

export class HealthCheckSmtpDto {
  /** Email del Org Owner — destinatario del test email. */
  @IsEmail()
  toAddress!: string
}

// ─── Activate DTO ─────────────────────────────────────────────────────

export class WizardPropertyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string

  @IsIn(['HOTEL', 'HOSTAL', 'BOUTIQUE', 'GLAMPING', 'ECO_LODGE', 'VACATION_RENTAL'])
  type!: 'HOTEL' | 'HOSTAL' | 'BOUTIQUE' | 'GLAMPING' | 'ECO_LODGE' | 'VACATION_RENTAL'

  /** IANA timezone — e.g. 'America/Cancun'. */
  @IsString()
  @MaxLength(60)
  timezone!: string

  /** Stable city id del catálogo LATAM. Null = free text. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  cityId?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(120)
  cityFreeText?: string

  @IsOptional()
  @IsString()
  @MaxLength(180)
  cityDisplay?: string
}

export class WizardDiscountDto {
  @IsInt() @Min(5) @Max(50)
  percentOff!: number

  @IsIn(['once', 'repeating', 'forever'])
  duration!: 'once' | 'repeating' | 'forever'

  @IsOptional()
  @IsInt() @Min(1) @Max(12)
  durationInMonths?: number

  @IsString() @MinLength(20) @MaxLength(500)
  reason!: string
}

export class WizardActivateDto {
  // Step 1 — Customer Account
  @IsString() @MinLength(2) @MaxLength(120)
  organizationName!: string

  @IsString()
  @MinLength(3)
  @MaxLength(40)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug debe contener solo letras minúsculas, números y guiones',
  })
  organizationSlug!: string

  @IsString() @Length(2, 2)
  organizationCountryCode!: string

  @IsString() @MaxLength(60)
  organizationTimezone!: string

  // Step 2 — Brand (opcional)
  @IsBoolean()
  brandEnabled!: boolean

  @IsOptional() @IsString() @MaxLength(120)
  brandName?: string

  @IsOptional() @IsString() @MaxLength(500)
  brandLogoUrl?: string

  // Step 3 — LegalEntity
  @IsString() @MinLength(2) @MaxLength(180)
  legalEntityName!: string

  @IsString() @MinLength(3) @MaxLength(20)
  legalEntityTaxId!: string

  @IsString() @MaxLength(40)
  legalEntityRegime!: string

  @IsString() @Length(3, 3)
  legalEntityBaseCurrency!: string

  @IsString() @MaxLength(40)
  legalEntityPacAdapter!: string

  // Step 4 — Properties (N items, min 1)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WizardPropertyDto)
  properties!: WizardPropertyDto[]

  // Step 5 — Inventory template
  @IsIn(['HOSTAL', 'BOUTIQUE', 'CABAÑAS', 'BUSINESS', 'CUSTOM'])
  inventoryTemplate!: 'HOSTAL' | 'BOUTIQUE' | 'CABAÑAS' | 'BUSINESS' | 'CUSTOM'

  // Step 6 — Org Owner
  @IsEmail()
  @MaxLength(180)
  orgOwnerEmail!: string

  @IsString() @MinLength(2) @MaxLength(120)
  orgOwnerName!: string

  // Step 7 — health-check override (PAC warning aceptado por consultor)
  @IsOptional()
  @IsBoolean()
  pacOverrideAccepted?: boolean

  // Step 7.5 — Plan + descuento (Sprint BILLING-CORE Day 7)
  @IsOptional()
  @IsIn(['STARTER', 'PRO', 'ENTERPRISE'])
  planTier?: 'STARTER' | 'PRO' | 'ENTERPRISE'

  @IsOptional()
  @IsIn(['monthly', 'annual'])
  billingCycle?: 'monthly' | 'annual'

  @IsOptional()
  @IsInt()
  @Min(0) @Max(30)
  trialDays?: number

  @IsOptional()
  @ValidateNested()
  @Type(() => WizardDiscountDto)
  discount?: WizardDiscountDto

  // Sprint DISCOUNT-CODES Day 4 — template pre-configurado del consultor.
  // Si presente, el backend usa el template y NO mira el campo `discount`.
  @IsOptional()
  @IsString() @Length(8, 64)
  discountTemplateId?: string

  // Sprint CHANNEX-AUTO-PROVISION Day 3 — Step 5.5 wizard channels.
  // channexPushEnabled default true. Si false, backend skip TODO el flow
  // Channex (no crea property/rt/rp/channels).
  @IsOptional()
  @IsBoolean()
  channexPushEnabled?: boolean

  // Lista de canales OTA a habilitar al activar. Cada uno con type + title +
  // credentials encriptadas server-side. Vacío = sin canales (cliente los
  // agrega después en /nova/billing/channex).
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WizardChannelDto)
  channels?: WizardChannelDto[]
}

// ─── Sprint CHANNEX-AUTO-PROVISION Day 3 — channels DTO ─────────────────

export class WizardChannelDto {
  @IsIn([
    'BookingCom',
    'ExpediaCom',
    'AirbnbCom',
    'AgodaCom',
    'GoogleHotelAds',
    'VRBOCom',
    'OpenChannel',
  ])
  type!:
    | 'BookingCom'
    | 'ExpediaCom'
    | 'AirbnbCom'
    | 'AgodaCom'
    | 'GoogleHotelAds'
    | 'VRBOCom'
    | 'OpenChannel'

  @IsString() @MinLength(2) @MaxLength(120)
  title!: string

  /** Plain credentials del cliente (hotel_id+user+pass para Booking/Expedia/
   *  Agoda; listing_id para Airbnb; partner_id+booking_link_template para
   *  Google Hotel Ads). Backend cifra AES-256-GCM antes de persistir.
   *  Vacío permitido si configureLater=true. */
  @IsOptional()
  credentials?: Record<string, string>

  @IsBoolean()
  configureLater!: boolean
}

// ─── Response types ───────────────────────────────────────────────────

export interface HealthCheckResponse {
  status: 'success' | 'warning' | 'error'
  message: string
  latencyMs: number
  /** Detail adicional para debug (no leak credentials). */
  detail?: Record<string, unknown>
}

export interface WizardActivateResponse {
  organizationId: string
  legalEntityId: string
  brandId: string | null
  propertyIds: string[]
  orgOwnerUserId: string
  /** Setup link para el Org Owner. Incluye token JWT-style 72h. */
  ownerSetupLink: string
  /** Timestamp ISO de creación. */
  activatedAt: string
  /** Auditoría queued — true cuando AuditLog entry escribió OK. */
  auditLogged: boolean
  /** Email enviado al Org Owner (Day 18). false si RESEND_API_KEY no
   *  configurado o Resend devolvió error — el frontend muestra fallback
   *  copy-paste del setup link igual. */
  emailSent: boolean
  /** Subscription Stripe creada (Day 7). null si Stripe no configurado o
   *  hubo error en la creación (best-effort outside-tx). */
  subscription?: {
    id: string
    stripeSubscriptionId: string
    status: string
    planTier: string
    discountApplied: boolean
    discountStatus?: 'applied' | 'pending_approval' | null
    /** BILLING-DAY1 (2026-05-29) — pricing del plan para hero email. */
    baseMonthlyAmount?: number
    currency?: 'MXN' | 'USD'
  } | null

  /** Sprint CHANNEX-AUTO-PROVISION Day 3 — outcome del provisioning Channex
   *  outside-tx. null si channexPushEnabled=false o no hay properties.
   *  status='partial' o 'failed' → frontend muestra CTA "Revisar en
   *  /nova/billing/channex". */
  channexProvisioning?: {
    status: 'completed' | 'partial' | 'failed'
    propertiesProvisioned: number
    roomTypesCreated: number
    ratePlansCreated: number
    channelsCreated: number
    channelsRequiringOauth: number
    channelsPendingCredentials: number
    errors: Array<{ step: string; propertyId?: string; message: string }>
  } | null
}
