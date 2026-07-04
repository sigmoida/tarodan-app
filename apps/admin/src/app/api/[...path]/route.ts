import { NextResponse, type NextRequest } from 'next/server';
import { apiFetch, attachSessionCookies } from '@/lib/server/session';

/**
 * BFF proxy. Every client data call goes to same-origin `/api/*` (no CORS) and
 * is forwarded here to the NestJS API with a server-side `Authorization: Bearer`
 * header (see lib/server/session). Access tokens are refreshed transparently on
 * 401. The browser never holds or sees the API tokens.
 *
 * Auth flows (login / forgot-password / logout) are Server Actions, not this
 * proxy — so this handler only ever carries already-authenticated traffic.
 */
export const dynamic = 'force-dynamic';

async function proxy(request: NextRequest, path: string[]) {
  const suffix = '/' + (path?.join('/') ?? '') + request.nextUrl.search;

  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const init: RequestInit = {
    method: request.method,
    headers: request.headers.get('content-type')
      ? { 'content-type': request.headers.get('content-type') as string }
      : undefined,
    body: hasBody ? Buffer.from(await request.arrayBuffer()) : undefined,
  };

  const { res: upstream, refreshed } = await apiFetch(suffix, init);

  // Stream the upstream response back, preserving content type/disposition.
  // Never forward upstream Set-Cookie — this app owns its own session cookies.
  const headers = new Headers();
  const contentType = upstream.headers.get('content-type');
  const disposition = upstream.headers.get('content-disposition');
  if (contentType) headers.set('content-type', contentType);
  if (disposition) headers.set('content-disposition', disposition);

  const response = new NextResponse(upstream.body, { status: upstream.status, headers });
  // If the access token was refreshed mid-call, persist the rotated tokens on
  // THIS response — otherwise the browser keeps the old (now invalid) refresh
  // token and gets bounced to /login on the next request.
  if (refreshed) attachSessionCookies(response, refreshed);
  return response;
}

type Ctx = { params: { path: string[] } };

export const GET = (req: NextRequest, { params }: Ctx) => proxy(req, params.path);
export const POST = (req: NextRequest, { params }: Ctx) => proxy(req, params.path);
export const PUT = (req: NextRequest, { params }: Ctx) => proxy(req, params.path);
export const PATCH = (req: NextRequest, { params }: Ctx) => proxy(req, params.path);
export const DELETE = (req: NextRequest, { params }: Ctx) => proxy(req, params.path);
