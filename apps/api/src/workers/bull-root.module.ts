import { Global, Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { ConfigModule, ConfigService } from "@nestjs/config";

/**
 * BullRootModule (Faz 7.2 / Faz 0) — Bull'un KÖK bağlantı config'i (Redis).
 *
 * Gated `WorkerModule`'den AYRILDI: `PROCESS_ROLE=web` iken WorkerModule yüklenmez ama
 * API yine de kuyruklara ENQUEUE eder (email/push event'leri) ve repeatable cron kaydeder
 * (onModuleInit) → Bull bağlantısı HER rolde şart. Bu modül KOŞULSUZ yüklenir; WorkerModule
 * yalnız kuyruk PROCESSOR'larını (job tüketicileri) sağlar.
 *
 * @Global: tüm feature modüllerindeki `BullModule.registerQueue(...)` bu tek kök bağlantıyı
 * kullanır. Faz 0: Bull için cache'ten AYRI + dayanıklı (noeviction + AOF) bir Redis'e
 * `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD` ile bağlanır (cache ayrı `REDIS_URL` kullanır).
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host: configService.get("REDIS_HOST", "localhost"),
          port: configService.get("REDIS_PORT", 6379),
          password: configService.get("REDIS_PASSWORD"),
        },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 2000,
          },
        },
      }),
      inject: [ConfigService],
    }),
  ],
  exports: [BullModule],
})
export class BullRootModule {}
