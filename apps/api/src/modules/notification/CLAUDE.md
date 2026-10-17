# Notification module

Bell (in-app), push (Expo), e-mail and SMS for end users, plus admin alarms.
API rules: [apps/api/CLAUDE.md](../../../CLAUDE.md). Staff mail routing is a
separate module (`modules/mail-routing/`, `docs/MAIL_ROUTING.md`).

## Shape

- `notification.service.ts` is a thin facade with stable signatures; it only
  delegates.
- `notification-dispatch.service.ts` is the engine: `send()` (multi-channel),
  `createInAppNotification()` (bell row + realtime emit + push),
  `notifyAllAdmins()` / `notifyAllAdminsOnce()`, bell reads, template e-mails,
  push firing and draining, push-token registration.
- `notification-commerce.service.ts` (order, offer, trade, back-in-stock) and
  `notification-account.service.ts` (welcome, password reset, e-mail
  verification) build payloads and call dispatch.
- `providers/expo-push.provider.ts` is the only push send core (dispatch and
  `src/workers/push.worker.ts` both use it). `push-token/` is a leaf module
  (Prisma only) to break the Security -> WebSocket -> Notification cycle.

## Single sources

- `helpers/notification-templates.ts`: type -> catalog keys
  (`server.notification.<type>.title|message`). Copy is always a catalog key.
- `helpers/notification-link.ts`: every type's deep link
  (`Record<NotificationType, ...>`, so a new type fails to compile without one).
  Links depend on the type and `data.audience` (buyer/seller), never on free
  data; a link with an unresolved `{{...}}` is never stored. Link safety goes
  through `isSafeNotificationLink` (`@tarodan/types`).
- `helpers/notification-preferences.ts`: gating (`shouldDeliver`), used by
  dispatch and the push worker alike.
- `helpers/push-delivery.ts`: Android channel per type (`default`, `orders`,
  `trades`, `messages`; must match the mobile channel ids), token checks, batch
  sizes and timeouts.

## Producing a notification

- **Lossless notices go through the outbox.** A user-visible notice whose loss
  matters is an outbox row written in the event's transaction; the handler
  calls the notifier after commit (e.g. `trade/lifecycle/trade-party-notice.service.ts`).
  One outbox row = one recipient and one channel. The notifier **throws** when
  nothing was delivered (so only that row retries) and does **not** throw when
  there is nothing to send (user missing, category muted, no provider).
- **Never send from inside a business transaction.** This module opens no
  transaction of its own around sends.
- Use `createInAppNotification(..., { pushRequiresRecord: true })` when the push
  must follow a saved bell row (retries then push exactly once).
- The direct path writes the bell row, emits realtime and fires the push
  without awaiting Expo. That loss is accepted on purpose: a queued push would
  never leave a `PROCESS_ROLE=web` instance without a worker.
- The bell row is written only by `saveInAppNotification`; `logNotification`
  ignores `in_app` (a second row would show twice). `NEW_MESSAGE` collapses per
  thread instead of stacking.

## Gating

- A category toggle off suppresses every channel, bell included. Channel
  masters (`pushNotifications`, `emailNotifications`, `smsNotifications`) apply
  per channel; muted push still leaves bell and realtime.
- `ALWAYS_SEND` types (password reset, e-mail verification, welcome, system
  announcement, seller application results, transactional `admin_broadcast`)
  bypass preferences. Admin alarm types cannot be muted by category.
- Marketing consent has one source: `User.acceptsMarketingEmails`. Every send
  path passes the column; the JSON setting is never trusted alone.
- Guest orders: bell and push reach the shared system user, so e-mail must go to
  the real address from the shipping address (`helpers/order-buyer-contact.ts`).

## Push

- Expo tickets with `DeviceNotRegistered` deactivate the token; OK tickets
  schedule a receipt check (`PUSH_RECEIPT_JOB`, 15 min). Credential and
  oversize errors log distinct `error` lines (they become Sentry alerts).
- Token registration: one Expo token = one device (other users' rows are
  deactivated in the same transaction); banned or deleted owners get 403;
  revoke works without a session. Session revocation and bans call
  `PushTokenRevocationService.deactivateAllForUser` in the same transaction.
- iOS badge = unread bell count.

## E-mail and copy

- Bell and push render in the recipient's `User.preferredLanguage` (fallback
  `defaultLocale`). Template e-mails load the DB `emailTemplate` by key
  (`common/email/email-template-registry.ts`) and send through `SmtpProvider`.
- Durations in copy are read from "Süreler ve Kurallar" at send time
  (`docs/TIMING_RULES.md`); never hardcode "14 gün".
- Staff/internal notices are `MailInternalNotifier.emit` (mail-routing), called
  after commit; staff mails never carry national id, IBAN, full address or
  message bodies.

## Admin alarms

`notifyAllAdmins` never throws and isolates per-admin failures.
`notifyAllAdminsOnce(key, ttl, ...)` deduplicates cron alarms through the cache
and returns whether the alarm is new (choose the log level from it).

## Changes visible to mobile

Push payload shape, `data` fields, `audience`, deep links and channel ids are
part of the mobile contract: add a hub contract delta (tarodan-ops:
`contracts/README.md`).

## Tests

Specs pin the invariants; run the ones you touch with `--maxWorkers=2`:
`notification-gating`, `notification-push-async`,
`notification-push-requires-record`, `notification-admin-fanout`,
`notification-audience-producers`, `helpers/notification-link`,
`notification-timing-copy`, `notification-trade-platform-cancel`,
`providers/expo-push.provider`, `push-token/push-token-revocation`,
`src/workers/push.worker`.
