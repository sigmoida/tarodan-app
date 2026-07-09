import { Global, Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { ConfigModule, ConfigService } from "@nestjs/config";

/**
 * Bull kök bağlantısı (Redis) — TEK yer.
 *
 * `BullModule.forRootAsync` paylaşılan bağlantı provider'ını GLOBAL kaydeder;
 * dağıtık `registerQueue` çağrıları (feature modüllerinde) bu kökü import kenarı
 * olmadan resolve eder. Bu modülü hem API (AppModule) hem worker (WorkerAppModule)
 * grafiği BİRER KEZ import etmeli. Böylece WorkerModule'ü AppModule'den çıkarmak
 * API'nin producer kuyruklarını KIRMAZ — bağlantı buradan gelir.
 *
 * DİKKAT: `forRootAsync` süreç başına yalnız bir modülde bulunmalı (çift kayıt =
 * bağlantının iki kez açılması). Bu yüzden config artık WorkerModule'de değil burada.
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
