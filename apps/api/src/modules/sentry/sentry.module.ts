/**
 * Sentry Module
 * Error tracking and performance monitoring integration
 */
import { Module, Global, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import * as Sentry from "@sentry/node";
import { SentryService } from "./sentry.service";
import { SentryInterceptor } from "./sentry.interceptor";
import { SentryReportThrottle } from "./sentry-report-throttle";
import { initAppLogger } from "../../common/logging/logger";
import { buildSentryNodeOptions } from "./sentry-event";

@Global()
@Module({
  imports: [ConfigModule],
  providers: [SentryService, SentryInterceptor, SentryReportThrottle],
  exports: [SentryService, SentryInterceptor],
})
export class SentryModule implements OnModuleInit {
  private readonly logger = new Logger(SentryModule.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly sentryService: SentryService,
  ) {}

  onModuleInit() {
    // The app logger needs the SentryService sink in every case: with or
    // without a DSN, and when the worker already initialized Sentry.
    initAppLogger(this.sentryService);

    // The worker entry point (`worker.ts`) initializes Sentry before Nest
    // boots, with the same options. A second `Sentry.init` in the same
    // process would replace that client, so it is skipped.
    if (Sentry.getClient()) {
      this.logger.log("Sentry already initialized by the entry point");
      return;
    }

    const dsn = this.configService.get<string>("SENTRY_DSN");
    if (!dsn) {
      this.logger.warn("Sentry DSN not configured, error tracking disabled");
      return;
    }
    Sentry.init(buildSentryNodeOptions(dsn));
    this.logger.log("Sentry initialized");
  }
}
