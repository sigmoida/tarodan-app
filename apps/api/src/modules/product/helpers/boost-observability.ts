import type { SentryService } from "../../sentry/sentry.service";

/** The Sentry tag of every boost flow (purchase, activation, admin). */
export const BOOST_SENTRY_TAG = { key: "flow", value: "boost" } as const;

/** Ids only: never a name, an e-mail or a listing's text. */
export interface BoostTraceIds {
  boostId?: string | null;
  orderId?: string | null;
  orderNumber?: string | null;
  productId?: string | null;
}

/**
 * Marks the current Sentry scope as the boost flow (`flow=boost`) and leaves
 * the breadcrumb `boost.<step>` with the ids that are known, so an error later
 * in the same request or job is traceable to the boost and its order without
 * personal data. No-op without Sentry (narrow test harnesses).
 */
export function traceBoost(
  sentry: Pick<SentryService, "setTag" | "addBreadcrumb"> | undefined,
  step: string,
  ids: BoostTraceIds,
): void {
  if (!sentry) return;
  sentry.setTag(BOOST_SENTRY_TAG.key, BOOST_SENTRY_TAG.value);
  sentry.addBreadcrumb({
    category: "boost",
    message: `boost.${step}`,
    level: "info",
    data: Object.fromEntries(
      Object.entries(ids).filter(([, value]) => value != null),
    ),
  });
}
