/**
 * Activation email templates.
 *
 * El template del setup link (activation) vive actualmente inline en
 * apps/api/src/nova/wizard/activation-email.service.ts. Refactor pendiente:
 * mover el HTML/text generation aquí, dejando el service como wrapper que
 * llama a `renderActivationEmail({...})`.
 *
 * Tracker: TODO Day 9 — refactor activation-email.service.ts a usar este
 * folder pattern.
 */

// export { renderActivationEmail } from './activation' (pendiente)
export {}
