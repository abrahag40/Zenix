/**
 * Reception Hub — Sprint 8I.
 *
 * Renders the ReservationListScreen as the default work surface for
 * users in the RECEPTION department. AD-011 "shared chrome + role-aware
 * module": this Hub IS the role-specific module the "Mi día" tab swaps
 * in for RECEPTION.
 *
 * Why the indirection through `reception/screens/Hub`:
 *   - Keeps the router file (app/(app)/trabajo.tsx) generic and tiny —
 *     it only needs to switch on `department`, not know about
 *     reservation-specific concerns.
 *   - If V1.1 adds a shift dashboard above the list (turno actual,
 *     llegadas próximas como widget), we extend this Hub without
 *     touching navigation.
 *
 * The web PMS already owns the timeline calendar and the heavyweight
 * check-in/checkout flows. The mobile Hub is the receptionist's
 * operational radar: search, list, quick actions.
 */

import { ReservationListScreen } from '../../reservations/screens/ReservationListScreen'

export function ReceptionHub() {
  return <ReservationListScreen />
}
