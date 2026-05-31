import {
  BadRequestException,
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
} from '@nestjs/common'
import { IsBoolean, IsIn, IsObject, IsOptional, IsString } from 'class-validator'
import { CreateContactLogDto } from './dto/create-contact-log.dto'
import { ConfirmCheckinDto } from './dto/confirm-checkin.dto'
import { RegisterPaymentDto } from './dto/register-payment.dto'
import { VoidPaymentDto } from './dto/void-payment.dto'
import { UpdateGuestStayDto } from './dto/update-guest-stay.dto'
import { CreateGuestStayNoteDto, UpdateGuestStayNoteDto } from './dto/guest-stay-note.dto'

class MarkNoShowDto {
  @IsOptional()
  @IsString()
  reason?: string

  @IsOptional()
  @IsBoolean()
  waiveCharge?: boolean
}

/**
 * Registra cómo recepción cobró el no-show post-marcado. Flujo 100%
 * administrativo — Zenix NO procesa el cobro automáticamente (no usamos
 * Stripe en check-in). Recepción cobra fuera de Zenix (efectivo, transfer,
 * carga manual de tarjeta OTA, llamada a Booking VCC, etc.) y luego registra
 * el resultado aquí para el tracking del estado.
 *
 * Una vez registrado, el `noShowChargeStatus` queda inmutable salvo
 * revertNoShow. Para evidencia fiscal/chargeback.
 */
class RegisterNoShowChargeDto {
  @IsIn(['CHARGED', 'FAILED', 'WAIVED'])
  status!: 'CHARGED' | 'FAILED' | 'WAIVED'

  /**
   * Método físico del cobro:
   *   · cash         — recepción cobró en efectivo
   *   · transfer     — transferencia bancaria recibida
   *   · ota_card     — tarjeta proporcionada por la OTA (Booking Genius VCC,
   *                    Expedia virtual card, etc. — recepción la cargó manual
   *                    en su POS o llamó al cardholder)
   *   · manual_card  — tarjeta tipeada manual en POS independiente
   *   · ota_collect  — OTA ya cobró al huésped, hotel recibirá payout
   *   · other        — caso no estándar, requiere reference + reason
   */
  @IsIn(['cash', 'transfer', 'ota_card', 'manual_card', 'ota_collect', 'other'])
  method!: 'cash' | 'transfer' | 'ota_card' | 'manual_card' | 'ota_collect' | 'other'

  /**
   * Referencia del cobro: número de aprobación POS, ID de transferencia
   * bancaria, ticket de caja. Opcional pero recomendado para audit trail.
   */
  @IsOptional()
  @IsString()
  reference?: string

  /**
   * Razón obligatoria para status='WAIVED' (perdón del cargo) o
   * status='FAILED'. Compliance + audit.
   */
  @IsOptional()
  @IsString()
  reason?: string
}

class ExtendStayDto {
  @IsString()
  newCheckOut: string
}

class CancelStayDto {
  @IsIn(['GUEST', 'HOTEL', 'OTA', 'ADMIN_ERROR', 'SYSTEM'])
  initiator!: 'GUEST' | 'HOTEL' | 'OTA' | 'ADMIN_ERROR' | 'SYSTEM'

  @IsOptional()
  @IsString()
  reason?: string

  @IsOptional()
  @IsString()
  reasonCode?: string

  @IsOptional()
  @IsIn(['PMS_DIRECT', 'CHANNEX_WEBHOOK', 'AUTO_SYSTEM'])
  cancelledFromChannel?: 'PMS_DIRECT' | 'CHANNEX_WEBHOOK' | 'AUTO_SYSTEM'

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}
import { GuestStaysService } from './guest-stays.service'
import { TaxBreakdownService } from './tax-breakdown.service'
import { CreateGuestStayDto } from './dto/create-guest-stay.dto'
import { MoveRoomDto } from './dto/move-room.dto'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '@zenix/shared'

@Controller('v1/guest-stays')
export class GuestStaysController {
  constructor(
    private readonly service: GuestStaysService,
    private readonly taxBreakdown: TaxBreakdownService,
  ) {}

  @Post()
  create(@Body() dto: CreateGuestStayDto, @CurrentUser() actor: JwtPayload) {
    return this.service.create(dto, actor.sub)
  }

  /**
   * GET /v1/guest-stays/cash-summary?propertyId=X&date=YYYY-MM-DD
   * Reconciliación de caja de efectivo por turno.
   * IMPORTANT: declarado antes de :id para evitar que NestJS lo resuelva como param.
   */
  @Get('cash-summary')
  getCashSummary(
    @Query('propertyId') propertyId: string,
    @Query('date')       date:       string,
  ) {
    if (!propertyId || !date) throw new BadRequestException('propertyId y date son requeridos')
    return this.service.getCashSummary(propertyId, date)
  }

  /**
   * Pre-flight availability check — no side effects.
   * Called by the frontend as the user selects dates in the check-in dialog.
   *
   * GET /v1/guest-stays/availability?roomId=<id>&checkIn=<ISO>&checkOut=<ISO>
   *
   * IMPORTANT: this route must be declared before any parameterized routes
   * (e.g. :id) to prevent NestJS from matching "availability" as an :id param.
   */
  @Get('availability')
  checkAvailability(
    @Query('roomId')   roomId:   string,
    @Query('checkIn')  checkIn:  string,
    @Query('checkOut') checkOut: string,
  ) {
    if (!roomId || !checkIn || !checkOut) {
      throw new BadRequestException('roomId, checkIn y checkOut son requeridos')
    }
    const ciDate = new Date(checkIn)
    const coDate = new Date(checkOut)
    if (isNaN(ciDate.getTime()) || isNaN(coDate.getTime())) {
      throw new BadRequestException('Fechas inválidas')
    }
    if (coDate <= ciDate) {
      throw new BadRequestException('checkOut debe ser posterior a checkIn')
    }
    return this.service.checkAvailability(roomId, ciDate, coDate)
  }

  /**
   * GET /v1/guest-stays/mobile/list
   * Mobile-shaped reservation list for the Reservas tab.
   * Computes status, arrivesToday, departsToday, dateRangeLabel server-side
   * for timezone correctness. Declared before :id to avoid route shadowing.
   */
  @Get('mobile/list')
  getMobileList(
    @Query('search')       search?: string,
    @Query('statusFilter') statusFilter?: string | string[],
    @Query('dateFilter')   dateFilter?: string,
    @CurrentUser()         actor?: JwtPayload,
  ) {
    if (!actor) throw new BadRequestException('No actor')
    const statusArray = statusFilter
      ? Array.isArray(statusFilter) ? statusFilter : [statusFilter]
      : []
    return this.service.getMobileList(actor.propertyId, actor.role, {
      search, statusFilter: statusArray, dateFilter,
    })
  }

  /**
   * GET /v1/guest-stays/mobile/:id
   * Full reservation detail for the mobile detail screen.
   * Includes payments and journey audit trail.
   * Declared before :id to avoid route shadowing.
   */
  @Get('mobile/:id')
  getMobileDetail(
    @Param('id')   id: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.getMobileDetail(id, actor.role)
  }

  /**
   * GET /v1/guest-stays/cancelled?propertyId=&limit=&offset=&initiator=&since=
   * Declarado ANTES de :id (CLAUDE.md §26 — route ordering crítico).
   */
  @Get('cancelled')
  listCancelled(
    @Query('propertyId') propertyId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('initiator') initiator?: string,
    @Query('since') since?: string,
  ) {
    return this.service.listCancelled({
      propertyId,
      limit:    limit ? parseInt(limit, 10) : undefined,
      offset:   offset ? parseInt(offset, 10) : undefined,
      initiator,
      sinceISO: since,
    })
  }

  /**
   * GET /v1/guest-stays/cancelled-today-count?propertyId=&timezone=
   * Declarado ANTES de :id (CLAUDE.md §26).
   */
  @Get('cancelled-today-count')
  countCancelledToday(
    @Query('propertyId') propertyId: string,
    @Query('timezone') timezone: string,
  ) {
    return this.service.countCancelledToday(propertyId, timezone || 'UTC')
  }

  /**
   * GET /v1/guest-stays/:id/checkin-context
   * Sprint CHECK-IN-α §107 — datos consolidados para el dialog de check-in.
   * Declarado antes de `:id` para evitar shadowing (CLAUDE.md §26).
   */
  @Get(':id/checkin-context')
  getCheckinContext(@Param('id') id: string) {
    return this.service.getCheckinContext(id)
  }

  /**
   * GET /v1/guest-stays/:id/payments
   * Sprint EDIT-RESERVATION — lista PaymentLogs (incluye voided + void
   * entries para que la UI muestre la línea original tachada + la anulación).
   */
  @Get(':id/payments')
  listPayments(@Param('id') id: string) {
    return this.service.listPaymentLogs(id)
  }

  /**
   * Timeline unificado de auditoría para una estadía:
   *   GuestStayLog (eventos stay-level) + StayJourneyEvent (journey-level).
   * Ordenado cronológicamente. Sprint 2026-05-19 — feedback usuario: el
   * "Historial" sólo mostraba "Reserva creada" porque renderizaba hard-coded.
   * Ahora cualquier room-move / extension / cancel / restore / no-show
   * registrado por los servicios aparece automáticamente.
   */
  @Get(':id/timeline')
  getTimeline(@Param('id') id: string) {
    return this.service.getTimeline(id)
  }

  /**
   * Desglose fiscal de la estadía según la jurisdicción de la propiedad.
   * Sprint 2026-05-20. Retorna line items computados (IVA + ISH + DSA según
   * estado/país) o jurisdicción no-configurada con nota explicativa.
   * Ver TaxBreakdownService para reglas por jurisdicción.
   */
  @Get(':id/tax-breakdown')
  getTaxBreakdown(@Param('id') id: string) {
    return this.taxBreakdown.computeForStay(id)
  }

  /**
   * Guest stats agregadas (repeat guest indicator). Sprint 2026-05-20.
   * Mews + Opera top request: distinguir primera-visita vs cliente recurrente.
   */
  @Get(':id/guest-stats')
  getGuestStats(@Param('id') id: string) {
    return this.service.getGuestStats(id)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id)
  }

  @Get()
  findByProperty(
    @Query('propertyId') propertyId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.findByProperty(
      propertyId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    )
  }

  /**
   * POST /v1/guest-stays/swap-rooms
   *
   * Sprint CHECK-IN C3.1 v3 (2026-05-30). Intercambia habitaciones entre 2
   * stays activas. Use case: ReservationGroup OTA donde recepción quiere
   * mover Juan a la hab de María (y María a la de Juan) en un solo paso
   * atómico. Sin esto, recepción debe hacer 2 moveRoom secuenciales con
   * habitación temporal de paso — torpe + ventana de conflict intermedio.
   *
   * IMPORTANTE: literal route ANTES de `:id` routes para evitar matching
   * ambiguo en Express/NestJS router. Mismo pattern que `/payments/:id/void`
   * (literal payments) y `/notes/:noteId` (literal notes) en este controller.
   */
  @Post('swap-rooms')
  swapRooms(
    @Body() dto: { stayIdA: string; stayIdB: string; reason?: string },
    @CurrentUser() actor: JwtPayload,
  ) {
    if (!dto.stayIdA || !dto.stayIdB) {
      throw new BadRequestException('stayIdA y stayIdB son requeridos')
    }
    return this.service.swapStayRooms(dto.stayIdA, dto.stayIdB, actor.sub, dto.reason)
  }

  @Post(':id/checkout')
  checkout(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.service.checkout(id, actor.sub)
  }

  @Post(':id/early-checkout')
  earlyCheckout(
    @Param('id') id: string,
    @Body() dto: { notes?: string },
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.earlyCheckout(id, actor.sub, dto.notes)
  }

  /**
   * EC-3 — Late checkout. Recepcionista aprueba que el huésped salga a una
   * hora distinta a la programada. Body: { newCheckoutTime: ISO string }.
   * Ajusta scheduledCheckout + actualiza tareas asociadas.
   */
  @Post(':id/late-checkout')
  lateCheckout(
    @Param('id') id: string,
    @Body() dto: { newCheckoutTime: string },
    @CurrentUser() actor: JwtPayload,
  ) {
    if (!dto.newCheckoutTime) {
      throw new BadRequestException('newCheckoutTime is required (ISO string)')
    }
    const parsed = new Date(dto.newCheckoutTime)
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('newCheckoutTime must be a valid ISO date')
    }
    return this.service.lateCheckout(id, parsed, actor.sub)
  }

  /**
   * D12 — extension cleaning flag.
   * Después de confirmar el pago de una extensión, el receptionist responde:
   *   { requiresCleaning: true }  → tareas existentes se marcan WITH_CLEANING + push
   *   { requiresCleaning: false } → tareas se cancelan con EXTENSION_NO_CLEANING + badge en mobile
   */
  @Post(':id/extend-with-cleaning-flag')
  extendWithCleaningFlag(
    @Param('id') id: string,
    @Body() dto: { requiresCleaning: boolean },
    @CurrentUser() actor: JwtPayload,
  ) {
    if (typeof dto.requiresCleaning !== 'boolean') {
      throw new BadRequestException('requiresCleaning is required (boolean)')
    }
    return this.service.extendWithCleaningFlag(id, dto.requiresCleaning, actor.sub)
  }

  @Patch(':id/extend')
  extendStay(
    @Param('id') id: string,
    @Body() dto: ExtendStayDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    if (!dto.newCheckOut) throw new BadRequestException('newCheckOut es requerido')
    return this.service.extendStay(id, new Date(dto.newCheckOut), actor.sub)
  }

  @Patch(':id/move-room')
  moveRoom(
    @Param('id') id: string,
    @Body() dto: MoveRoomDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.moveRoom(id, dto, actor.sub)
  }

  /**
   * POST /v1/guest-stays/:id/confirm-checkin
   * Confirma la llegada física del huésped y registra los pagos de ingreso.
   */
  @Post(':id/confirm-checkin')
  confirmCheckin(
    @Param('id') id: string,
    @Body() dto: ConfirmCheckinDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.confirmCheckin(id, dto, actor.sub)
  }

  /**
   * PATCH /v1/guest-stays/:id
   * Sprint EDIT-RESERVATION — update parcial con guards per-phase.
   */
  @Patch(':id')
  updateStay(
    @Param('id') id: string,
    @Body() dto: UpdateGuestStayDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.updateGuestStay(id, dto, actor.sub)
  }

  /**
   * Notes (bitácora humana) — append-only con ventana edición 5min.
   * IMPORTANT: la ruta `notes/:noteId` debe declararse ANTES de `:id/notes`
   * pero como tiene 2 segments distintos no colisiona con `:id` (§26).
   */
  @Get(':id/notes')
  listNotes(@Param('id') id: string) {
    return this.service.listNotes(id)
  }

  @Post(':id/notes')
  createNote(
    @Param('id') id: string,
    @Body() dto: CreateGuestStayNoteDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.createNote(id, dto, actor.sub)
  }

  @Patch('notes/:noteId')
  editNote(
    @Param('noteId') noteId: string,
    @Body() dto: UpdateGuestStayNoteDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.editNote(noteId, dto, actor.sub)
  }

  /**
   * POST /v1/guest-stays/:id/payments
   * Registra un pago adicional sobre una estadía (abono, cargo extra, etc.).
   */
  @Post(':id/payments')
  registerPayment(
    @Param('id') id: string,
    @Body() dto: RegisterPaymentDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.registerPayment(id, dto, actor.sub)
  }

  /**
   * POST /v1/guest-stays/payments/:paymentLogId/void
   * Anula un PaymentLog (crea entrada negativa — original intacto).
   * IMPORTANT: declarado antes de :id para evitar ambigüedad de routing.
   */
  @Post('payments/:paymentLogId/void')
  voidPayment(
    @Param('paymentLogId') paymentLogId: string,
    @Body() dto: VoidPaymentDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.voidPayment(paymentLogId, dto, actor.sub)
  }

  /**
   * POST /v1/guest-stays/:id/no-show
   * Marca manualmente una estadía como no-show.
   * El recepcionista puede exonerar el cargo con waiveCharge: true
   * (requiere rol SUPERVISOR — validación en frontend; el servicio registra quién lo hizo).
   */
  @Post(':id/no-show')
  markAsNoShow(
    @Param('id') id: string,
    @Body() dto: MarkNoShowDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.markAsNoShow(id, actor.sub, dto)
  }

  /**
   * POST /v1/guest-stays/:id/revert-no-show
   * Revierte el no-show dentro de la ventana de 48h.
   * Útil para: vuelo retrasado, llegada tardía, error del recepcionista.
   */
  @Post(':id/revert-no-show')
  revertNoShow(
    @Param('id') id: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.revertNoShow(id, actor.sub)
  }

  /**
   * POST /v1/guest-stays/:id/register-noshow-charge
   *
   * Registra el resultado del cobro manual del no-show. Flujo administrativo
   * 100% — Zenix NO procesa Stripe en check-in. Recepción cobra fuera de
   * Zenix con los datos de la OTA (Booking Genius VCC, Expedia Collect),
   * efectivo, transferencia, etc. — y registra aquí cómo le fue.
   *
   * Estados que acepta el endpoint:
   *   · CHARGED → cargo cobrado OK
   *   · FAILED  → tarjeta rechazada / fondos insuficientes / sin respuesta
   *   · WAIVED  → recepción decidió perdonar (requiere reason)
   *
   * Sólo se puede registrar si:
   *   · stay tiene noShowAt set (estadía ya marcada como no-show)
   *   · noShowChargeStatus está en 'PENDING' (no se sobrescribe historial)
   *
   * Audit trail: actor, timestamp, method, reference, reason quedan en BD.
   * Inmutable post-registro (sólo revertNoShow puede reabrir todo).
   */
  @Post(':id/register-noshow-charge')
  registerNoShowCharge(
    @Param('id') id: string,
    @Body() dto: RegisterNoShowChargeDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.registerNoShowCharge(id, actor.sub, dto)
  }

  /**
   * POST /v1/guest-stays/:id/contact-log
   * Registra un intento de contacto al huésped para documentación de disputas.
   * Append-only — no hay endpoint de actualización ni borrado.
   */
  @Post(':id/contact-log')
  logContact(
    @Param('id') id: string,
    @Body() dto: CreateContactLogDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.logContact(id, actor.sub, dto.channel, dto.messagePreview)
  }

  /**
   * POST /v1/guest-stays/:id/cancel
   * Soft-delete una reserva. La fila permanece en DB; AvailabilityService la excluye.
   * Guards: estado debe ser pre-checkin (no IN_HOUSE, no DEPARTED, no NO_SHOW, no ya CANCELLED).
   */
  @Post(':id/cancel')
  cancelStay(
    @Param('id') id: string,
    @Body() dto: CancelStayDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.cancelStay(id, actor.sub, dto)
  }

  /**
   * POST /v1/guest-stays/:id/restore
   * Restaura una reserva cancelada. Solo si initiator=HOTEL|ADMIN_ERROR y < 7 días.
   * Verifica disponibilidad de la habitación antes de restaurar.
   */
  @Post(':id/restore')
  restoreStay(
    @Param('id') id: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.restoreStay(id, actor.sub)
  }
}
