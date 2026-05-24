-- Sprint CHANNEX-UX-E2-E3 §150 — add BOOKING_CANCEL kind to outbound queue
-- so manual cancels from PMS propagate to Channex via PUT /bookings/:id status=cancelled.
ALTER TYPE "ChannexOutboundKind" ADD VALUE 'BOOKING_CANCEL';
