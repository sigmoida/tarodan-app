-- Preserve legacy admin customizations while moving seeded underscore keys to
-- the canonical kebab-case keys used by the application.
WITH key_map(old_key, new_key) AS (
  VALUES
    ('email_verification', 'email-verification'),
    ('password_reset', 'password-reset'),
    ('order_placed', 'order-confirmation'),
    ('order_shipped', 'order-shipped'),
    ('offer_received', 'offer-received'),
    ('trade_request', 'trade-received'),
    ('payout_sent', 'payout-released-seller')
)
UPDATE email_templates AS canonical
SET
  name = legacy.name,
  subject = legacy.subject,
  body_html = legacy.body_html,
  variables_json = legacy.variables_json,
  updated_at = NOW()
FROM email_templates AS legacy
JOIN key_map ON key_map.old_key = legacy.key
WHERE canonical.key = key_map.new_key
  AND canonical.body_html = ''
  AND legacy.body_html <> '';

WITH key_map(old_key, new_key) AS (
  VALUES
    ('email_verification', 'email-verification'),
    ('password_reset', 'password-reset'),
    ('order_placed', 'order-confirmation'),
    ('order_shipped', 'order-shipped'),
    ('offer_received', 'offer-received'),
    ('trade_request', 'trade-received'),
    ('payout_sent', 'payout-released-seller')
)
UPDATE email_templates AS legacy
SET key = key_map.new_key, updated_at = NOW()
FROM key_map
WHERE legacy.key = key_map.old_key
  AND NOT EXISTS (
    SELECT 1
    FROM email_templates AS canonical
    WHERE canonical.key = key_map.new_key
  );

DELETE FROM email_templates
WHERE key IN (
  'email_verification',
  'password_reset',
  'order_placed',
  'order_shipped',
  'offer_received',
  'trade_request',
  'payout_sent'
);
