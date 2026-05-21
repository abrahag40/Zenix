-- ═══════════════════════════════════════════════════════════════════════
-- Sprint LEARNING-CORE 2026-05-21 — Zenix Learning (LMS Add-On/DLC)
-- ═══════════════════════════════════════════════════════════════════════
-- Schema: 14 modelos + 8 enums. Fuzzy search via pg_trgm.
-- Doc: docs/zenix-learning/04-architecture-plan.md
-- ═══════════════════════════════════════════════════════════════════════

-- Extensión pg_trgm para fuzzy search del catálogo (doc 04 §4 + top complaint #1 doc 03)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "LearningCourseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "LearningCourseTier" AS ENUM ('CORE', 'PRO', 'MARKETPLACE', 'CUSTOM', 'GIFT');

-- CreateEnum
CREATE TYPE "LearningLessonType" AS ENUM ('HTML5_NATIVE', 'VIDEO_MP4', 'AUDIO_MP3', 'PDF_DOCUMENT', 'SCORM_12', 'SCORM_2004', 'XAPI_PACKAGE', 'CMI5_AU');

-- CreateEnum
CREATE TYPE "LearningEnrollmentStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LearningAssessmentResult" AS ENUM ('PASSED', 'FAILED', 'IN_PROGRESS', 'ABANDONED');

-- CreateEnum
CREATE TYPE "LearningCertificateType" AS ENUM ('ZENIX_INTERNAL', 'STPS_DC3', 'AHLEI_ALIGNED', 'EXTERNAL_PARTNER');

-- CreateEnum
CREATE TYPE "LearningContentLanguage" AS ENUM ('ES_MX', 'ES_419', 'EN_US', 'PT_BR');

-- CreateEnum
CREATE TYPE "LearningCourseCategory" AS ENUM ('COMPLIANCE_LEGAL', 'COMPLIANCE_SANITATION', 'FRONT_OFFICE', 'HOUSEKEEPING', 'FOOD_BEVERAGE', 'REVENUE_MANAGEMENT', 'LEADERSHIP', 'SAFETY_SECURITY', 'GUEST_SERVICE', 'TECHNOLOGY');

-- CreateTable
CREATE TABLE "learning_courses" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "brand_id" TEXT,
    "legal_entity_id" TEXT,
    "property_id" TEXT,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "short_description" VARCHAR(280) NOT NULL,
    "long_description" TEXT,
    "category" "LearningCourseCategory" NOT NULL,
    "tier" "LearningCourseTier" NOT NULL DEFAULT 'CORE',
    "language" "LearningContentLanguage" NOT NULL DEFAULT 'ES_MX',
    "status" "LearningCourseStatus" NOT NULL DEFAULT 'DRAFT',
    "content_version" TEXT NOT NULL DEFAULT '1.0.0',
    "published_at" TIMESTAMP(3),
    "retired_at" TIMESTAMP(3),
    "certificate_type" "LearningCertificateType" NOT NULL DEFAULT 'ZENIX_INTERNAL',
    "stps_registered_at" TIMESTAMP(3),
    "stps_agent_code" TEXT,
    "recertification_months" INTEGER,
    "estimated_hours" DECIMAL(5,2) NOT NULL,
    "bloom_levels" TEXT[],
    "prerequisites" TEXT[],
    "passing_score" DECIMAL(5,2) NOT NULL DEFAULT 75.00,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "retake_wait_hours" INTEGER NOT NULL DEFAULT 48,
    "is_gift_eligible" BOOLEAN NOT NULL DEFAULT false,
    "thumbnail_url" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,

    CONSTRAINT "learning_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_modules" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "estimated_minutes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_lessons" (
    "id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "type" "LearningLessonType" NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "content_json" JSONB,
    "audio_url" TEXT,
    "video_url" TEXT,
    "pdf_url" TEXT,
    "transcript_text" TEXT,
    "external_package_url" TEXT,
    "external_package_manifest" JSONB,
    "external_lrs_endpoint" TEXT,
    "quiz_pool_size" INTEGER,
    "quiz_pool_json" JSONB,
    "is_optional" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_assessments" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "question_bank" JSONB NOT NULL,
    "questions_per_attempt" INTEGER NOT NULL DEFAULT 40,
    "duration_minutes" INTEGER NOT NULL DEFAULT 60,
    "shuffle_questions" BOOLEAN NOT NULL DEFAULT true,
    "shuffle_options" BOOLEAN NOT NULL DEFAULT true,
    "show_result_detail" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_enrollments" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "legal_entity_id" TEXT,
    "property_id" TEXT,
    "status" "LearningEnrollmentStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enrolled_by_id" TEXT,
    "enrollment_reason" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "total_time_spent_minutes" INTEGER NOT NULL DEFAULT 0,
    "final_score" DECIMAL(5,2),
    "attempts_used" INTEGER NOT NULL DEFAULT 0,
    "certificate_id" TEXT,
    "content_version_pin" TEXT NOT NULL DEFAULT '1.0.0',

    CONSTRAINT "learning_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_lesson_progress" (
    "id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "time_spent_seconds" INTEGER NOT NULL DEFAULT 0,
    "bookmark_position" INTEGER,

    CONSTRAINT "learning_lesson_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_attempts" (
    "id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "lesson_id" TEXT,
    "attempt_number" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    "questions_asked" JSONB NOT NULL,
    "answers_given" JSONB NOT NULL,
    "questions_correct" INTEGER NOT NULL DEFAULT 0,
    "questions_total" INTEGER NOT NULL DEFAULT 0,
    "score_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "result" "LearningAssessmentResult" NOT NULL DEFAULT 'IN_PROGRESS',

    CONSTRAINT "learning_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_enrollment_logs" (
    "id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "metadata" JSONB,
    "actor_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_enrollment_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_certificates" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "legal_entity_id" TEXT,
    "type" "LearningCertificateType" NOT NULL,
    "serial_number" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "dc3_registro_stps" TEXT,
    "dc3_instructor_nombre" TEXT,
    "dc3_instructor_curp" TEXT,
    "dc3_horas_totales" DECIMAL(5,2),
    "dc3_lugar_fecha" JSONB,
    "dc3_certificado_pdf_url" TEXT,
    "dc3_verification_url" TEXT NOT NULL,

    CONSTRAINT "learning_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_assignment_rules" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "legal_entity_id" TEXT,
    "property_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "match_role" TEXT[],
    "match_department" TEXT[],
    "match_property_type" TEXT[],
    "match_hire_date_after" TIMESTAMP(3),
    "match_hire_date_before" TIMESTAMP(3),
    "course_id" TEXT NOT NULL,
    "enroll_within_days" INTEGER NOT NULL DEFAULT 0,
    "deadline_days" INTEGER,
    "last_run_at" TIMESTAMP(3),
    "total_enrolled_by_this_rule" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,

    CONSTRAINT "learning_assignment_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_badges" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon_url" TEXT,
    "category" TEXT NOT NULL,
    "condition_json" JSONB NOT NULL,

    CONSTRAINT "learning_badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_badge_awards" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "badge_id" TEXT NOT NULL,
    "awarded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "context" JSONB,

    CONSTRAINT "learning_badge_awards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_streaks" (
    "staff_id" TEXT NOT NULL,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "longest_streak" INTEGER NOT NULL DEFAULT 0,
    "last_active_date" DATE,
    "gamification_opt_in" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "learning_streaks_pkey" PRIMARY KEY ("staff_id")
);

-- CreateTable
CREATE TABLE "learning_preferences" (
    "staff_id" TEXT NOT NULL,
    "preferred_language" "LearningContentLanguage" NOT NULL DEFAULT 'ES_MX',
    "audio_first" BOOLEAN NOT NULL DEFAULT false,
    "email_reminders" BOOLEAN NOT NULL DEFAULT true,
    "push_reminders" BOOLEAN NOT NULL DEFAULT true,
    "weekly_digest_day" TEXT NOT NULL DEFAULT 'MONDAY',
    "reminder_hour_local" INTEGER NOT NULL DEFAULT 9,
    "receive_peer_nudges" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "learning_preferences_pkey" PRIMARY KEY ("staff_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "learning_courses_slug_key" ON "learning_courses"("slug");

-- CreateIndex
CREATE INDEX "learning_courses_organization_id_status_idx" ON "learning_courses"("organization_id", "status");

-- CreateIndex
CREATE INDEX "learning_courses_category_tier_status_idx" ON "learning_courses"("category", "tier", "status");

-- CreateIndex
CREATE INDEX "learning_courses_legal_entity_id_idx" ON "learning_courses"("legal_entity_id");

-- CreateIndex
CREATE INDEX "learning_courses_slug_idx" ON "learning_courses"("slug");

-- CreateIndex
CREATE INDEX "learning_modules_course_id_idx" ON "learning_modules"("course_id");

-- CreateIndex
CREATE UNIQUE INDEX "learning_modules_course_id_order_key" ON "learning_modules"("course_id", "order");

-- CreateIndex
CREATE INDEX "learning_lessons_module_id_idx" ON "learning_lessons"("module_id");

-- CreateIndex
CREATE UNIQUE INDEX "learning_lessons_module_id_order_key" ON "learning_lessons"("module_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "learning_assessments_course_id_key" ON "learning_assessments"("course_id");

-- CreateIndex
CREATE UNIQUE INDEX "learning_enrollments_certificate_id_key" ON "learning_enrollments"("certificate_id");

-- CreateIndex
CREATE INDEX "learning_enrollments_staff_id_status_idx" ON "learning_enrollments"("staff_id", "status");

-- CreateIndex
CREATE INDEX "learning_enrollments_legal_entity_id_status_idx" ON "learning_enrollments"("legal_entity_id", "status");

-- CreateIndex
CREATE INDEX "learning_enrollments_property_id_status_idx" ON "learning_enrollments"("property_id", "status");

-- CreateIndex
CREATE INDEX "learning_enrollments_expires_at_idx" ON "learning_enrollments"("expires_at");

-- CreateIndex
CREATE INDEX "learning_enrollments_completed_at_idx" ON "learning_enrollments"("completed_at");

-- CreateIndex
CREATE UNIQUE INDEX "learning_enrollments_staff_id_course_id_content_version_pin_key" ON "learning_enrollments"("staff_id", "course_id", "content_version_pin");

-- CreateIndex
CREATE INDEX "learning_lesson_progress_enrollment_id_idx" ON "learning_lesson_progress"("enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "learning_lesson_progress_enrollment_id_lesson_id_key" ON "learning_lesson_progress"("enrollment_id", "lesson_id");

-- CreateIndex
CREATE INDEX "learning_attempts_enrollment_id_attempt_number_idx" ON "learning_attempts"("enrollment_id", "attempt_number");

-- CreateIndex
CREATE INDEX "learning_attempts_lesson_id_idx" ON "learning_attempts"("lesson_id");

-- CreateIndex
CREATE INDEX "learning_enrollment_logs_enrollment_id_occurred_at_idx" ON "learning_enrollment_logs"("enrollment_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "learning_certificates_serial_number_key" ON "learning_certificates"("serial_number");

-- CreateIndex
CREATE INDEX "learning_certificates_staff_id_type_idx" ON "learning_certificates"("staff_id", "type");

-- CreateIndex
CREATE INDEX "learning_certificates_legal_entity_id_issued_at_idx" ON "learning_certificates"("legal_entity_id", "issued_at");

-- CreateIndex
CREATE INDEX "learning_certificates_serial_number_idx" ON "learning_certificates"("serial_number");

-- CreateIndex
CREATE INDEX "learning_assignment_rules_organization_id_is_active_idx" ON "learning_assignment_rules"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "learning_badges_code_key" ON "learning_badges"("code");

-- CreateIndex
CREATE INDEX "learning_badge_awards_staff_id_idx" ON "learning_badge_awards"("staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "learning_badge_awards_staff_id_badge_id_key" ON "learning_badge_awards"("staff_id", "badge_id");

-- AddForeignKey
ALTER TABLE "learning_courses" ADD CONSTRAINT "learning_courses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_courses" ADD CONSTRAINT "learning_courses_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_courses" ADD CONSTRAINT "learning_courses_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_courses" ADD CONSTRAINT "learning_courses_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_courses" ADD CONSTRAINT "learning_courses_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "housekeeping_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_modules" ADD CONSTRAINT "learning_modules_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "learning_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_lessons" ADD CONSTRAINT "learning_lessons_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "learning_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_assessments" ADD CONSTRAINT "learning_assessments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "learning_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_enrollments" ADD CONSTRAINT "learning_enrollments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "learning_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_enrollments" ADD CONSTRAINT "learning_enrollments_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "housekeeping_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_enrollments" ADD CONSTRAINT "learning_enrollments_enrolled_by_id_fkey" FOREIGN KEY ("enrolled_by_id") REFERENCES "housekeeping_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_enrollments" ADD CONSTRAINT "learning_enrollments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_enrollments" ADD CONSTRAINT "learning_enrollments_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_enrollments" ADD CONSTRAINT "learning_enrollments_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_enrollments" ADD CONSTRAINT "learning_enrollments_certificate_id_fkey" FOREIGN KEY ("certificate_id") REFERENCES "learning_certificates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_lesson_progress" ADD CONSTRAINT "learning_lesson_progress_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "learning_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_lesson_progress" ADD CONSTRAINT "learning_lesson_progress_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "learning_lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_attempts" ADD CONSTRAINT "learning_attempts_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "learning_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_attempts" ADD CONSTRAINT "learning_attempts_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "learning_lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_enrollment_logs" ADD CONSTRAINT "learning_enrollment_logs_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "learning_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_enrollment_logs" ADD CONSTRAINT "learning_enrollment_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "housekeeping_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_certificates" ADD CONSTRAINT "learning_certificates_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "housekeeping_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_certificates" ADD CONSTRAINT "learning_certificates_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_assignment_rules" ADD CONSTRAINT "learning_assignment_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_assignment_rules" ADD CONSTRAINT "learning_assignment_rules_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_assignment_rules" ADD CONSTRAINT "learning_assignment_rules_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_assignment_rules" ADD CONSTRAINT "learning_assignment_rules_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "learning_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_assignment_rules" ADD CONSTRAINT "learning_assignment_rules_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "housekeeping_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_badge_awards" ADD CONSTRAINT "learning_badge_awards_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "housekeeping_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_badge_awards" ADD CONSTRAINT "learning_badge_awards_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "learning_badges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_streaks" ADD CONSTRAINT "learning_streaks_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "housekeeping_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_preferences" ADD CONSTRAINT "learning_preferences_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "housekeeping_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ═══════════════════════════════════════════════════════════════════════
-- Índices GIN trigram para fuzzy search del catálogo (doc 04 §4)
-- Soporta búsqueda tipo "distintvo h" (typo) o "limpieza profun" (partial)
-- ═══════════════════════════════════════════════════════════════════════
CREATE INDEX "learning_courses_title_trgm_idx" ON "learning_courses" USING gin (title gin_trgm_ops);
CREATE INDEX "learning_courses_short_description_trgm_idx" ON "learning_courses" USING gin (short_description gin_trgm_ops);
