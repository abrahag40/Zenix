import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator'

class BrandingDto {
  @IsOptional() @IsString() logoUrl?: string
  @IsOptional() @IsString() @MaxLength(9) primaryColor?: string
  @IsOptional() @IsString() @MaxLength(9) accentColor?: string
  @IsOptional() @IsString() @MaxLength(60) fontFamily?: string
}

export class UpsertBookingConfigDto {
  @IsOptional() @IsString() @MaxLength(60) slug?: string
  @IsOptional() @ValidateNested() @Type(() => BrandingDto) branding?: BrandingDto
  @IsOptional() @IsString() @MaxLength(120) heroTitle?: string
  @IsOptional() @IsString() @MaxLength(200) heroSubtitle?: string
  @IsOptional() @IsString() termsUrl?: string
  @IsOptional() @IsString() @MaxLength(10) defaultLanguage?: string
  @IsOptional() @IsString() @MaxLength(3) displayCurrency?: string
  @IsOptional() @IsBoolean() marketplaceListingEnabled?: boolean
}

export class ToggleBookingDto {
  @IsBoolean() enabled!: boolean
}

export class GenerateApiKeyDto {
  @IsString() @MaxLength(80) label!: string
  @IsOptional() @IsIn(['live', 'test']) environment?: 'live' | 'test'
  @IsOptional() @IsArray() @IsString({ each: true }) allowedOrigins?: string[]
}

export class CreateWebhookDto {
  @IsUrl({ require_tld: false }) url!: string
  @IsOptional() @IsArray() @IsString({ each: true }) events?: string[]
}

export class ToggleWebhookDto {
  @IsBoolean() active!: boolean
}
