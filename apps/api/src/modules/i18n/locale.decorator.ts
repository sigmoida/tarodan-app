import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { type Locale } from "@tarodan/i18n";
import { resolveRequestLocale } from "./locale.util";

/**
 * Injects the resolved request locale into a controller handler (#223):
 *
 *   @Get() greeting(@ReqLocale() locale: Locale) { ... }
 *
 * Prefers `request.locale` set by LocaleInterceptor; resolves on the spot if
 * the interceptor didn't run (e.g. a unit-tested handler).
 */
export const ReqLocale = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Locale => {
    const req = ctx.switchToHttp().getRequest();
    return req?.locale ?? resolveRequestLocale(req ?? {});
  },
);
