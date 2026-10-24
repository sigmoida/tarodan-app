import type { SentryService } from "../../sentry/sentry.service";

/** The Sentry tag of a boost request (purchase start, admin actions). */
export const BOOST_SENTRY_TAG = { key: "flow", value: "boost" } as const;

/**
 * Ids only: never a name, an e-mail, a listing's text or an amount. The
 * package and the duration name what was chosen (the price follows from
 * them and the tier).
 */
export interface BoostTraceIds {
  boostId?: string | null;
  orderId?: string | null;
  orderNumber?: string | null;
  productId?: string | null;
  packageId?: string | null;
  durationDays?: number | null;
}

type BoostSentry = Pick<SentryService, "setTag" | "addBreadcrumb">;

/**
 * Tags the current request `flow=boost`. Only on an HTTP request path: a
 * request has its own Sentry isolation scope, while a worker job (crons,
 * queues) shares the process scope, where the tag would stick to every later,
 * unrelated error. Code that also runs in jobs leaves breadcrumbs only.
 */
export function tagBoostRequest(sentry: BoostSentry | undefined): void {
  sentry?.setTag(BOOST_SENTRY_TAG.key, BOOST_SENTRY_TAG.value);
}

/**
 * Leaves the breadcrumb `boost.<step>` (category `boost`) with the ids that
 * are known, so an error later in the same request or job is traceable to the
 * boost and its order without personal data. Safe in any role. No-op without
 * Sentry (narrow test harnesses).
 */
export function boostBreadcrumb(
  sentry: BoostSentry | undefined,
  step: string,
  ids: BoostTraceIds,
): void {
  sentry?.addBreadcrumb({
    category: "boost",
    message: `boost.${step}`,
    level: "info",
    data: Object.fromEntries(
      Object.entries(ids).filter(([, value]) => value != null),
    ),
  });
}
