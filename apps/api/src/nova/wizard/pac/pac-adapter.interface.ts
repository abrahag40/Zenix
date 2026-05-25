/**
 * IPacAdapter — Strategy pattern para emisión CFDI/factura electrónica
 * per país (§89 D-89).
 *
 * Day 19: scaffolding del pattern + Facturama adapter sandbox-shaped.
 * Adapters reales (con SDK / HTTP a sandbox del PAC) se enable cuando
 * el cliente contrata el PAC y configura credentials en LegalEntity.
 *
 * Países cubiertos por el pattern:
 *   · MX → MxFacturamaAdapter / MxSwSapienAdapter (CFDI 4.0)
 *   · CO → CoDianAdapter (UBL 2.1)
 *   · CR → CrHaciendaAdapter (Tribu-CR)
 *   · PE → PeSunatAdapter (FE)
 *
 * Naming: PAC = Proveedor Autorizado de Certificación (México).
 * Aunque el término es MX-específico, generalizamos a "FiscalAdapter"
 * en docs/vision/14 — código mantiene "PacAdapter" por consistencia
 * con el wizard UI que dice "PAC adapter" (el consultor lo conoce así).
 */

export interface PacCredentials {
  /** Adapter id, e.g. 'MX_FACTURAMA' | 'MX_SW_SAPIEN' | 'CO_DIAN'. */
  adapter: string
  /** Country code ISO 3166-1 — debe coincidir con LegalEntity.countryCode. */
  countryCode: string
  /** Credentials raw (encrypted at-rest v1.1+). Day 19: plain JSON in DB. */
  config: Record<string, unknown>
  /** Indica si las credenciales están configuradas (vs placeholder Day 16). */
  configured: boolean
}

export interface PacHealthCheckResult {
  /** success → PAC sandbox respondió correcto al test stamp.
   *  warning → PAC no contratado / credenciales placeholder.
   *  error   → PAC contratado pero rechazó (credenciales inválidas, suspendido). */
  status: 'success' | 'warning' | 'error'
  message: string
  latencyMs: number
  /** Detail seguro para mostrar al consultor — no leak credentials. */
  detail?: Record<string, unknown>
}

export interface PacAdapterMetadata {
  id: string // 'MX_FACTURAMA', 'CO_DIAN', etc.
  countryCode: string
  displayName: string
  /** URL pública del proveedor PAC — útil en UI errors copy ("contrata acá"). */
  providerHomepage: string
  /** ¿Implementado o stub Day 19? */
  implementationStatus: 'STUB' | 'SANDBOX' | 'PRODUCTION'
}

/**
 * Interface canónica. Cada adapter implementa estos 3 métodos:
 *
 *   1. healthCheck() — para Step 7 del wizard. Verifica que el sandbox
 *      del PAC responde con las credenciales del cliente.
 *   2. metadata() — meta info (display + status). Síncrono.
 *   3. stampInvoice() — Day 20+ wirea la emisión real de CFDI.
 *      Reservado para v1.0.2 CFDI-CORE sprint.
 */
export interface IPacAdapter {
  metadata(): PacAdapterMetadata

  /**
   * Health check pre-activación + post-onboarding.
   * Best-effort: nunca throws — siempre devuelve PacHealthCheckResult con
   * status correcto. Error de red / API caída → status='error' con message.
   */
  healthCheck(credentials: PacCredentials | null): Promise<PacHealthCheckResult>
}
