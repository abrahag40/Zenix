import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { JwtPayload } from '@zenix/shared'
import { PrismaService } from '../../prisma/prisma.service'

export interface UpsertProgressDto {
  lessonId: string
  enrollmentId: string
  bookmarkPosition?: number
  timeSpentDeltaSeconds?: number
  completed?: boolean
}

/**
 * LessonsService — entrega de contenido + tracking de progreso.
 *
 * Tracking modelo:
 *   - LearningLessonProgress {enrollmentId, lessonId} unique → upsert
 *   - timeSpentSeconds acumula (no replace) — `timeSpentDeltaSeconds` se agrega
 *   - bookmarkPosition reemplaza al último valor reportado
 *   - completed=true marca completedAt
 *
 * TODO Fase 1.2: cuando todas las lecciones (no opcionales) están completedAt,
 * el sistema sugiere abrir el examen final (assessment).
 */
@Injectable()
export class LessonsService {
  private readonly logger = new Logger(LessonsService.name)

  constructor(private readonly prisma: PrismaService) {}

  async getLesson(id: string, actor: JwtPayload) {
    const lesson = await this.prisma.learningLesson.findUnique({
      where: { id },
      include: {
        module: {
          select: {
            id: true,
            title: true,
            order: true,
            courseId: true,
            course: { select: { id: true, slug: true, title: true } },
          },
        },
      },
    })
    if (!lesson) throw new NotFoundException(`Lesson not found: ${id}`)

    // Auth: el actor debe tener un enrollment activo para ese curso
    const enrollment = await this.prisma.learningEnrollment.findFirst({
      where: {
        staffId: actor.sub,
        courseId: lesson.module.courseId,
        status: { in: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'] },
      },
    })
    if (!enrollment) {
      throw new ForbiddenException('No tienes un enrollment activo para este curso')
    }

    return { ...lesson, enrollmentId: enrollment.id }
  }

  async upsertProgress(dto: UpsertProgressDto, actor: JwtPayload) {
    const enrollment = await this.prisma.learningEnrollment.findUnique({
      where: { id: dto.enrollmentId },
      select: { id: true, staffId: true, status: true, courseId: true },
    })
    if (!enrollment) throw new NotFoundException(`Enrollment not found: ${dto.enrollmentId}`)
    if (enrollment.staffId !== actor.sub) {
      throw new ForbiddenException('No puedes registrar progreso de otro staff')
    }

    const existing = await this.prisma.learningLessonProgress.findUnique({
      where: { enrollmentId_lessonId: { enrollmentId: dto.enrollmentId, lessonId: dto.lessonId } },
    })

    const result = await this.prisma.$transaction(async (tx) => {
      const upserted = await tx.learningLessonProgress.upsert({
        where: {
          enrollmentId_lessonId: { enrollmentId: dto.enrollmentId, lessonId: dto.lessonId },
        },
        create: {
          enrollmentId: dto.enrollmentId,
          lessonId: dto.lessonId,
          startedAt: new Date(),
          timeSpentSeconds: dto.timeSpentDeltaSeconds ?? 0,
          bookmarkPosition: dto.bookmarkPosition,
          completedAt: dto.completed ? new Date() : null,
        },
        update: {
          timeSpentSeconds:
            (existing?.timeSpentSeconds ?? 0) + (dto.timeSpentDeltaSeconds ?? 0),
          bookmarkPosition: dto.bookmarkPosition ?? existing?.bookmarkPosition,
          completedAt: dto.completed && !existing?.completedAt ? new Date() : existing?.completedAt,
        },
      })

      // Si esta es la primera lección abierta + enrollment está NOT_STARTED → marca IN_PROGRESS
      if (enrollment.status === 'NOT_STARTED') {
        await tx.learningEnrollment.update({
          where: { id: enrollment.id },
          data: { status: 'IN_PROGRESS', startedAt: new Date() },
        })
      }

      // Log si se completó la lección
      if (dto.completed && !existing?.completedAt) {
        await tx.learningEnrollmentLog.create({
          data: {
            enrollmentId: enrollment.id,
            event: 'LESSON_COMPLETED',
            metadata: { lessonId: dto.lessonId },
            actorId: actor.sub,
          },
        })
      }

      return upserted
    })

    return result
  }
}
