-- At most ONE active refund request per order.
--
-- The "already has an active request" check was read-then-create with no database
-- constraint, so two concurrent submissions (a double-click across tabs) both
-- passed and both froze the seller hold. The 10-minute cron then opened TWO Surat
-- return shipments, and the second request could never finalize because the
-- cumulative per-order refund cap rejected it — leaving a stuck request that
-- retried forever until an admin closed it.
--
-- Partial unique index over the active statuses only, so a new request may still be
-- opened after a previous one reaches refunded / rejected / cancelled.
CREATE UNIQUE INDEX IF NOT EXISTS "refund_requests_order_id_active_key"
  ON "refund_requests" ("order_id")
  WHERE "status" IN (
    'pending_review',
    'approved',
    'wait_for_delivery',
    'return_shipment_open',
    'return_in_transit',
    'return_delivered',
    'disputed'
  );
