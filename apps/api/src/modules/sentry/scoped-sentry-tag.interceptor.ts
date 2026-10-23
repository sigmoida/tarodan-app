import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Type,
  mixin,
} from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { Observable } from "rxjs";

/**
 * Tags a request's Sentry events with a feature.
 *
 * The tag goes on the request's isolation scope, which
 * `sentryRequestScopeMiddleware` forks for every request: the exception
 * filter that reports a 5xx runs in that scope and sees the tag, and the tag
 * is gone once the request ends (it never reaches cron events).
 *
 * Do not fork a scope of its own here: the filter runs outside the handler's
 * async context, so a tag on a nested scope would miss the very event it is
 * meant for.
 */
export function scopedSentryTag(tag: {
  key: string;
  value: string;
}): Type<NestInterceptor> {
  @Injectable()
  class ScopedSentryTagInterceptor implements NestInterceptor {
    intercept(
      _context: ExecutionContext,
      next: CallHandler,
    ): Observable<unknown> {
      Sentry.getIsolationScope().setTag(tag.key, tag.value);
      return next.handle();
    }
  }
  return mixin(ScopedSentryTagInterceptor);
}
