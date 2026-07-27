import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

/**
 * On-demand cache invalidation endpoint. The NestJS API calls this (server-to-
 * server) whenever a product's price/discount changes so the ISR-cached home rails
 * and product pages update immediately instead of waiting out the `revalidate`
 * window. Guarded by a shared secret; a no-op (401) if the secret is unset/wrong.
 *
 * Body: `{ "tags": ["products:list", "product:<id>"] }`.
 * Header: `x-revalidate-secret: <REVALIDATE_SECRET>`.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || request.headers.get("x-revalidate-secret") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    tags?: unknown;
  } | null;
  const tags = Array.isArray(body?.tags)
    ? (body!.tags.filter((t) => typeof t === "string") as string[])
    : [];

  for (const tag of tags) revalidateTag(tag);

  return NextResponse.json({ ok: true, revalidated: tags });
}
