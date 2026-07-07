import { NextResponse, type NextRequest } from 'next/server';
import type { ApiFetchResult } from './session';

interface ProxySession {
	apiFetch: (path: string, init?: RequestInit) => Promise<ApiFetchResult>;
	attachSessionCookies: (
		res: NextResponse,
		tokens: { access: string; refresh: string },
	) => void;
}

type RouteCtx = { params: { path: string[] } };

/**
 * The BFF proxy handlers, factored out of the admin app. Every client data call
 * goes to same-origin `/api/*` (no CORS) and is forwarded to the upstream API
 * with a server-side `Bearer` header; the browser never holds the API tokens.
 * Access tokens refresh transparently on 401, and the rotated tokens are
 * persisted onto this response.
 *
 * Wire it in `app/api/[...path]/route.ts`:
 *   export const { GET, POST, PUT, PATCH, DELETE } = createBffProxy(session);
 */
export function createBffProxy(session: ProxySession) {
	async function proxy(request: NextRequest, path: string[]): Promise<NextResponse> {
		const suffix = '/' + (path?.join('/') ?? '') + request.nextUrl.search;

		const hasBody = !['GET', 'HEAD'].includes(request.method);
		// Forward a safelist of request headers (auth is added server-side via the
		// Bearer token, so the browser's cookies/host are intentionally dropped).
		const fwd = new Headers();
		for (const name of ['content-type', 'accept', 'cache-control', 'pragma']) {
			const value = request.headers.get(name);
			if (value) fwd.set(name, value);
		}
		const init: RequestInit = {
			method: request.method,
			headers: fwd,
			body: hasBody ? await request.arrayBuffer() : undefined,
		};

		const { res: upstream, refreshed } = await session.apiFetch(suffix, init);

		// Stream the upstream response back, preserving content type/disposition.
		// Never forward upstream Set-Cookie — this app owns its own session cookies.
		const headers = new Headers();
		const ct = upstream.headers.get('content-type');
		const disposition = upstream.headers.get('content-disposition');
		if (ct) headers.set('content-type', ct);
		if (disposition) headers.set('content-disposition', disposition);

		const response = new NextResponse(upstream.body, { status: upstream.status, headers });
		if (refreshed) session.attachSessionCookies(response, refreshed);
		return response;
	}

	return {
		GET: (req: NextRequest, { params }: RouteCtx) => proxy(req, params.path),
		POST: (req: NextRequest, { params }: RouteCtx) => proxy(req, params.path),
		PUT: (req: NextRequest, { params }: RouteCtx) => proxy(req, params.path),
		PATCH: (req: NextRequest, { params }: RouteCtx) => proxy(req, params.path),
		DELETE: (req: NextRequest, { params }: RouteCtx) => proxy(req, params.path),
	};
}
