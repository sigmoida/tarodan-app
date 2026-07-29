/**
 * Sentry Module
 * Error tracking and performance monitoring integration
 */
import { Module, Global, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import * as Sentry from "@sentry/node";
import { SentryService } from "./sentry.service";
import { SentryInterceptor } from "./sentry.interceptor";
import { initAppLogger } from "../../common/logging/logger";
import { redactSensitive } from "../../common/security/redact-sensitive";

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
    const dsn = this.configService.get<string>("SENTRY_DSN");
    const environment = this.configService.get<string>(
      "NODE_ENV",
      "development",
    );

    if (dsn) {
      Sentry.init({
        dsn,
        environment,
        tracesSampleRate: environment === "production" ? 0.2 : 1.0,
        profilesSampleRate: environment === "production" ? 0.1 : 1.0,
        // Sentry v8's default Node integrations include inbound and outbound
        // HTTP instrumentation; no deprecated @sentry/tracing shim is needed.
        // Filter out health check endpoints
        beforeSend(event) {
          const request = event.request;
          if (request?.url?.includes("/health")) {
            return null;
          }
          return redactSensitive(event) as typeof event;
        },
        // Capture user context
        beforeBreadcrumb(breadcrumb) {
          if (
            breadcrumb.category === "http" &&
            breadcrumb.data?.url?.includes("/health")
          ) {
            return null;
          }
          return redactSensitive(breadcrumb) as typeof breadcrumb;
        },
      });
      initAppLogger(this.sentryService);
      this.logger.log("Sentry initialized");
    } else {
      initAppLogger(this.sentryService);
      this.logger.warn("Sentry DSN not configured, error tracking disabled");
    }
  }
}
