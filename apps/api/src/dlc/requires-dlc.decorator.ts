import { SetMetadata } from '@nestjs/common'
import { DLCCode } from '@prisma/client'

export const REQUIRES_DLC_KEY = 'requiresDlc'

/**
 * @RequiresDLC — protege un endpoint contra acceso sin DLC activo.
 *
 * Si el actor.organizationId no tiene status=ACTIVE para este DLC,
 * DLCGuard retorna 402 Payment Required con mensaje accionable
 * "Activa Zenix Learning desde Settings > Add-Ons" (§142).
 *
 * Combina con @Public (orden de decorators no importa — guard chequea ambos):
 *   @Public()                          // bypass auth
 *   @RequiresDLC('LEARNING_CORE')      // pero requiere DLC (raro)
 *
 * Endpoints sin @RequiresDLC NO requieren DLC (default permisivo). Esto
 * preserva el principio "feature flag opt-in" — solo gates explícitos.
 *
 * Ejemplos:
 *   @RequiresDLC('LEARNING_CORE')      // GET /v1/learning/courses
 *   @RequiresDLC('LEARNING_CORE')      // POST /v1/learning/enrollments
 *   @RequiresDLC('LEARNING_PRO')       // POST /v1/learning/lessons/scorm/import (Fase 2)
 *
 * Excepciones intencionales (NO usar @RequiresDLC):
 *   - GET /v1/learning/certificates/:serial (verificación pública §131 —
 *     el auditor STPS debe validar QR aunque cliente ya canceló DLC)
 */
export const RequiresDLC = (dlcCode: DLCCode) => SetMetadata(REQUIRES_DLC_KEY, dlcCode)
