import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { resolveRequestLocale } from './locale.util';

/**
 * Attaches the resolved request locale to `request.locale` for every request
 * (#223), so controllers, services, and the exception filter (#224) can render
 * catalog messages in the caller's language. Purely additive — never throws.
 *
 * Registered globally via APP_INTERCEPTOR in I18nModule.
 */
@Injectable()
export class LocaleInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      const req = context.switchToHttp().getRequest();
      if (req) req.locale = resolveRequestLocale(req);
    }
    return next.handle();
  }
}
