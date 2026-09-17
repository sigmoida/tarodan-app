/**
 * PayTR üyelik mağazası geçişi — tek seferlik bildirim.
 *
 * Üyelik ödemeleri ayrı bir PayTR mağazasına taşındı ve kart token'ları
 * TAŞINMADI (mağazaya özeldirler). Geçiş anında oto-yenilemesi açık her ücretli
 * üyenin üyelik mağazasında kullanılabilir kartı yoktur; yenileme zamanı gelince
 * saatlik cron zaten oto-yenilemeyi kapatıp bildirim gönderir. Bu script aynı
 * işi GEÇİŞ ANINDA herkese bir kez yapar ki üye dönem sonunu beklemeden
 * durumu öğrensin ve arayüzde "otomatik yenileme açık" yalanı kalmasın.
 *
 * Mantık tek yerde: `MembershipService.disableRenewalsWithoutUsableCard`
 * (cron'un kullandığı yol, `scope: "all"`). Bildirim gerçek bildirim servisiyle
 * gider (tercihler, zil, push). Tekrar çalıştırmak güvenli: kapatılmış üyelik
 * sorgudan düşer, ikinci bildirim gitmez.
 *
 * Nest uygulama bağlamı DERLENMİŞ uygulamadan (`dist/`) yüklenir; seed grafiğine
 * AppModule'ü sokmamak için bilinçli (bkz. tsconfig.seed.json).
 *
 * Varsayılan KURU koşudur (yalnız sayar): üyelere geri alınamaz bildirim
 * gittiği için yazma ancak açık `--apply` ile yapılır.
 *
 * Kullanım (API konteynerinde, deploy + migrate sonrası):
 *   node dist-seed/maintenance/notify-membership-card-readd.js
 *   node dist-seed/maintenance/notify-membership-card-readd.js --apply
 */
import { join } from "node:path";
import type { INestApplicationContext, Type } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { pinProcessRole } from "../src/process-role";

interface MembershipServiceLike {
  disableRenewalsWithoutUsableCard(opts: {
    scope: "due" | "all";
    dryRun?: boolean;
  }): Promise<number>;
}

async function main(): Promise<void> {
  // Bildirim geri alınamaz: yanlışlıkla bayraksız koşu yalnız saysın.
  const dryRun = !process.argv.includes("--apply");

  // Bu süreç yalnız tek bir servis çağrısı için ayağa kalkar: zamanlanmış
  // işler (worker rolü) burada KOŞMAMALI — çalışan worker ile çift tur olurdu.
  pinProcessRole("web");

  const dist = join(__dirname, "..", "..", "dist");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AppModule } = require(join(dist, "app.module")) as {
    AppModule: Type<unknown>;
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MembershipService } = require(
    join(dist, "modules", "membership", "membership.service"),
  ) as { MembershipService: Type<MembershipServiceLike> };

  let app: INestApplicationContext | undefined;
  try {
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ["error", "warn", "log"],
    });
    const membership = app.get(MembershipService);
    const count = await membership.disableRenewalsWithoutUsableCard({
      scope: "all",
      dryRun,
    });
    console.log(
      dryRun
        ? `[dry-run] Oto-yenilemesi kapatılıp bildirim alacak üyelik: ${count}`
        : `Oto-yenilemesi kapatılan ve bildirim gönderilen üyelik: ${count}`,
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
