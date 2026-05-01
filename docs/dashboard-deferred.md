# Dashboard — Features Deferred & Backlog Notes

> Tracking deferrals from the dashboard redesign passes (Sprint 8I) so
> nothing falls through the cracks when prioritizing future sprints.

---

## 1. Deferred dashboard cards (code kept, wiring removed)

User feedback (this sprint): *"considerar [SpecialRequests + Approvals]
para un sprint de mejoras no escenciales"*. Both components and their
routes remain in the codebase, ready to re-enable.

### `SpecialRequestsCard`

- **Component:** `apps/mobile/src/features/dashboard/components/SpecialRequestsCard.tsx`
- **Screen:** `apps/mobile/src/features/special-requests/screens/SpecialRequestsListScreen.tsx`
- **Route:** `apps/mobile/app/(app)/special-requests.tsx`
- **Mocks:** `MOCK_SPECIAL_REQUESTS` in `mockDashboard.ts`

**To re-enable on the dashboard:**
1. Re-add the import in `app/(app)/index.tsx`
2. Re-add the rendering block (Capa 2 — ACTION)
3. Sprint 9: build backend endpoint `GET /v1/special-requests/pending`

**Notes for whoever picks this up:**
- 11 request types already enumerated (OCEAN_VIEW, EXTRA_BED, …)
- Privacy enforced: HK does NOT see guest names
- Backend table needed: `GuestRequest { id, stayId, type, description, priority, fulfilledAt, fulfilledById }`
- Real customer ask: 44× mentions in PMS reviews. Worth doing.

### `PendingApprovalsCard`

- **Component:** `apps/mobile/src/features/dashboard/components/PendingApprovalsCard.tsx`
- **Screens:** `apps/mobile/src/features/approvals/screens/ApprovalsList + Detail Screen.tsx`
- **Routes:** `apps/mobile/app/(app)/approvals/{index,[id]}.tsx`
- **Mocks:** `MOCK_APPROVALS` in `mockDashboard.ts`

**To re-enable:**
1. Re-add import + rendering block (Capa 2 — SUPERVISOR/ADMIN only)
2. Sprint 9: build backend approval pipeline (`POST /v1/approvals/:id/approve`, `POST :id/reject`)
3. Backend table: `ApprovalRequest { id, kind, title, subline, amountAmount, requestedById, resolvedById, resolvedAt, resolution: APPROVED|REJECTED }`

---

## 2. Web-app block approval gap (CRITICAL — flagged by user)

**User report:** *"No tenemos forma de aprobar las solicitudes de los
bloqueos desde la webapp (cuando lo requiere)"*

**Current state:**
- Backend has `RoomBlock` model with `requestedById` and `approvedById` columns
- Mobile has `BlockedRoomsCard` + detail screen for VIEWING blocks
- **Web has NO UI for approving block requests**
- Mobile also lacks the approval action (only shows blocks already approved)

**Gap analysis:**
- A receptionist or supervisor can request a block (currently only via direct DB or Maintenance module)
- There's no review UI where a supervisor sees pending requests and approves/rejects
- The schema supports it; the workflow doesn't have screens

**Recommended fix (next sprint):**
1. Add `RoomBlock.status` enum: `PENDING | APPROVED | REJECTED | ACTIVE | RELEASED`
2. Backend endpoints:
   - `POST /v1/room-blocks/request` — user requests with reason + dates
   - `POST /v1/room-blocks/:id/approve` — approver accepts
   - `POST /v1/room-blocks/:id/reject` — approver rejects with reason
3. Web UI: `apps/web/src/pages/admin/PendingBlocksPage.tsx` with approve/reject inline
4. Mobile: integrate into the deferred `PendingApprovalsCard` (kind `BLOCK_REQUEST`)
5. Notification: `notification:block_pending_approval` SSE → bell badge

**Estimated effort:** 1-2 days (schema migration + 4 endpoints + 1 web screen + 1 mobile chip).

---

## 3. KPI policy cleanup

Removed in this pass (no longer surface as small KPI cards):
- `checkinsReceived` — redundant with `MovementsCard`
- `checkoutsPending` (afternoon/evening) — was in old morning slot

The constants stay in `KpiKey` union for compatibility but aren't picked
by `pickKpis()` anymore. If a Sprint 9 wants to bring them back as
secondary stats, they're available.

---

## 4. ArrivalsTimelineCard removed (replaced)

User feedback: *"no entendí la gráfica, removerla"*. The horizontal
density timeline was removed; the card became `MovementsCard` with
tabs Llegadas | Salidas.

**Code removal note:** the file `ArrivalsTimelineCard.tsx` is still in
the components folder as **deprecated**. Not imported anywhere on the
dashboard. Safe to delete in any cleanup pass — keeping it for one
sprint in case the timeline visualization is wanted in another context
(e.g., the calendar week footer).

---

## 5. Deferred mocks

These mocks are in `mockDashboard.ts` but no longer consumed:
- `MOCK_SPECIAL_REQUESTS`
- `MOCK_APPROVALS`
- `MOCK_UPCOMING_ARRIVALS` (replaced by `MOCK_TODAY_ARRIVALS` + `MOCK_TODAY_DEPARTURES`)

Safe to delete in Sprint 9 cleanup, OR keep until the deferred features
are reactivated.
