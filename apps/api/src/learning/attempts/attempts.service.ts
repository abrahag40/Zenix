import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { LearningAssessmentResult, LearningEnrollmentStatus, Prisma } from '@prisma/client'
import { JwtPayload } from '@zenix/shared'
import { PrismaService } from '../../prisma/prisma.service'

export interface StartAttemptDto {
  enrollmentId: string
  lessonId?: string // null = examen final del curso
}

export interface SubmitAttemptDto {
  answers: Array<{ questionId: string; selectedOptionIdx: number | number[] }>
}

/**
 * AttemptsService — quiz por lección + examen final del curso.
 *
 * Server-side scoring (anti-cheat — doc 04 §7):
 *   - El cliente NUNCA recibe las respuestas correctas hasta submit
 *   - El pool se shufflea per intento (questions + options)
 *   - La snapshot questionsAsked + answersGiven es audit-grade (append-only)
 *
 * Lifecycle:
 *   1. start(): server selecciona N preguntas del pool (`questionsPerAttempt`),
 *      shuffles, las persiste como `questionsAsked`. Devuelve al cliente
 *      sin `correct` flags.
 *   2. submit(): cliente envía respuestas. Server scoring contra el snapshot
 *      original. Marca PASSED/FAILED. Si es examen final + PASSED → marca
 *      enrollment COMPLETED + emite certificado.
 *
 * Re-take policy:
 *   - max `course.maxAttempts` attempts (default 3)
 *   - espera `course.retakeWaitHours` (default 48h) entre intentos
 *
 * TODO Fase 1.2: SM-2 SRS para quiz de lección (intervalos espaciados de
 * repaso). Doc 07 §4.
 * TODO Fase 1.2: ELO adaptive — ajustar dificultad del próximo item según
 * acierto/fallo (doc 07 §7 Flow). Para Fase 1: shuffle uniform random.
 */
@Injectable()
export class AttemptsService {
  private readonly logger = new Logger(AttemptsService.name)

  constructor(private readonly prisma: PrismaService) {}

  async start(dto: StartAttemptDto, actor: JwtPayload) {
    const enrollment = await this.prisma.learningEnrollment.findUnique({
      where: { id: dto.enrollmentId },
      include: {
        course: { select: { id: true, passingScore: true, maxAttempts: true, retakeWaitHours: true } },
      },
    })
    if (!enrollment) throw new NotFoundException(`Enrollment not found: ${dto.enrollmentId}`)
    if (enrollment.staffId !== actor.sub) {
      throw new ForbiddenException('No autorizado para este enrollment')
    }
    if (enrollment.status === 'COMPLETED') {
      throw new ConflictException('Este curso ya está completado')
    }
    if (enrollment.status === 'EXPIRED') {
      throw new ConflictException('Enrollment expirado — re-inscríbete para recertificación')
    }

    // Re-take guards (solo para examen final)
    const isFinalExam = !dto.lessonId
    if (isFinalExam) {
      if (enrollment.attemptsUsed >= enrollment.course.maxAttempts) {
        throw new ConflictException(
          `Has usado tus ${enrollment.course.maxAttempts} intentos. Solicita un refresher a tu supervisor.`,
        )
      }
      const lastAttempt = await this.prisma.learningAttempt.findFirst({
        where: { enrollmentId: dto.enrollmentId, lessonId: null, submittedAt: { not: null } },
        orderBy: { submittedAt: 'desc' },
      })
      if (lastAttempt?.submittedAt) {
        const hoursSince = (Date.now() - lastAttempt.submittedAt.getTime()) / (60 * 60 * 1000)
        if (hoursSince < enrollment.course.retakeWaitHours) {
          const waitMore = enrollment.course.retakeWaitHours - hoursSince
          throw new ConflictException(
            `Espera ${waitMore.toFixed(1)} h antes del siguiente intento (espera obligatoria).`,
          )
        }
      }
    }

    // Cargar question pool
    let pool: Array<{ id: string; q: string; options: string[]; correct: number | number[] }> = []
    let questionsPerAttempt = 1
    if (isFinalExam) {
      const assessment = await this.prisma.learningAssessment.findUnique({
        where: { courseId: enrollment.courseId },
      })
      if (!assessment) throw new NotFoundException('Course has no final assessment configured')
      pool = (assessment.questionBank as Prisma.JsonArray) as unknown as typeof pool
      questionsPerAttempt = assessment.questionsPerAttempt
    } else {
      const lesson = await this.prisma.learningLesson.findUnique({
        where: { id: dto.lessonId! },
      })
      if (!lesson || !lesson.quizPoolJson) {
        throw new NotFoundException('Lesson has no quiz pool')
      }
      pool = (lesson.quizPoolJson as Prisma.JsonArray) as unknown as typeof pool
      questionsPerAttempt = lesson.quizPoolSize ?? pool.length
    }

    if (pool.length === 0) {
      throw new BadRequestException('Quiz pool vacío')
    }

    // Shuffle + sample (Fisher-Yates)
    const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, questionsPerAttempt)
    // Shuffle options dentro de cada pregunta — server tracking del mapeo
    const questionsAsked = shuffled.map((q) => {
      const optionOrder = q.options.map((_, idx) => idx).sort(() => Math.random() - 0.5)
      return {
        id: q.id,
        q: q.q,
        options: optionOrder.map((idx) => q.options[idx]),
        // Mapeo correcto: index en el shuffle → index original
        // Persistimos `correctMapped` para scoring server-side, NUNCA devuelto al cliente
        correctMapped: Array.isArray(q.correct)
          ? q.correct.map((c) => optionOrder.indexOf(c))
          : optionOrder.indexOf(q.correct),
      }
    })

    const attemptNumber = await this.prisma.learningAttempt.count({
      where: { enrollmentId: dto.enrollmentId, lessonId: dto.lessonId ?? null },
    })

    const attempt = await this.prisma.learningAttempt.create({
      data: {
        enrollmentId: dto.enrollmentId,
        lessonId: dto.lessonId ?? null,
        attemptNumber: attemptNumber + 1,
        questionsAsked,
        answersGiven: [],
        questionsTotal: questionsAsked.length,
        result: LearningAssessmentResult.IN_PROGRESS,
      },
    })

    // Devuelve al cliente SIN correctMapped (anti-cheat)
    return {
      attemptId: attempt.id,
      questionsTotal: questionsAsked.length,
      questions: questionsAsked.map((q) => ({ id: q.id, q: q.q, options: q.options })),
      startedAt: attempt.startedAt,
    }
  }

  async submit(attemptId: string, dto: SubmitAttemptDto, actor: JwtPayload) {
    const attempt = await this.prisma.learningAttempt.findUnique({
      where: { id: attemptId },
      include: {
        enrollment: { include: { course: true } },
      },
    })
    if (!attempt) throw new NotFoundException(`Attempt not found: ${attemptId}`)
    if (attempt.enrollment.staffId !== actor.sub) {
      throw new ForbiddenException('No autorizado para este intento')
    }
    if (attempt.submittedAt) {
      throw new ConflictException('Este intento ya fue enviado')
    }

    // Server scoring contra snapshot
    const questionsAsked = attempt.questionsAsked as Array<{
      id: string
      correctMapped: number | number[]
    }>
    const answersByQid = new Map(dto.answers.map((a) => [a.questionId, a.selectedOptionIdx]))

    let correct = 0
    for (const q of questionsAsked) {
      const given = answersByQid.get(q.id)
      if (given === undefined) continue // unanswered = wrong
      const correctIdx = q.correctMapped
      if (Array.isArray(correctIdx)) {
        // multi-correct: requiere match exacto del set
        const givenSet = new Set(Array.isArray(given) ? given : [given])
        const expectedSet = new Set(correctIdx)
        if (givenSet.size === expectedSet.size && [...givenSet].every((x) => expectedSet.has(x))) {
          correct++
        }
      } else {
        if (given === correctIdx) correct++
      }
    }

    const scorePct = (correct / questionsAsked.length) * 100
    const passingScore = Number(attempt.enrollment.course.passingScore)
    const passed = scorePct >= passingScore
    const isFinalExam = !attempt.lessonId

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.learningAttempt.update({
        where: { id: attemptId },
        data: {
          submittedAt: new Date(),
          durationSeconds: Math.round((Date.now() - attempt.startedAt.getTime()) / 1000),
          answersGiven: dto.answers,
          questionsCorrect: correct,
          scorePct,
          result: passed ? LearningAssessmentResult.PASSED : LearningAssessmentResult.FAILED,
        },
      })

      await tx.learningEnrollmentLog.create({
        data: {
          enrollmentId: attempt.enrollmentId,
          event: 'ATTEMPT_SUBMITTED',
          metadata: { attemptId, lessonId: attempt.lessonId, scorePct, passed, isFinalExam },
          actorId: actor.sub,
        },
      })

      // Examen final aprobado → COMPLETED + flag para emisión de certificado
      if (isFinalExam) {
        await tx.learningEnrollment.update({
          where: { id: attempt.enrollmentId },
          data: {
            attemptsUsed: { increment: 1 },
            finalScore: scorePct,
            status: passed
              ? LearningEnrollmentStatus.COMPLETED
              : attempt.enrollment.attemptsUsed + 1 >= attempt.enrollment.course.maxAttempts
                ? LearningEnrollmentStatus.FAILED
                : attempt.enrollment.status,
            completedAt: passed ? new Date() : null,
          },
        })

        if (passed) {
          await tx.learningEnrollmentLog.create({
            data: {
              enrollmentId: attempt.enrollmentId,
              event: 'PASSED',
              metadata: { scorePct, finalAttempt: attempt.attemptNumber },
              actorId: actor.sub,
            },
          })
          // TODO Fase 1.0 D4: certificate generation via CertificatesService
        } else if (attempt.enrollment.attemptsUsed + 1 >= attempt.enrollment.course.maxAttempts) {
          await tx.learningEnrollmentLog.create({
            data: {
              enrollmentId: attempt.enrollmentId,
              event: 'FAILED',
              metadata: { scorePct, exhaustedAttempts: true },
              actorId: actor.sub,
            },
          })
        }
      }

      return updated
    })

    return {
      attemptId: result.id,
      scorePct,
      questionsCorrect: correct,
      questionsTotal: questionsAsked.length,
      passed,
      result: result.result,
    }
  }
}
