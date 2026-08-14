import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger, RequestMethod } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module";

import { NestExpressApplication } from "@nestjs/platform-express";
import { json, urlencoded } from "express";
import { setupBullBoard } from "./bull-board.setup";
import { requestIdMiddleware } from "./common/context/request-context";
import { AppNestLogger } from "./common/logging/nest-logger";
import { getProcessRole } from "./process-role";
import { resolveCorsOrigins } from "./config/cors-origins";
import { isProduction, isDevelopment } from "./config/environment";
import { errorStack } from "./common/helpers/error-message";

/**
 * Hard guard: PAYMENT_BYPASS allows completing payments without going through
 * PayTR — useful for dev/test, catastrophic in production. If both flags
 * are on at the same time, refuse to start so a misconfiguration cannot
 * silently leak free orders/memberships.
 */
function assertPaymentBypassNotInProduction(logger: Logger): void {
  const bypassEnabled = process.env.PAYMENT_BYPASS === "true";
  if (isProduction() && bypassEnabled) {
    logger.error(
      "FATAL: PAYMENT_BYPASS=true cannot be set when NODE_ENV=production. " +
        "This would let clients complete payments without provider charge. " +
        "Set PAYMENT_BYPASS=false (or unset) in the production environment.",
    );
    process.exit(1);
  }
}

async function bootstrap() {
  const logger = new Logger("Bootstrap");
  try {
    assertPaymentBypassNotInProduction(logger);

    // IMPORTANT: Disable default body parser so custom parsers work for payment callbacks
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      bodyParser: false, // Disable default parser
      logger: new AppNestLogger(),
    });

    // Reverse proxy (Coolify/nginx) arkasında gerçek istemci IP'sini X-Forwarded-For'dan
    // al; yoksa rate-limit (ThrottlerGuard) tüm kullanıcıları tek proxy IP'sinde
    // toplayıp birbirini kilitler. İlk hop'a güven.
    app.set("trust proxy", 1);

    // Korelasyon kimliği EN ERKEN kurulur: sonraki tüm middleware/guard/servis
    // logları ve hata kayıtları aynı kimliği taşısın (AsyncLocalStorage).
    app.use(requestIdMiddleware);

    // Custom Body Parsers (e.g. PayTR form-urlencoded callbacks).
    // Limit 50mb → 1mb: JSON/urlencoded gövdeler (API çağrıları + PayTR callback)
    // hiçbir zaman büyük değildir; 50mb'lık tavan public/unauth uçlarda (callback,
    // confirm-failed) bellek-DoS yüzeyiydi. DOSYA yüklemeleri bu parser'lardan GEÇMEZ
    // — multer (FileInterceptor + fileSize limiti) ayrı ele alır, o yüzden etkilenmez.
    app.use(json({ limit: "1mb" }));
    app.use(urlencoded({ extended: true, limit: "1mb" }));

    // Bull Board — kuyruk izleme dashboard'u. helmet'TEN ÖNCE mount edilir
    // ki CSP UI'ı bozmasın; istek burada yanıtlanıp helmet'e düşmez.
    // Tamamen opsiyonel + try/catch'li: açılışı asla bloklamaz.
    setupBullBoard(app, logger);

    // Security
    app.use(helmet());

    // CORS is driven by an explicit allowlist in EVERY environment (#69), so a
    // non-production host (e.g. staging) never reflects an arbitrary origin
    // together with credentials. Native mobile clients send no Origin header
    // and are unaffected. Set CORS_ORIGINS (comma-separated) per deployed
    // environment; local dev falls back to the localhost apps. The Socket.IO
    // gateway resolves the same list, so both stay on one source.
    app.enableCors({
      origin: resolveCorsOrigins(),
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      // Tarayıcı/Axios bazen Cache-Control, Pragma vb. ekliyor; hepsine izin ver ki CORS preflight geçsin
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "Cache-Control",
        "Pragma",
        "Accept",
        "Accept-Language",
        "X-Requested-With",
        "X-Payment-Capability",
        "X-CSRF-Token",
      ],
    });

    // Global validation pipe
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false, // Changed to false to prevent 500 errors
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    // API prefix. PayTR "Bildirim URL" alias'ı /callback prefix DIŞINDA kalır
    // (panel .../callback ile bittiğinde çalışsın; kanonik /api/payments/callback/paytr da durur).
    app.setGlobalPrefix("api", {
      exclude: [{ path: "callback", method: RequestMethod.POST }],
    });

    // Swagger exposes the full endpoint schema/payloads, so it is OFF on every
    // deployed environment (including staging) unless ENABLE_SWAGGER=true; it
    // stays on for local development only (#69 — no longer driven by the
    // negation of `production`).
    const swaggerEnabled =
      isDevelopment() || process.env.ENABLE_SWAGGER === "true";
    if (swaggerEnabled) {
      const config = new DocumentBuilder()
        .setTitle("Tarodan API")
        .setDescription("Tarodan Koleksiyoner Oyuncak Marketplace API")
        .setVersion("1.0")
        .addBearerAuth()
        .addTag("auth", "Authentication endpoints")
        .addTag("users", "User management")
        .addTag("products", "Product catalog")
        .addTag("offers", "Offer/negotiation system")
        .addTag("orders", "Order management")
        .addTag("payments", "Payment processing")
        .addTag("shipping", "Shipping integration")
        .addTag("admin", "Admin panel endpoints")
        .build();
      const document = SwaggerModule.createDocument(app, config);
      SwaggerModule.setup("api/docs", app, document);
      logger.log("Swagger docs available at /api/docs");
    } else {
      logger.log("Swagger docs disabled (set ENABLE_SWAGGER=true to enable)");
    }

    // Graceful shutdown (#64): on a rolling deploy the orchestrator (Coolify)
    // sends SIGTERM. app.close() stops accepting new connections, waits for
    // in-flight requests to finish, and runs the onModuleDestroy lifecycle
    // hooks (PrismaService/CacheService → $disconnect) so DB/Redis connections
    // are released instead of leaked. Mirrors the existing worker.ts handler;
    // the guard keeps it idempotent across SIGTERM/SIGINT.
    let shuttingDown = false;
    const shutdown = async (signal: string): Promise<void> => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.log(
        `${signal} received — draining in-flight requests before shutdown`,
      );
      try {
        await app.close();
        logger.log("Graceful shutdown complete");
        process.exit(0);
      } catch (err) {
        logger.error("Error during graceful shutdown", errorStack(err));
        process.exit(1);
      }
    };
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("SIGINT", () => void shutdown("SIGINT"));

    const port = process.env.PORT || 3000;
    // 0.0.0.0 — telefonun LAN IP üzerinden erişebilmesi için tüm arayüzleri dinle.
    await app.listen(port, "0.0.0.0");
    // Faz 7.2: hangi rolde koştuğumuzu logla (`all`=HTTP+worker'lar, `web`=yalnız HTTP).
    logger.log(
      `Application running on port ${port} (PROCESS_ROLE=${getProcessRole()})`,
    );
  } catch (error) {
    logger.error("Failed to start application:", error);
    process.exit(1);
  }
}

const bootstrapLogger = new Logger("Bootstrap");
bootstrap().catch(() => {
  bootstrapLogger.error("Bootstrap failed");
  process.exit(1);
});
