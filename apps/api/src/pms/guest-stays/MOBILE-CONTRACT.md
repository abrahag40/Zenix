# Mobile Reservation Endpoints — Sprint 9 Contract

> Contract spec for the two mobile-facing endpoints that the
> `ReservationListScreen` and `ReservationDetailScreen` (apps/mobile)
> will consume. Sprint 8I uses mock data; this file is the
> authoritative contract for Sprint 9 wiring.

---

## Privacy / Role Redaction (Non-negotiable)

Both endpoints below return DTOs **redacted by actor role**:

| Field                 | RECEPTION / ADMIN | SUPERVISOR (HK) | HOUSEKEEPER / MAINT. / etc. |
|-----------------------|-------------------|------------------|-----------------------------|
| `guestName`           | full              | full             | `"Hab. <num>"` placeholder  |
| `guestEmail`          | full              | redacted (null)  | redacted (null)             |
| `guestPhone`          | full              | redacted (null)  | redacted (null)             |
| `nationality`         | full              | full             | redacted (null)             |
| `documentType`        | full              | redacted (null)  | redacted (null)             |
| `documentNumberMasked`| `***1234`         | redacted (null)  | redacted (null)             |
| `notes`               | full              | full             | redacted (null)             |
| `arrivalNotes`        | full              | full             | full (operational)          |
| `payments`, `totalAmount`, `amountPaid` | full | redacted (null)  | redacted (null)             |
| `roomNumber`, `unitLabel`, `status`, `checkinAt`, `scheduledCheckout`, `paxCount` | always present (operational) |||
| `isRedacted` flag     | `false`           | `true` (partial) | `true`                      |

**Where it's enforced:** `GuestStaysService.toMobileDto(stay, actor)` —
single function. Controller never builds DTO directly. Defense in depth:
even if a malicious deep-link reaches the detail endpoint with a HK
token, the API redacts before serialization. The mobile screen shows the
"Tu rol no permite ver datos personales" hint when `isRedacted === true`.

---

## Endpoint 1 — List

```
GET /v1/guest-stays/mobile/list
  ?from=YYYY-MM-DD          (default: today in property tz)
  &to=YYYY-MM-DD            (default: from + 7d)
  &search=<string>          (optional; matches guestName, roomNumber, id)
  &dateFilter=today|tomorrow|week|all
```

**Response:**
```ts
{
  total: number
  items: ReservationListItem[]    // shape: apps/mobile/.../reservations/types.ts
}
```

**Implementation notes:**
- Uses Postgres trgm index on `lower(guestName)` for fuzzy search
- Date filter is computed in property timezone (CLAUDE.md §14)
- `arrivesToday` / `departsToday` flags computed per actor's view
  of "today" (property tz, not server tz)
- `dateRangeLabel` is server-formatted in `es-MX` for the property tz —
  the client never does timezone math
- For HOUSEKEEPER role: returns only stays with active CleaningTask
  for the actor's scope; `guestName` replaced with `"Hab. {number}"`
- Sorted by: `arrivesToday DESC, status priority, checkinAt ASC`

**Cache:** React Query staleTime=60s. Server invalidates via SSE
`reservation:changed` event.

---

## Endpoint 2 — Detail

```
GET /v1/guest-stays/mobile/:id
```

**Response:**
```ts
ReservationDetail   // extends ReservationListItem; full schema in types.ts
```

**Implementation notes:**
- Includes `payments[]` (PaymentLog ordered by collectedAt DESC)
- Includes `history[]` from StayJourneyEvent + custom synthesized rows
  (created, OTA imported, etc.)
- Pre-formatted relative + absolute timestamps (`hace 2h`, `26 abr 21:42`)
- `documentNumberMasked`: server enmascares (last 4 chars only) per
  CLAUDE.md PII rules
- 404 when stay belongs to a different property than `actor.propertyId`
  (prevents cross-property enumeration)

---

## Endpoint 3 — Mutations (Sprint 9+)

The following actions are surfaced by `BottomActionBar` (mobile) and
must reuse the existing service methods from the web flow (no
re-implementation):

| Mobile button       | Backend service method                          |
|--------------------|-------------------------------------------------|
| Confirmar check-in | `GuestStaysService.confirmCheckin(...)`         |
| Marcar no-show     | `GuestStaysService.markAsNoShow(...)` + 20:00 guard (CLAUDE.md §36) |
| Revertir no-show   | `GuestStaysService.revertNoShow(...)` (48h window) |
| Check-out          | `GuestStaysService.checkout(...)`               |
| Salida anticipada  | `GuestStaysService.earlyCheckout(...)`          |

All mutations:
- Require explicit confirmation modal in mobile (CLAUDE.md §32)
- Emit SSE for cross-client sync
- Log to `StayJourneyEvent` for audit trail
- Mobile shows toast on success/failure (CLAUDE.md §33)

---

## Implementation order

1. `toMobileDto(stay, actor)` helper in `guest-stays.service.ts` (with unit
   tests for each role — table-driven)
2. `findForMobileList(actor, query)` service method
3. `getForMobileDetail(actor, id)` service method
4. Controller routes (`@Get('mobile/list')`, `@Get('mobile/:id')`)
   — declared **before** `@Get(':id')` (route order!)
5. Mobile API client replaces mock data calls in
   `apps/mobile/.../reservations/api/useReservations.ts`
