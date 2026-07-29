/**
 * Best-effort on-demand ISR revalidation of the web app. When a product's price or
 * discount changes, the API POSTs the affected cache tags to the web's
 * `/api/revalidate` route so the ISR-cached home rails and product pages refresh
 * immediately instead of waiting out the ~60s `revalidate` window.
 *
 * No-op when `WEB_REVALIDATE_URL` / `REVALIDATE_SECRET` are unset (the web ISR
 * window remains the fallback), and never throws — invalidation is best-effort.
 */
export async function notifyWebRevalidate(tags: string[]): Promise<void> {
  const url = process.env.WEB_REVALIDATE_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!url || !secret || tags.length === 0) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-revalidate-secret": secret,
      },
      body: JSON.stringify({ tags }),
    });
  } catch {
    // Best-effort; the web ISR revalidate window is the fallback.
  }
}
