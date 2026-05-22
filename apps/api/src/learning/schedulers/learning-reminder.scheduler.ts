import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { LearningEnrollmentStatus } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationCenterService } from '../../notification-center/notification-center.service'

/**
 * LearningReminderScheduler — push reminders contextuales para learners.
 *
 * Objetivo: minimizar alert fatigue (§136 max 2/día) emitiendo solo los
 * reminders relevantes (curso por vencer + curso pendiente sin avanzar).
 *
 * 2 tipos de reminder:
 *   1. EXPIRY_WARNING — cert vence en 7/3/1 días. Compliance bloqueante,
 *      NUNCA silenciable por preferencia (§dictado por LFT 153-U).
 *   2. PENDING_REMINDER — staff no ha tocado un curso asignado en 7+ días.
 *      Respeta LearningPreferences.pushReminders=false (opt-out).
 *
 * Cron: diario 9:00 AM America/Mexico_City — pegado al patrón típico de
 * inicio de turno hostelero (housekeeping 7 AM, recepción 8 AM, supervisores
 * 9 AM). Timing inteligente doc 07 §9.
 *
 * Consolidación: si un staff tiene >1 pending, emite UNA sola notif
 * "Tienes N cursos pendientes — N min para vencer" (no 5 notifs separadas).
 *
 * Decisión §149-ext: tracking inteligente vía LearningEnrollment.expiresAt +
 * comparación con today para warning levels. Sin necesidad de columna extra
 * "lastReminderSentAt" — usamos AppNotification.metadata.kind = 'expiry_7d'
 * etc. y query "ya existe notif con kind X y enrollmentId Y creada hoy".
 * Idempotencia natural sin nuevo schema.
 */
@Injectable()
export class LearningReminderScheduler {
  private readonly logger = new Logger(LearningReminderScheduler.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly notif: NotificationCenterService,
  ) {}

  /**
   * Cron diario 9:00 AM CST. Idempotente — corre 2x el mismo día y no duplica.
   * No usa try/catch wrapping global; cada per-staff loop tiene su propio
   * try/catch fail-soft.
   */
  @Cron('0 9 * * *', { name: 'learning-reminders', timeZone: 'America/Mexico_City' })
  async run() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000)

    // ─── (1) Expiry warnings: enrollments con expiresAt entre 1-7 días ───
    const expiringSoon = await this.prisma.learningEnrollment.findMany({
      where: {
        status: { in: [LearningEnrollmentStatus.NOT_STARTED, LearningEnrollmentStatus.IN_PROGRESS] },
        expiresAt: {
          gte: today,
          lt: new Date(today.getTime() + 8 * 24 * 60 * 60 * 1000),
        },
      },
      include: {
        course: { select: { id: true, title: true, slug: true } },
        staff: { select: { id: true, name: true, active: true, learningPreferences: true } },
        property: { select: { id: true } },
      },
    })

    let expirySent = 0
    for (const e of expiringSoon) {
      if (!e.staff.active) continue
      const daysUntil = Math.ceil(
        (e.expiresAt!.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
      )

      // Solo enviamos en milestones específicos: 7d, 3d, 1d (no spam diario)
      const milestone = daysUntil === 7 ? '7d' : daysUntil === 3 ? '3d' : daysUntil === 1 ? '1d' : null
      if (!milestone) continue

      // Idempotencia: ¿ya envié esta misma notif hoy?
      const existing = await this.prisma.appNotification.findFirst({
        where: {
          category: 'LEARNING_EXPIRY_WARNING',
          recipientId: e.staff.id,
          createdAt: { gte: today, lt: tomorrow },
          metadata: { path: ['enrollmentId'], equals: e.id },
        },
      })
      if (existing) continue

      try {
        await this.notif.send({
          type: 'INFORMATIONAL',
          category: 'LEARNING_EXPIRY_WARNING',
          priority: daysUntil <= 1 ? 'HIGH' : daysUntil <= 3 ? 'MEDIUM' : 'LOW',
          title:
            daysUntil === 1
              ? `⚠ Tu certificación vence MAÑANA`
              : `Tu certificación vence en ${daysUntil} días`,
          body: `${e.course.title} — completa el examen antes de ${e.expiresAt!.toLocaleDateString('es-MX')}`,
          actionUrl: `/learning/courses/${e.course.slug}`,
          recipientType: 'USER',
          recipientId: e.staff.id,
          propertyId: e.property?.id ?? null,
          metadata: {
            enrollmentId: e.id,
            courseId: e.course.id,
            milestone,
            daysUntil,
            kind: `expiry_${milestone}`,
          },
        })
        expirySent++
      } catch (err) {
        this.logger.warn(
          `LearningReminderScheduler: failed sending expiry to staff ${e.staff.id}: ${(err as Error).message}`,
        )
      }
    }

    // ─── (2) Pending reminders consolidados ─────────────────────────────
    // Enrollments NOT_STARTED + no expiring soon (cubierto arriba) + asignados
    // hace ≥7 días. Si un staff tiene >1, consolidamos en UNA notif (§136).
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)

    const pendingEnrollments = await this.prisma.learningEnrollment.findMany({
      where: {
        status: LearningEnrollmentStatus.NOT_STARTED,
        enrolledAt: { lte: sevenDaysAgo },
        enrollmentReason: { in: ['ASSIGNED_BY_MANAGER', 'ASSIGNMENT_RULE'] },
      },
      include: {
        course: { select: { id: true, title: true } },
        staff: {
          select: { id: true, name: true, active: true, learningPreferences: true },
        },
        property: { select: { id: true } },
      },
    })

    // Group by staffId
    const byStaff = new Map<string, typeof pendingEnrollments>()
    for (const e of pendingEnrollments) {
      if (!e.staff.active) continue
      // Respeta opt-out de pushReminders (§136 + §132 paridad opt-in)
      const prefs = e.staff.learningPreferences
      if (prefs && prefs.pushReminders === false) continue
      const group = byStaff.get(e.staff.id) ?? []
      group.push(e)
      byStaff.set(e.staff.id, group)
    }

    let pendingSent = 0
    for (const [staffId, group] of byStaff) {
      // Idempotencia: 1 notif PENDING_REMINDER por día por staff
      const existing = await this.prisma.appNotification.findFirst({
        where: {
          category: 'LEARNING_REMINDER',
          recipientId: staffId,
          createdAt: { gte: today, lt: tomorrow },
        },
      })
      if (existing) continue

      const first = group[0]
      try {
        await this.notif.send({
          type: 'INFORMATIONAL',
          category: 'LEARNING_REMINDER',
          priority: 'LOW',
          title:
            group.length === 1
              ? 'Tienes un curso pendiente'
              : `Tienes ${group.length} cursos pendientes`,
          body:
            group.length === 1
              ? `${first.course.title} — empezar ahora toma 5 min`
              : `Empieza por: ${first.course.title}`,
          actionUrl: '/learning',
          recipientType: 'USER',
          recipientId: staffId,
          propertyId: first.property?.id ?? null,
          metadata: {
            pendingCount: group.length,
            enrollmentIds: group.map((e) => e.id),
            kind: 'pending_consolidated',
          },
        })
        pendingSent++
      } catch (err) {
        this.logger.warn(
          `LearningReminderScheduler: failed sending pending to staff ${staffId}: ${(err as Error).message}`,
        )
      }
    }

    if (expirySent > 0 || pendingSent > 0) {
      this.logger.log(
        `LearningReminderScheduler: ${expirySent} expiry warnings + ${pendingSent} pending reminders enviados`,
      )
    }
  }

  /** Manual trigger para testing — no expuesto via REST. */
  async runNow() {
    return this.run()
  }
}
