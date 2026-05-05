/**
 * Route: /reservation/[id]
 *
 * Hidden from the tab bar — pushed via router.push from
 * ReservationListScreen when a card is tapped.
 *
 * Privacy: this route is technically reachable by any authenticated
 * user via deep link. Defense in depth lives at the API layer (DTO
 * redaction by role); the screen renders whatever the API returns.
 */

import { ReservationDetailScreen } from '../../../src/features/reservations/screens/ReservationDetailScreen'

export default ReservationDetailScreen
