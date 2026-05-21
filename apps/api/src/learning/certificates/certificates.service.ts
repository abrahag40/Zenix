import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { LearningCertificateType } from '@prisma/client'
import { JwtPayload } from '@zenix/shared'
import { PrismaService } from '../../prisma/prisma.service'

/**
 * CertificatesService — emisión + verificación pública de certificados.
 *
 * §131 (reservado) — serialNumber format: ZNX-LRN-{yyyy}-{NNNNNN}
 * §130 (reservado) — PDF DC-3 generated ONLY al COMPLETED, nunca antes.
 *
 * Verificación pública SIN auth — auditor STPS valida con QR sin credenciales.
 *
 * TODO Fase 1.0 D4: implementar `generateDC3Pdf(enrollment)`:
 *   - Layout oficial STPS (validar con consultor legal)
 *   - Datos requeridos: razón social (LegalEntity), trabajador (Staff +
 *     CURP/RFC), curso (LearningCourse + horas), instructor (configurable),
 *     fecha + lugar (Property.address)
 *   - QR con verificationUrl embebido
 *   - Generación async vía BullMQ queue (puppeteer pesado)
 *   - URL final guardado en certificate.dc3CertificadoPdfUrl
 */
@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Emite certificado tras enrollment COMPLETED. Idempotente: si ya existe,
   * devuelve el existente (no duplica).
   */
  async issueForEnrollment(enrollmentId: string, actor: JwtPayload | null = null) {
    const enrollment = await this.prisma.learningEnrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        course: {
          select: {
            id: true,
            slug: true,
            title: true,
            certificateType: true,
            estimatedHours: true,
            recertificationMonths: true,
            stpsAgentCode: true,
          },
        },
        certificate: true,
      },
    })
    if (!enrollment) throw new NotFoundException(`Enrollment not found: ${enrollmentId}`)
    if (enrollment.status !== 'COMPLETED') {
      throw new Error(`Cannot issue certificate for non-COMPLETED enrollment (status=${enrollment.status})`)
    }
    if (enrollment.certificate) return enrollment.certificate

    // §131: serial number con prefix ZNX-LRN-{yyyy}-{NNNNNN}
    const year = new Date().getFullYear()
    const seq = await this.prisma.learningCertificate.count({
      where: { issuedAt: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } },
    })
    const serialNumber = `ZNX-LRN-${year}-${String(seq + 1).padStart(6, '0')}`

    const verificationUrl = `https://verify.zenix.com/cert/${serialNumber}`

    const expiresAt = enrollment.course.recertificationMonths
      ? new Date(Date.now() + enrollment.course.recertificationMonths * 30 * 24 * 60 * 60 * 1000)
      : null

    const certificate = await this.prisma.$transaction(async (tx) => {
      const created = await tx.learningCertificate.create({
        data: {
          staffId: enrollment.staffId,
          courseId: enrollment.courseId,
          legalEntityId: enrollment.legalEntityId,
          type: enrollment.course.certificateType,
          serialNumber,
          expiresAt,
          dc3HorasTotales: enrollment.course.estimatedHours,
          dc3VerificationUrl: verificationUrl,
          // TODO Fase 1.0 D4: poblar dc3InstructorNombre, dc3InstructorCURP,
          // dc3LugarFecha, dc3CertificadoPdfUrl con render PDF
        },
      })

      await tx.learningEnrollment.update({
        where: { id: enrollmentId },
        data: { certificateId: created.id },
      })

      await tx.learningEnrollmentLog.create({
        data: {
          enrollmentId,
          event: 'CERTIFICATE_ISSUED',
          metadata: { serialNumber, type: created.type },
          actorId: actor?.sub ?? null,
        },
      })

      return created
    })

    this.logger.log(
      `Certificate issued: ${serialNumber} (staff=${enrollment.staffId} course=${enrollment.course.slug})`,
    )
    return certificate
  }

  /**
   * Verificación PÚBLICA sin auth. Auditor STPS escanea QR → llega acá.
   * §131 (reservado): este endpoint NO debe requerir credenciales.
   */
  async verifyBySerial(serialNumber: string) {
    const cert = await this.prisma.learningCertificate.findUnique({
      where: { serialNumber },
      include: {
        staff: { select: { id: true, name: true } },
        legalEntity: { select: { id: true, name: true, taxId: true } },
        enrollments: {
          include: {
            course: { select: { id: true, title: true, contentVersion: true } },
          },
          take: 1,
        },
      },
    })
    if (!cert) throw new NotFoundException(`Certificate not found: ${serialNumber}`)

    // Devolver solo data audit-grade (sin PII innecesaria)
    return {
      serialNumber: cert.serialNumber,
      type: cert.type,
      issuedAt: cert.issuedAt,
      expiresAt: cert.expiresAt,
      isExpired: cert.expiresAt ? cert.expiresAt < new Date() : false,
      staffName: cert.staff.name,
      legalEntityName: cert.legalEntity?.name ?? null,
      legalEntityTaxId: cert.legalEntity?.taxId ?? null,
      courseTitle: cert.enrollments[0]?.course.title ?? '—',
      courseContentVersion: cert.enrollments[0]?.course.contentVersion ?? '—',
      hoursTotal: cert.dc3HorasTotales ? Number(cert.dc3HorasTotales) : null,
      pdfUrl: cert.dc3CertificadoPdfUrl,
    }
  }
}
