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
import {
  applySentryEventPolicy,
  isProductionRuntime,
  resolveSentryEnvironment,
  resolveSentryRelease,
} from "./sentry-event";

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
    // Etiket SENTRY_ENVIRONMENT'tan, örnekleme gerçek çalışma kipinden:
    // staging de production build'i olduğu için NODE_ENV ikisinde de aynıdır.
    const environment = resolveSentryEnvironment();
    const isProd = isProductionRuntime();

    if (dsn) {
      Sentry.init({
        dsn,
        environment,
        // Sürüm etiketi: "bu hata hangi deploy'la geldi" sorusunu cevaplar ve
        // Sentry'nin regresyon takibini (çözülen issue yeni sürümde tekrar
        // açılırsa uyarma) çalıştırır.
        release: resolveSentryRelease(),
        tracesSampleRate: isProd ? 0.2 : 1.0,
        profilesSampleRate: isProd ? 0.1 : 1.0,
        // Sentry v8's default Node integrations include inbound and outbound
        // HTTP instrumentation; no deprecated @sentry/tracing shim is needed.
        // Sağlık kontrolü filtresi + redaksiyon + korelasyon tag'i: tek kapı.
        beforeSend: applySentryEventPolicy,
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
