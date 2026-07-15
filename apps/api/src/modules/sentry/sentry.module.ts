/**
 * Sentry Module
 * Error tracking and performance monitoring integration
 */
import { Module, Global, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';
import { SentryService } from './sentry.service';
import { SentryInterceptor } from './sentry.interceptor';
import { initAppLogger } from '../../common/logging/logger';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [SentryService, SentryInterceptor],
  exports: [SentryService, SentryInterceptor],
})
export class SentryModule implements OnModuleInit {
  private readonly logger = new Logger(SentryModule.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly sentryService: SentryService,
  ) {}

  onModuleInit() {
    const dsn = this.configService.get<string>('SENTRY_DSN');
    const environment = this.configService.get<string>('NODE_ENV', 'development');

    if (dsn) {
      Sentry.init({
        dsn,
        environment,
        tracesSampleRate: environment === 'production' ? 0.2 : 1.0,
        profilesSampleRate: environment === 'production' ? 0.1 : 1.0,
        integrations: [
          // HTTP integration for tracking outgoing requests
          new Sentry.Integrations.Http({ tracing: true }),
        ],
        // Filter out health check endpoints
        beforeSend(event, hint) {
          const request = event.request;
          if (request?.url?.includes('/health')) {
            return null;
          }
          return event;
        },
        // Capture user context
        beforeBreadcrumb(breadcrumb) {
          if (breadcrumb.category === 'http' && breadcrumb.data?.url?.includes('/health')) {
            return null;
          }
          return breadcrumb;
        },
      });
      this.logger.log('Sentry initialized');
    } else {
      this.logger.warn('Sentry DSN not configured, error tracking disabled');
    }

    initAppLogger(this.sentryService);
  }
}
