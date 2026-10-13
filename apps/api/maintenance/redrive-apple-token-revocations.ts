/**
 * Sign in with Apple token iptali — ölü (DLQ) işleri yeniden kuyruğa alır.
 *
 * `apple.token_revoke` işi kalıcı hatayla (`invalid_grant`, `invalid_client`
 * denemeleri tükenince, okunamayan anahtar) ya da ~1 günlük yapılandırma
 * penceresi dolunca `dead` olur. Dedupe upsert'i ölü işe dokunmadığı ve hesap
 * silme satırı bir kez damgaladığı için yeniden denemenin başka yolu yoktur.
 * Önce nedeni düzeltin (Apple anahtarının client id'ye bağlanması, APPLE_*
 * env'i), sonra bu script'i çalıştırın.
 *
 * Yalnız token satırı hâlâ iptal edilebilir olan işler alınır (şifreli token
 * duruyor, `revokedAt` boş); yapılandırma hâlâ eksikse `--apply` reddedilir.
 * Mantık tek yerde: `AppleTokenService.redriveDeadRevocations`. Tekrar
 * çalıştırmak güvenli: yeniden kuyruğa alınan iş artık `dead` değildir.
 *
 * Nest uygulama bağlamı DERLENMİŞ uygulamadan (`dist/`) yüklenir (bkz.
 * notify-membership-card-readd.ts). Varsayılan KURU koşudur (yalnız sayar);
 * yazma ancak açık `--apply` ile yapılır.
 *
 * Kullanım (API konteynerinde):
 *   node dist-seed/maintenance/redrive-apple-token-revocations.js
 *   node dist-seed/maintenance/redrive-apple-token-revocations.js --apply
 */
import { join } from "node:path";
import type { INestApplicationContext, Type } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { pinProcessRole } from "../src/process-role";

interface AppleTokenServiceLike {
  redriveDeadRevocations(opts: { dryRun: boolean }): Promise<{
    dead: number;
    redrivable: number;
    requeued: number;
  }>;
}

async function main(): Promise<void> {
  const dryRun = !process.argv.includes("--apply");

  // Zamanlanmış işler (worker rolü) bu süreçte KOŞMAMALI.
  pinProcessRole("web");

  const dist = join(__dirname, "..", "..", "dist");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AppModule } = require(join(dist, "app.module")) as {
    AppModule: Type<unknown>;
  };
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AppleTokenService } = require(
    join(dist, "modules", "auth", "social", "apple-token.service"),
  ) as { AppleTokenService: Type<AppleTokenServiceLike> };

  let app: INestApplicationContext | undefined;
  try {
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ["error", "warn", "log"],
    });
    const result = await app
      .get(AppleTokenService)
      .redriveDeadRevocations({ dryRun });
    console.log(
      dryRun
        ? `[dry-run] Ölü apple.token_revoke işi: ${result.dead}, yeniden kuyruğa alınabilir: ${result.redrivable}`
        : `Ölü apple.token_revoke işi: ${result.dead}, yeniden kuyruğa alınan: ${result.requeued}`,
    );
  } finally {
    await app?.close();
  }
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
