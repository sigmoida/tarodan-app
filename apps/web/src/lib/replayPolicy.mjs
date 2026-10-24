import { sentrySampling } from "@tarodan/logger";

import { isPaymentPath } from "./cspPolicy.mjs";

/**
 * Where Sentry Session Replay may run: the single source.
 *
 * WHY: with the PayTR Direct API the card number and CVV are collected on our
 * page, which brings the payment page into PCI DSS 4.0 6.4.3 scope: EVERY
 * script on it must be inventoried and justified. Replay with its default
 * masking (`maskAllText`/`maskAllInputs`) does not record card data, but there
 * is no defensible reason to keep a DOM-recording script on the card page;
 * never starting the recording removes both the surface and the audit burden.
 *
 * TWO LAYERS: (1) the sample rates are zeroed at init (a user who lands
 * directly on the payment URL never gets replay set up), (2) the route guard
 * stops a running recording when the page is entered by SPA navigation.
 */

/**
 * May replay record on this path? An unknown pathname (server) means yes: the
 * recording only ever starts in the browser, and the route guard covers the
 * card page.
 */
export function shouldRecordReplay(pathname) {
  if (typeof pathname !== "string") return true;
  return !isPaymentPath(pathname);
}

/**
 * Sample rates for Sentry.init: the environment's row of the shared table
 * (`@tarodan/logger`), zeroed on payment pages.
 */
export function replaySampleRates(pathname, environment) {
  if (!shouldRecordReplay(pathname)) {
    return { replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 0 };
  }
  const { replaysSessionSampleRate, replaysOnErrorSampleRate } =
    sentrySampling(environment);
  return { replaysSessionSampleRate, replaysOnErrorSampleRate };
}
