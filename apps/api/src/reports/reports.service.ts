/**
 * ReportsService — Reporting & Analytics Module + No-Show Analytics
 *
 * Proporciona tres vistas analíticas para supervisores y gerentes de la propiedad:
 *
 *  1. getOverview      — KPIs agregados para un rango de fechas (checkouts, tareas, tiempos).
 *  2. getStaffPerformance — Métricas por camarera: tareas completadas, verificadas y tiempo promedio.
 *  3. getDailyTrend    — Serie temporal diaria de tareas completadas vs. checkouts para graficar.
 *
 * Estrategia de rendimiento:
 *  - Todos los métodos evitan queries N+1 ejecutando exactamente dos consultas en paralelo
 *    (Promise.all) y agrupando en memoria con Map<string, number>.
 *  - Las fechas se normalizan a inicio/fin de día (00:00:00.000 / 23:59:59.999) para capturar
 *    todos los registros del día sin depender de zonas horarias en el cliente.
 */
import { Injectable } from '@nestjs/common'
import { CleaningStatus, StaffRole } from '@zenix/shared'
import { SegmentReason } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { Decimal } from '@prisma/client/runtime/library'

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  /**
   * getOverview — KPIs generales de la propiedad para un período.
   *
   * Reglas de negocio:
   *  - Solo se cuentan checkouts NO cancelados (cancelled: false).
   *  - "Completadas" incluye DONE + VERIFIED (ambas son estados finales de limpieza exitosa).
   *  - "Pendientes" incluye READY, IN_PROGRESS y PAUSED (tareas activas que aún no finalizaron).
   *  - El tiempo promedio de limpieza solo se calcula sobre tareas que tienen startedAt Y
   *    finishedAt para evitar sesgos con tareas aún en progreso o no iniciadas.
   *
   * @param propertyId  UUID de la propiedad a consultar
   * @param from        Fecha inicio en formato ISO-8601 (YYYY-MM-DD)
   * @param to          Fecha fin en formato ISO-8601 (YYYY-MM-DD), inclusiva
   * @returns           Objeto con conteos de tareas por estado y tiempo promedio en minutos
   */
  async getOverview(propertyId: string, from: string, to: string) {
    // Normalizar al inicio y fin del día para incluir todos los registros del período
    const fromDate = new Date(from)
    fromDate.setHours(0, 0, 0, 0)
    const toDate = new Date(to)
    toDate.setHours(23, 59, 59, 999)

    // Dos queries en paralelo evitan N+1: una para checkouts (solo count) y otra
    // para tareas (solo campos necesarios para cálculos, sin cargar relaciones completas)
    const [checkouts, tasks] = await Promise.all([
      this.prisma.checkout.count({
        where: {
          room: { propertyId },
          createdAt: { gte: fromDate, lte: toDate },
          cancelled: false, // Excluir checkouts de huéspedes que extendieron estadía
        },
      }),
      this.prisma.cleaningTask.findMany({
        where: {
          unit: { room: { propertyId } },
          createdAt: { gte: fromDate, lte: toDate },
        },
        // Solo se seleccionan los campos estrictamente necesarios (evita traer payloads grandes)
        select: {
          status: true,
          startedAt: true,
          finishedAt: true,
        },
      }),
    ])

    // Clasificar tareas por estado según el flujo de la máquina de estados de limpieza:
    // UNASSIGNED → READY → IN_PROGRESS ↔ PAUSED → DONE → VERIFIED
    const completed = tasks.filter((t) => t.status === CleaningStatus.DONE || t.status === CleaningStatus.VERIFIED)
    const verified = tasks.filter((t) => t.status === CleaningStatus.VERIFIED)
    const pending = tasks.filter((t) =>
      [CleaningStatus.READY, CleaningStatus.IN_PROGRESS, CleaningStatus.PAUSED].includes(t.status as CleaningStatus),
    )
    const unassigned = tasks.filter((t) => t.status === CleaningStatus.UNASSIGNED)

    // Calcular tiempos de limpieza en minutos (diferencia finishedAt - startedAt)
    // Se filtra por tareas con ambas fechas presentes; las tareas sin startedAt/finishedAt
    // se omiten para no distorsionar el promedio con valores nulos
    const completionTimes = completed
      .filter((t) => t.startedAt && t.finishedAt)
      .map((t) => (new Date(t.finishedAt!).getTime() - new Date(t.startedAt!).getTime()) / 60000)

    // Si no hay ninguna tarea con tiempo medible, devolver null (no mostrar 0 minutos)
    const avg = completionTimes.length
      ? Math.round(completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length)
      : null

    return {
      from,
      to,
      totalCheckouts: checkouts,
      tasksCompleted: completed.length,
      tasksVerified: verified.length,
      tasksPending: pending.length,
      tasksUnassigned: unassigned.length,
      avgMinutesToComplete: avg,
    }
  }

  /**
   * getStaffPerformance — Métricas de productividad individuales por camarera.
   *
   * Reglas de negocio:
   *  - Solo se incluye personal con rol HOUSEKEEPER (excluye supervisores y recepcionistas).
   *  - Solo se incluye personal activo (active: true).
   *  - Solo se cuentan tareas en estados terminales (DONE, VERIFIED) para el período dado.
   *  - El tiempo promedio excluye tareas sin startedAt o finishedAt (misma lógica que getOverview).
   *
   * Estrategia N+1:
   *  - Las tareas se cargan en la misma query de personal usando una relación anidada con `where`.
   *    Prisma genera un JOIN eficiente en lugar de ejecutar una query por cada miembro del staff.
   *
   * @param propertyId  UUID de la propiedad
   * @param from        Fecha inicio ISO-8601
   * @param to          Fecha fin ISO-8601
   * @returns           Array de objetos con métricas por camarera
   */
  async getStaffPerformance(propertyId: string, from: string, to: string) {
    // Normalizar fechas al rango completo del día
    const fromDate = new Date(from)
    fromDate.setHours(0, 0, 0, 0)
    const toDate = new Date(to)
    toDate.setHours(23, 59, 59, 999)

    // Una sola query carga todo el personal con sus tareas filtradas por período y estado.
    // Ordenar por createdAt asc es útil para posible análisis cronológico futuro.
    const staff = await this.prisma.staff.findMany({
      where: { propertyId, role: StaffRole.HOUSEKEEPER, active: true },
      select: {
        id: true,
        name: true,
        tasks: {
          where: {
            createdAt: { gte: fromDate, lte: toDate },
            // Solo estados terminales: no contabilizar trabajo en progreso
            status: { in: [CleaningStatus.DONE, CleaningStatus.VERIFIED] },
          },
          select: { status: true, startedAt: true, finishedAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    // Mapear cada miembro del staff a su resumen de rendimiento
    return staff.map((s) => {
      // Calcular tiempos individuales en minutos para las tareas con marcas de tiempo completas
      const completionTimes = s.tasks
        .filter((t) => t.startedAt && t.finishedAt)
        .map((t) => (new Date(t.finishedAt!).getTime() - new Date(t.startedAt!).getTime()) / 60000)

      return {
        staffId: s.id,
        staffName: s.name,
        tasksCompleted: s.tasks.length, // Total DONE + VERIFIED en el período
        tasksVerified: s.tasks.filter((t) => t.status === CleaningStatus.VERIFIED).length,
        // null si la persona no tiene ninguna tarea con tiempos registrados
        avgMinutesToComplete: completionTimes.length
          ? Math.round(completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length)
          : null,
      }
    })
  }

  /**
   * getDailyTrend — Serie temporal diaria para gráficos de tendencia.
   *
   * Retorna un punto por cada día del rango, con el conteo de tareas completadas y
   * checkouts del día. Útil para detectar picos de trabajo y correlacionar carga
   * de limpieza con volumen de salidas de huéspedes.
   *
   * Estrategia anti N+1:
   *  - En lugar de ejecutar una query por día (que sería O(días) queries), se hacen
   *    exactamente 2 queries bulk que traen todos los registros del período y luego
   *    se agrupan en memoria usando Map<dateStr, count>.
   *  - La agrupación usa slice(0, 10) sobre toISOString() para obtener "YYYY-MM-DD"
   *    de forma eficiente sin necesidad de formatters externos.
   *
   * Nota: Las tareas se filtran por `finishedAt` (no createdAt) para reflejar el día
   * en que realmente se completó la limpieza, no cuando se creó la tarea.
   *
   * @param propertyId  UUID de la propiedad
   * @param from        Fecha inicio ISO-8601
   * @param to          Fecha fin ISO-8601
   * @returns           Array de { date, completed, checkouts } con un elemento por día
   */
  async getDailyTrend(propertyId: string, from: string, to: string) {
    const fromDate = new Date(from)
    fromDate.setHours(0, 0, 0, 0)
    const toDate = new Date(to)
    toDate.setHours(23, 59, 59, 999)

    // Two bulk queries instead of 2×N per-day queries
    const [taskRows, checkoutRows] = await Promise.all([
      this.prisma.cleaningTask.findMany({
        where: {
          unit: { room: { propertyId } },
          // Filtrar por finishedAt para agrupar por día de finalización real
          finishedAt: { gte: fromDate, lte: toDate },
          status: { in: [CleaningStatus.DONE, CleaningStatus.VERIFIED] },
        },
        // Traer solo finishedAt para minimizar payload de red
        select: { finishedAt: true },
      }),
      this.prisma.checkout.findMany({
        where: {
          room: { propertyId },
          createdAt: { gte: fromDate, lte: toDate },
          cancelled: false,
        },
        select: { createdAt: true },
      }),
    ])

    // Build date-keyed maps in memory — O(n) where n = total records in period
    const tasksByDay = new Map<string, number>()
    for (const t of taskRows) {
      if (!t.finishedAt) continue
      // toISOString().slice(0,10) → "YYYY-MM-DD" en UTC, consistente con el filtro de fechas
      const d = t.finishedAt.toISOString().slice(0, 10)
      tasksByDay.set(d, (tasksByDay.get(d) ?? 0) + 1)
    }
    const checkoutsByDay = new Map<string, number>()
    for (const c of checkoutRows) {
      const d = c.createdAt.toISOString().slice(0, 10)
      checkoutsByDay.set(d, (checkoutsByDay.get(d) ?? 0) + 1)
    }

    // Generate full date range — ensures days with zero activity appear in the output
    // (el frontend necesita puntos para todos los días del rango para graficar líneas continuas)
    const days: { date: string; completed: number; checkouts: number }[] = []
    for (const d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10)
      days.push({
        date: dateStr,
        completed: tasksByDay.get(dateStr) ?? 0,   // 0 si no hubo tareas ese día
        checkouts: checkoutsByDay.get(dateStr) ?? 0, // 0 si no hubo checkouts ese día
      })
    }
    return days
  }

  /**
   * getNoShowReport — Reporte de no-shows para auditoría y seguimiento de ingresos.
   *
   * Propósito:
   *  Proporciona visibilidad completa sobre huéspedes que no se presentaron:
   *  quiénes son, cuánto se cobró, tasa de no-show vs total de reservas,
   *  y distribución por canal de origen (Booking.com vs directo vs walk-in).
   *
   * Fuente de datos:
   *  GuestStay.noShowAt != null — determina que la estadía fue marcada no-show.
   *  El rango (from/to) filtra por noShowAt (cuándo se marcó), no por checkinAt,
   *  para coincidir con la operación de auditoría del período contable.
   *
   * Métricas clave:
   *  - noShowRate: (no-shows / total reservas del período) × 100
   *    Benchmark industria: 5-15% en hoteles urbanos, hasta 25% en hostales con OTA.
   *    Tasa alta indica necesidad de policy más estricta o depósito obligatorio.
   *  - totalFeeRevenue: ingresos COBRADOS — relevante para la conciliación contable.
   *  - totalFeePending: cobros pendientes — requieren seguimiento del recepcionista.
   *  - bySource: distribución por canal para identificar canales de alto riesgo.
   *
   * IMPORTANTE FISCAL (SAT México / DIAN Colombia / SRI Ecuador):
   *  Los registros de noShowFeeAmount + noShowChargeStatus son inmutables en la BD.
   *  Este reporte sirve como soporte para la facturación de cargos de no-show,
   *  que en México deben emitirse como CFDI de ingreso cuando se cobra la primera noche.
   *  La query incluye CHARGED + PENDING para que contabilidad pueda identificar
   *  ingresos devengados (PENDING) vs cobrados (CHARGED).
   */
  async getNoShowReport(propertyId: string, from: string, to: string) {
    const fromDate = new Date(from)
    fromDate.setHours(0, 0, 0, 0)
    const toDate = new Date(to)
    toDate.setHours(23, 59, 59, 999)

    // Dos queries en paralelo: no-shows del período + total de reservas para calcular tasa
    const [noShows, totalStays] = await Promise.all([
      this.prisma.guestStay.findMany({
        where: {
          room: { propertyId },
          noShowAt: { gte: fromDate, lte: toDate },
        },
        select: {
          id:                true,
          guestName:         true,
          checkinAt:         true,
          scheduledCheckout: true,
          noShowAt:          true,
          noShowReason:      true,
          noShowFeeAmount:   true,
          noShowFeeCurrency: true,
          noShowChargeStatus: true,
          noShowById:        true,
          source:            true,
          room: { select: { number: true } },
        },
        orderBy: { noShowAt: 'desc' },
      }),
      // Total de reservas del período (checkin en el rango) para calcular noShowRate
      this.prisma.guestStay.count({
        where: {
          room: { propertyId },
          deletedAt: null,
          checkinAt: { gte: fromDate, lte: toDate },
        },
      }),
    ])

    // Sumar fees por estado de cobro (solo CHARGED y PENDING tienen valor contable)
    let totalCharged  = new Decimal(0)
    let totalPending  = new Decimal(0)
    const sourceCount = new Map<string, number>()

    for (const ns of noShows) {
      const fee    = ns.noShowFeeAmount ?? new Decimal(0)
      const status = ns.noShowChargeStatus

      if (status === 'CHARGED')  totalCharged = totalCharged.add(fee)
      if (status === 'PENDING')  totalPending = totalPending.add(fee)

      const src = ns.source ?? 'DIRECTO'
      sourceCount.set(src, (sourceCount.get(src) ?? 0) + 1)
    }

    const noShowRate = totalStays > 0
      ? Math.round((noShows.length / totalStays) * 1000) / 10  // 1 decimal
      : null

    return {
      from,
      to,
      totalNoShows:    noShows.length,
      noShowRate,
      totalFeeRevenue: totalCharged.toString(),
      totalFeePending: totalPending.toString(),
      bySource: Array.from(sourceCount.entries()).map(([source, count]) => ({ source, count })),
      items: noShows.map((ns) => ({
        id:               ns.id,
        guestName:        ns.guestName,
        roomNumber:       ns.room.number,
        scheduledCheckin: ns.checkinAt.toISOString(),
        scheduledCheckout: ns.scheduledCheckout.toISOString(),
        noShowAt:         ns.noShowAt!.toISOString(),
        noShowReason:     ns.noShowReason,
        feeAmount:        ns.noShowFeeAmount?.toString() ?? null,
        feeCurrency:      ns.noShowFeeCurrency,
        chargeStatus:     ns.noShowChargeStatus,
        source:           ns.source,
        markedById:       ns.noShowById,
      })),
    }
  }

  /**
   * Reporte tabular de No-shows (Estándar de Reportes) — lista auditada operable +
   * export. Filtro de divisa para que el total de cargos sea SUM-able; el listado
   * muestra todas las filas (los cargos en otra divisa no suman al total).
   */
  async buildNoShowReportRows(
    propertyId: string,
    params: { from: string; to: string; currency?: string; status?: string; sort?: string; dir?: string },
  ) {
    const fromDate = new Date(params.from); fromDate.setHours(0, 0, 0, 0)
    const toDate = new Date(params.to); toDate.setHours(23, 59, 59, 999)
    const noShows = await this.prisma.guestStay.findMany({
      where: { room: { propertyId }, noShowAt: { gte: fromDate, lte: toDate } },
      select: {
        id: true, guestName: true, checkinAt: true, noShowAt: true, noShowReason: true,
        noShowFeeAmount: true, noShowFeeCurrency: true, noShowChargeStatus: true, noShowById: true,
        source: true, room: { select: { number: true } },
      },
      orderBy: { noShowAt: 'desc' },
    })
    const availableCurrencies = [...new Set(noShows.map((n) => n.noShowFeeCurrency).filter(Boolean) as string[])].sort()
    const availableStatuses = [...new Set(noShows.map((n) => n.noShowChargeStatus).filter(Boolean) as string[])].sort()
    const currency = params.currency || availableCurrencies[0] || 'MXN'
    const ids = [...new Set(noShows.map((n) => n.noShowById).filter(Boolean) as string[])]
    const staff = ids.length ? await this.prisma.staff.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []
    const nameById = new Map(staff.map((s) => [s.id, s.name]))

    const rows = noShows
      .filter((n) => !params.status || n.noShowChargeStatus === params.status)
      .map((n) => ({
        id: n.id,
        noShowAt: n.noShowAt!.toISOString(),
        guest: n.guestName,
        room: n.room.number,
        scheduledCheckin: n.checkinAt.toISOString(),
        source: n.source ?? 'DIRECTO',
        fee: n.noShowFeeAmount ? Number(n.noShowFeeAmount) : 0,
        feeCurrency: n.noShowFeeCurrency,
        chargeStatus: n.noShowChargeStatus,
        reason: n.noShowReason,
        markedBy: n.noShowById ? nameById.get(n.noShowById) ?? n.noShowById : null,
      }))

    const SORTABLE = ['noShowAt', 'guest', 'room', 'source', 'fee', 'chargeStatus'] as const
    const sortKey = (SORTABLE as readonly string[]).includes(params.sort ?? '') ? (params.sort as (typeof SORTABLE)[number]) : 'noShowAt'
    const dir = params.dir === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      const va = a[sortKey] as string | number | null
      const vb = b[sortKey] as string | number | null
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir
    })
    const fee = Math.round(rows.filter((r) => r.feeCurrency === currency).reduce((s, r) => s + r.fee, 0) * 100) / 100
    return { rows, totals: { count: rows.length, fee }, currency, availableCurrencies, availableStatuses, sort: sortKey, dir: dir === 1 ? 'asc' : 'desc' }
  }

  async getNoShowReportTable(
    propertyId: string,
    params: { from: string; to: string; currency?: string; status?: string; sort?: string; dir?: string; page?: number; pageSize?: number },
  ) {
    const r = await this.buildNoShowReportRows(propertyId, params)
    const page = Math.max(1, params.page ?? 1)
    const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 25))
    return {
      rows: r.rows.slice((page - 1) * pageSize, page * pageSize),
      total: r.rows.length,
      totals: r.totals,
      currency: r.currency,
      availableCurrencies: r.availableCurrencies,
      availableStatuses: r.availableStatuses,
      sort: r.sort,
      dir: r.dir,
      page,
      pageSize,
    }
  }

  /**
   * getStayJourneysReport — Reporte de extensiones de estadía para administración.
   *
   * Fuente de datos: StaySegment WHERE reason IN (EXTENSION_SAME_ROOM, EXTENSION_NEW_ROOM)
   * agrupados por StayJourney. Incluye datos de contacto del GuestStay para
   * exportar a CRM / campañas de marketing.
   *
   * Filtro por fecha: checkIn del segmento de extensión (cuándo comenzó la extensión).
   * Un huésped con múltiples extensiones aparece una sola vez con extensionCount > 1.
   *
   * No incluye ROOM_MOVE segments — esos son cambios de habitación, no extensiones de tiempo.
   */
  async getStayJourneysReport(propertyId: string, from: string, to: string) {
    const fromDate = new Date(`${from}T00:00:00.000Z`)
    const toDate   = new Date(`${to}T23:59:59.999Z`)

    const segments = await this.prisma.staySegment.findMany({
      where: {
        journey: { propertyId },
        reason: { in: [SegmentReason.EXTENSION_SAME_ROOM, SegmentReason.EXTENSION_NEW_ROOM] },
        checkIn: { gte: fromDate, lte: toDate },
      },
      include: {
        journey: {
          include: {
            guestStay: {
              select: {
                guestName: true,
                guestEmail: true,
                guestPhone: true,
                source: true,
                nationality: true,
                currency: true,
              },
            },
          },
        },
        room: { select: { number: true } },
      },
      orderBy: { checkIn: 'desc' },
    })

    // Group by journey — one guest may have extended multiple times
    const byJourney = new Map<string, typeof segments>()
    for (const seg of segments) {
      const list = byJourney.get(seg.journeyId) ?? []
      list.push(seg)
      byJourney.set(seg.journeyId, list)
    }

    const items = Array.from(byJourney.values()).map((segs) => {
      const first = segs[0]
      const gs = first.journey.guestStay
      const extensionNights = segs.reduce((acc, s) => {
        return acc + Math.round((s.checkOut.getTime() - s.checkIn.getTime()) / 86400000)
      }, 0)
      const extensionRevenue = segs.reduce((acc, s) => {
        const nights = Math.round((s.checkOut.getTime() - s.checkIn.getTime()) / 86400000)
        return acc + (s.rateSnapshot ? s.rateSnapshot.toNumber() * nights : 0)
      }, 0)

      return {
        journeyId:      first.journeyId,
        guestName:      gs?.guestName ?? first.journey.guestName,
        guestEmail:     gs?.guestEmail ?? first.journey.guestEmail ?? null,
        guestPhone:     gs?.guestPhone ?? null,
        source:         gs?.source ?? null,
        nationality:    gs?.nationality ?? null,
        currency:       gs?.currency ?? 'USD',
        journeyCheckIn:  first.journey.journeyCheckIn.toISOString(),
        journeyCheckOut: first.journey.journeyCheckOut.toISOString(),
        extensionCount:  segs.length,
        extensionNights,
        extensionRevenue,
        roomNumber:     first.room.number,
      }
    })

    const totalExtensionNights  = items.reduce((a, i) => a + i.extensionNights, 0)
    const totalExtensionRevenue = items.reduce((a, i) => a + i.extensionRevenue, 0)
    const sourceMap = new Map<string, number>()
    for (const item of items) {
      const src = item.source ?? 'DIRECTO'
      sourceMap.set(src, (sourceMap.get(src) ?? 0) + 1)
    }

    return {
      from,
      to,
      summary: {
        totalGuests: items.length,
        totalExtensionNights,
        totalExtensionRevenue,
        avgExtensionNights: items.length
          ? Math.round((totalExtensionNights / items.length) * 10) / 10
          : 0,
        bySource: Array.from(sourceMap.entries()).map(([source, count]) => ({ source, count })),
      },
      items,
    }
  }

  /**
   * Reporte tabular de Estadías extendidas (Estándar de Reportes). Reusa
   * getStayJourneysReport (no duplica la query de segmentos) + pagina/ordena/totaliza.
   * Filtro de divisa para que el ingreso extra sea SUM-able.
   */
  async buildStayReportRows(
    propertyId: string,
    params: { from: string; to: string; currency?: string; source?: string; sort?: string; dir?: string },
  ) {
    const base = await this.getStayJourneysReport(propertyId, params.from, params.to)
    const availableCurrencies = [...new Set(base.items.map((i) => i.currency))].sort()
    const availableSources = [...new Set(base.items.map((i) => i.source ?? 'DIRECTO'))].sort()
    const currency = params.currency || availableCurrencies[0] || 'USD'

    const rows = base.items
      .filter((i) => !params.source || (i.source ?? 'DIRECTO') === params.source)
      .map((i) => ({
        id: i.journeyId,
        guest: i.guestName,
        room: i.roomNumber,
        checkIn: i.journeyCheckIn,
        checkOut: i.journeyCheckOut,
        nights: i.extensionNights,
        revenue: i.extensionRevenue,
        currency: i.currency,
        source: i.source ?? 'DIRECTO',
        contact: i.guestEmail ?? i.guestPhone ?? null,
      }))

    const SORTABLE = ['guest', 'room', 'checkIn', 'nights', 'revenue', 'source'] as const
    const sortKey = (SORTABLE as readonly string[]).includes(params.sort ?? '') ? (params.sort as (typeof SORTABLE)[number]) : 'checkIn'
    const dir = params.dir === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      const va = a[sortKey] as string | number | null
      const vb = b[sortKey] as string | number | null
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir
    })
    const nights = rows.reduce((s, r) => s + r.nights, 0)
    const revenue = Math.round(rows.filter((r) => r.currency === currency).reduce((s, r) => s + r.revenue, 0) * 100) / 100
    return { rows, totals: { count: rows.length, nights, revenue }, currency, availableCurrencies, availableSources, sort: sortKey, dir: dir === 1 ? 'asc' : 'desc' }
  }

  async getStayReportTable(
    propertyId: string,
    params: { from: string; to: string; currency?: string; source?: string; sort?: string; dir?: string; page?: number; pageSize?: number },
  ) {
    const r = await this.buildStayReportRows(propertyId, params)
    const page = Math.max(1, params.page ?? 1)
    const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 25))
    return {
      rows: r.rows.slice((page - 1) * pageSize, page * pageSize),
      total: r.rows.length,
      totals: r.totals,
      currency: r.currency,
      availableCurrencies: r.availableCurrencies,
      availableSources: r.availableSources,
      sort: r.sort,
      dir: r.dir,
      page,
      pageSize,
    }
  }
}
