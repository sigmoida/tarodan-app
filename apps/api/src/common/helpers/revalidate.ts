import { Logger } from "@nestjs/common";

/** The web app's on-demand revalidation route (`apps/web/src/app/api/revalidate`). */
export const WEB_REVALIDATE_PATH = "/api/revalidate";

const logger = new Logger("WebRevalidate");

/**
 * Resolves `WEB_REVALIDATE_URL` to the revalidation endpoint. The variable may be
 * the web origin (`https://tarodan.com.tr`, as `.env.example` shows) or the full
 * endpoint (`…/api/revalidate`): a bare origin (no path or `/`) gets the route
 * appended. Before this, a bare origin was POSTed as-is — the web's home page,
 * not the route — so every on-demand revalidation silently did nothing and the
 * web only refreshed when its ISR window ran out. Returns `null` for an
 * unparsable value.
 */
export function resolveWebRevalidateUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.pathname === "" || url.pathname === "/") {
    url.pathname = WEB_REVALIDATE_PATH;
  }
  return url.toString();
}

/** The web's cache tag of every product list (home rails, listings). */
const PRODUCTS_LIST_TAG = "products:list";

/**
 * The web cache tags to revalidate when listings change how they show in the
 * product lists (status, ranking, boost): the lists and each listing's page.
 */
export function productListTags(productIds: readonly string[]): string[] {
  return [PRODUCTS_LIST_TAG, ...productIds.map((id) => `product:${id}`)];
}

/**
 * Best-effort on-demand ISR revalidation of the web app. When a product's price or
 * discount changes (or admin hero / trust badge content), the API POSTs the
 * affected cache tags to the web's `/api/revalidate` route so the ISR-cached home
 * rails and product pages refresh immediately instead of waiting out the
 * `revalidate` window.
 *
 * No-op when `WEB_REVALIDATE_URL` / `REVALIDATE_SECRET` are unset (the web ISR
 * window remains the fallback), and never throws — invalidation is best-effort.
 * A rejected call (wrong secret, wrong URL) is logged as a warning so a broken
 * setup is visible instead of silent.
 */
export async function notifyWebRevalidate(tags: string[]): Promise<void> {
  const raw = process.env.WEB_REVALIDATE_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!raw || !secret || tags.length === 0) return;

  const url = resolveWebRevalidateUrl(raw);
  if (!url) {
    logger.warn("WEB_REVALIDATE_URL is not a valid URL; skipping revalidation");
    return;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-revalidate-secret": secret,
      },
      body: JSON.stringify({ tags }),
    });
    if (!res.ok) {
      logger.warn(
        `Web revalidation rejected (HTTP ${res.status}) for tags ${tags.join(", ")}; check WEB_REVALIDATE_URL / REVALIDATE_SECRET`,
      );
    }
  } catch (err) {
    // Best-effort; the web ISR revalidate window is the fallback.
    logger.warn(
      `Web revalidation failed for tags ${tags.join(", ")}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
