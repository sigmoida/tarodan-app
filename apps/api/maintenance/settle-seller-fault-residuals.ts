/**
 * Satıcı kusurlu escrow KALINTILARINI platforma kapatır — tek seferlik, deploy
 * sonrası.
 *
 * Kalıntı = iade/iptalle kapanmış siparişin hold'unda kalan `amount −
 * refundedAmount` (satıcının kargo payı tazmini). Kusur satıcıdaysa bırakma
 * yolları onu ödemez ve escrow'da süresiz kilitli kalıyordu. O para alıcının
 * DEĞİL platformundur: alıcı ödediğinin tamamını (T) zaten geri almıştır;
 * satıcının kargo payı T'de değil, satıcının hak edişinden düşülmüştü. Bu
 * yüzden PSP'ye gidilmez — hold `cancelled` + `refundedAmount = amount`
 * yapılır ve dengeli bir defter kaydı (seller_escrow → platform) yazılır.
 * Kaynak kapandı (satıcı kusurlu kargo öncesi iptal artık satıcı payını tazmin
 * etmez); bu script birikmişleri temizler.
 *
 * Mantık tek yerde: `PaymentHoldResidualService.settleSellerFaultResiduals`
 * (admin ucu `POST /admin/payouts/holds/:id/settle-residual` aynı kapatmayı
 * kullanır). Her hold kendi işleminde kapatılır; uygunluk tek yüklemden
 * (`holdResidualSettleable`). Tekrar çalıştırmak güvenli: kapatılan hold aday
 * kümesinden düşer, defter anahtarı (`hold-residual-settle:<holdId>`) çift
 * kaydı DB'de de engeller.
 *
 * Nest uygulama bağlamı DERLENMİŞ uygulamadan (`dist/`) yüklenir; seed grafiğine
 * AppModule'ü sokmamak için bilinçli (bkz. tsconfig.seed.json).
 *
 * Varsayılan KURU koşudur (yalnız raporlar): para hareketi geri alınamaz,
 * yazma ancak açık `--apply` ile yapılır.
 *
 * Kullanım (API konteynerinde, deploy + migrate sonrası):
 *   node dist-seed/maintenance/settle-seller-fault-residuals.js
 *   node dist-seed/maintenance/settle-seller-fault-residuals.js --apply
 */
import { join } from "node:path";
import type { INestApplicationContext, Type } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { pinProcessRole } from "../src/process-role";

/**
 * Servisin rapor şekli — `import type` bile servis dosyasını (ve AppModule
 * grafiğini) seed derlemesine sokardı, bu yüzden yalnız okunan alanlar burada.
 */
interface SellerFaultResidualReport {
  dryRun: boolean;
  scanned: number;
  totalAmount: number;
  rows: Array<{
    holdId: string;
    orderId: string;
    sellerId: string;
    residualAmount: number;
    faultBasis: string;
    outcome: "would_settle" | "settled" | "failed";
    error?: string;
  }>;
}

interface ResidualServiceLike {
  settleSellerFaultResiduals(opts: {
    dryRun: boolean;
    actor: string;
    reason: string;
  }): Promise<SellerFaultResidualReport>;
}

const ACTOR = "maintenance:settle-seller-fault-residuals";
const REASON =
  "Satıcı kusurlu kalıntı birikimi — kaynak düzeltmesi sonrası tek seferlik kapatma";

function printReport(report: SellerFaultResidualReport): void {
  console.log(
    report.dryRun
      ? "\n[DRY RUN] Yazma yapılmadı. Yazmak için --apply.\n"
      : "\nKapatma bitti.\n",
  );
  console.log(`Taranan hold (kapanmış sipariş) : ${report.scanned}`);
  console.log(`Satıcı kusurlu kalıntı          : ${report.rows.length}`);
  console.log(
    `${report.dryRun ? "Kapatılacak" : "Kapatılan"} toplam (TL)       : ${report.totalAmount.toFixed(2)}`,
  );
  if (report.rows.length === 0) return;
  console.log("\nhold | sipariş | satıcı | kalıntı | kusur | sonuç");
  for (const row of report.rows) {
    console.log(
      [
        row.holdId,
        row.orderId,
        row.sellerId,
        row.residualAmount.toFixed(2),
        row.faultBasis,
        row.outcome + (row.error ? ` (${row.error})` : ""),
      ].join(" | "),
    );
  }
  const failed = report.rows.filter((row) => row.outcome === "failed").length;
  if (failed > 0) {
    console.log(
      `\n${failed} hold kapatılamadı — script'i yeniden çalıştırmak güvenli.`,
    );
  }
}

async function main(): Promise<void> {
  const dryRun = !process.argv.includes("--apply");

  // Tek bir servis çağrısı için ayağa kalkar: zamanlanmış işler (worker rolü)
  // burada KOŞMAMALI — çalışan worker ile çift tur olurdu.
  pinProcessRole("web");

  const dist = join(__dirname, "..", "..", "dist");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AppModule } = require(join(dist, "app.module")) as {
    AppModule: Type<unknown>;
  };
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PaymentHoldResidualService } = require(
    join(dist, "modules", "payment", "refund", "payment-hold-residual.service"),
  ) as { PaymentHoldResidualService: Type<ResidualServiceLike> };

  let app: INestApplicationContext | undefined;
  try {
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ["error", "warn", "log"],
    });
    const report = await app
      .get(PaymentHoldResidualService)
      .settleSellerFaultResiduals({ dryRun, actor: ACTOR, reason: REASON });
    printReport(report);
    if (report.rows.some((row) => row.outcome === "failed")) {
      process.exitCode = 1;
    }
  } finally {
    await app?.close();
  }
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
