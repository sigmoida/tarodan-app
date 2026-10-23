import type { NextFunction, Request, Response } from "express";
import * as Sentry from "@sentry/node";

/**
 * Gives every HTTP request its own Sentry isolation scope.
 *
 * Sentry's HTTP integration forks one per request only when `Sentry.init` runs
 * before `http` and `express` are loaded. Here it runs in `SentryModule`, long
 * after, so every `Sentry.setTag`/`setUser`/breadcrumb written during a
 * request landed on the process-wide scope: a `feature=saved_search` tag or a
 * user id from one request then rode on later requests and on cron events.
 *
 * Registered first in `main.ts`, so everything that follows (guards,
 * interceptors, handlers and the exception filter that reports the 5xx) runs
 * inside the request's scope, and nothing written there outlives it.
 */
export function sentryRequestScopeMiddleware(
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  Sentry.withIsolationScope(() => next());
}
