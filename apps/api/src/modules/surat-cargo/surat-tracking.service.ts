import { Injectable, Logger } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { CacheService } from "../cache/cache.service";
import { PrismaService } from "../../prisma";
import {
  Prisma,
  ShipmentStatus,
  OrderStatus,
  TradeStatus,
  PaymentStatus,
} from "@prisma/client";
import { ElogoInvoicingService } from "../elogo/elogo-invoicing.service";
import type {
  SuratTakipResponse,
  SuratTakipGonderi,
  SuratGonderiPayload,
} from "./surat-cargo.types";
import { buildRestGonderi } from "./surat-rest.client";
import {
  mapSuratStatusToShipmentStatus,
  isSuratDelivered,
  isSuratReturnFlow,
  isSuratReturnCompleted,
} from "./surat-status.mapper";
import { canTransitionShipmentStatus } from "../shipping/shipment-state-machine";

/** Kargo kodu (barkod) retry job istatistiği — yüzey başına. */
export interface BarcodeRetryStat {
  /** Bu tick'te kodu başarıyla tamamlanan kayıt sayısı. */
  retried: number;
  /** Denenip yine kod alamayan kayıt sayısı (geçici/kalıcı hata). */
  failed: number;
}

const SURAT_API_LIVE =
  "https://api01.suratkargo.com.tr/api/KargoTakipHareketDetayi";
const SURAT_API_TEST =
  "https://api02.suratkargo.com.tr/api/KargoTakipHareketDetayi";
// OrtakBarkodOlustur = gönderi oluştur + barkod/etiket üret (gerçek KargoTakipNo + ZPL döner).
const SURAT_BARKOD_LIVE =
  "https://api01.suratkargo.com.tr/api/OrtakBarkodOlustur";
const SURAT_BARKOD_TEST =
  "https://api02.suratkargo.com.tr/api/OrtakBarkodOlustur";
// GonderiSil = gönderiyi sil/pasif et. Query auth (CariKodu/Sifre) + WebSiparisKodu.
const SURAT_SIL_LIVE = "https://api01.suratkargo.com.tr/api/GonderiSil";
const SURAT_SIL_TEST = "https://api02.suratkargo.com.tr/api/GonderiSil";

@Injectable()
export class SuratTrackingService {
  private readonly logger = new Logger(SuratTrackingService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
    private readonly cache: CacheService,
  ) {}

  /**
   * Query Sürat Kargo tracking API for a shipment by our order reference (OzelKargoTakipNo).
   * Returns the raw Sürat response or null on failure.
   */
  async fetchTrackingInfo(
    webSiparisKodu: string,
  ): Promise<SuratTakipResponse | null> {
    const cariKodu = this.configService.get<string>(
      "SURAT_KARGO_CARI_KODU",
      "",
    );
    const sifre = this.configService.get<string>("SURAT_KARGO_SIFRE", "");

    if (!cariKodu || !sifre) {
      this.logger.error(
        "SURAT_KARGO_CARI_KODU or SURAT_KARGO_SIFRE not configured",
      );
      return null;
    }

    const isTestMode =
      this.configService
        .get<string>("SURAT_KARGO_TEST_MODE", "true")
        ?.trim() === "true";
    const baseUrl = isTestMode ? SURAT_API_TEST : SURAT_API_LIVE;

    const url = `${baseUrl}?CariKodu=${encodeURIComponent(cariKodu)}&Sifre=${encodeURIComponent(sifre)}&WebSiparisKodu=${encodeURIComponent(webSiparisKodu)}`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
        method: "POST",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        this.logger.warn(
          `Surat tracking API HTTP ${response.status} for ${webSiparisKodu}`,
        );
        return null;
      }

      const data: SuratTakipResponse = await response.json();

      if (data.IsError) {
        this.logger.warn(
          `Surat tracking API error for ${webSiparisKodu}: ${data.errorMessage}`,
        );
        return null;
      }

      return data;
    } catch (error: any) {
      this.logger.error(
        `Surat tracking API request failed for ${webSiparisKodu}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Ham takip sorgusu — admin "Sürat Endpoint Testi" paneli için.
   * fetchTrackingInfo'nun aksine IsError durumunda bile Sürat'ın ham cevabını
   * (mesaj dahil) döndürür ve DB'ye dokunmaz. Sadece endpoint'in canlı çalıştığını
   * göstermek için kullanılır.
   */
  async probeTracking(webSiparisKodu: string): Promise<{
    ok: boolean;
    httpStatus?: number;
    isError?: boolean;
    message?: string | null;
    gonderiCount?: number;
    durum?: string | null;
    error?: string;
  }> {
    const cariKodu = this.configService.get<string>(
      "SURAT_KARGO_CARI_KODU",
      "",
    );
    const sifre = this.configService.get<string>("SURAT_KARGO_SIFRE", "");
    if (!cariKodu || !sifre) {
      return {
        ok: false,
        error: "SURAT_KARGO_CARI_KODU / SURAT_KARGO_SIFRE tanımlı değil",
      };
    }
    const isTestMode =
      this.configService
        .get<string>("SURAT_KARGO_TEST_MODE", "true")
        ?.trim() !== "false";
    const baseUrl = isTestMode ? SURAT_API_TEST : SURAT_API_LIVE;
    const url = `${baseUrl}?CariKodu=${encodeURIComponent(cariKodu)}&Sifre=${encodeURIComponent(sifre)}&WebSiparisKodu=${encodeURIComponent(webSiparisKodu)}`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      // Sürat (IIS) POST'ta Content-Length ister → boş gövde ile 0 gönderiyoruz.
      const response = await fetch(url, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: "",
        signal: controller.signal,
      });
      clearTimeout(timer);

      const text = await response.text();
      let body: SuratTakipResponse | null = null;
      try {
        body = JSON.parse(text) as SuratTakipResponse;
      } catch {
        return {
          ok: false,
          httpStatus: response.status,
          error: text?.slice(0, 200) || "JSON olmayan yanıt",
        };
      }

      return {
        ok: response.ok,
        httpStatus: response.status,
        isError: body?.IsError,
        message: body?.errorMessage ?? null,
        gonderiCount: body?.Gonderiler?.length ?? 0,
        durum: body?.Gonderiler?.[0]?.KargonunDurumu ?? null,
      };
    } catch (error: any) {
      return { ok: false, error: error?.message || String(error) };
    }
  }

  /**
   * Test konsolu: OrtakBarkodOlustur = gönderi oluştur + barkod/etiket üret.
   * Gövde create ile aynı desende: { KullaniciAdi, Sifre, Gonderi:{...} }. Dönüşte
   * gerçek KargoTakipNo + ZPL etiket verir (düz create bunları vermez). DB'ye dokunmaz.
   */
  async probeBarcode(payload: SuratGonderiPayload): Promise<{
    ok: boolean;
    isError?: boolean;
    message?: string | null;
    kargoTakipNo?: string | null;
    barcodeCount?: number;
    barcodeSample?: string | null;
    error?: string;
  }> {
    const cariKodu = this.configService.get<string>(
      "SURAT_KARGO_CARI_KODU",
      "",
    );
    const sifre = this.configService.get<string>("SURAT_KARGO_SIFRE", "");
    if (!cariKodu || !sifre) {
      return {
        ok: false,
        error: "SURAT_KARGO_CARI_KODU / SURAT_KARGO_SIFRE tanımlı değil",
      };
    }
    const isTestMode =
      this.configService
        .get<string>("SURAT_KARGO_TEST_MODE", "true")
        ?.trim() !== "false";
    const url = isTestMode ? SURAT_BARKOD_TEST : SURAT_BARKOD_LIVE;
    const body = JSON.stringify({
      KullaniciAdi: cariKodu,
      Sifre: sifre,
      Gonderi: buildRestGonderi(payload),
    });

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);

      const text = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        return {
          ok: false,
          error: text?.slice(0, 200) || "JSON olmayan yanıt",
        };
      }

      const isError = data?.isError ?? data?.IsError ?? false;
      const barcode: unknown[] = Array.isArray(data?.Barcode)
        ? data.Barcode
        : [];
      return {
        ok: isError !== true,
        isError: isError === true,
        message: data?.Message ?? null,
        kargoTakipNo: data?.KargoTakipNo ?? null,
        barcodeCount: barcode.length,
        barcodeSample: barcode.length ? String(barcode[0]).slice(0, 200) : null,
      };
    } catch (error: any) {
      return { ok: false, error: error?.message || String(error) };
    }
  }

  /**
   * Test konsolu: GonderiSil = gönderiyi sil/pasif et. Query auth (CariKodu/Sifre) +
   * WebSiparisKodu. Ham cevabı döner; DB'ye dokunmaz.
   */
  async probeGonderiSil(webSiparisKodu: string): Promise<{
    ok: boolean;
    httpStatus?: number;
    isError?: boolean;
    message?: string | null;
    error?: string;
  }> {
    const cariKodu = this.configService.get<string>(
      "SURAT_KARGO_CARI_KODU",
      "",
    );
    const sifre = this.configService.get<string>("SURAT_KARGO_SIFRE", "");
    if (!cariKodu || !sifre) {
      return {
        ok: false,
        error: "SURAT_KARGO_CARI_KODU / SURAT_KARGO_SIFRE tanımlı değil",
      };
    }
    const isTestMode =
      this.configService
        .get<string>("SURAT_KARGO_TEST_MODE", "true")
        ?.trim() !== "false";
    const baseUrl = isTestMode ? SURAT_SIL_TEST : SURAT_SIL_LIVE;
    const url = `${baseUrl}?CariKodu=${encodeURIComponent(cariKodu)}&Sifre=${encodeURIComponent(sifre)}&WebSiparisKodu=${encodeURIComponent(webSiparisKodu)}`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: "{}",
        signal: controller.signal,
      });
      clearTimeout(timer);
      const text = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        return {
          ok: false,
          httpStatus: response.status,
          error: text?.slice(0, 200) || "JSON olmayan yanıt",
        };
      }
      const isError = data?.IsError ?? data?.isError ?? false;
      return {
        ok: isError !== true,
        httpStatus: response.status,
        isError: isError === true,
        message: data?.Message ?? data?.GonderiSilResult ?? null,
      };
    } catch (error: any) {
      return { ok: false, error: error?.message || String(error) };
    }
  }

  /**
   * Sync a shipment's status from Sürat Kargo tracking API.
   * Updates Shipment record, creates ShipmentEvents, and handles delivery/return logic.
   */
  async syncShipmentTracking(shipmentId: string): Promise<boolean> {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { order: true },
    });

    if (!shipment || shipment.provider !== "surat") {
      return false;
    }

    // Sürat sorgusu OzelKargoTakipNo ile yapılır = shipment.trackingNumber
    // (oto-oluşturmada order.orderNumber olarak yazılır). providerTrackingId Sürat'ın
    // KargoTakipNo'sudur (WebSiparisKodu DEĞİL), orderId ise iç UUID — ikisi de yanlış
    // referans olup "Gonderiler boş" döndürür. (#84)
    // trackingNumber yoksa hiç Sürat'a düşmemiş manuel kayıt — eski orderId
    // fallback'i her zaman boş sonuç veriyordu; hiç sorma. (N3)
    if (!shipment.trackingNumber) {
      return false;
    }
    const data = await this.fetchTrackingInfo(shipment.trackingNumber);

    if (!data || data.Gonderiler.length === 0) {
      return false;
    }

    const gonderi = data.Gonderiler[0];
    return this.applyTrackingUpdate(shipment, gonderi);
  }

  /**
   * Sync all active Sürat shipments (not yet delivered/returned/cancelled).
   * Intended to be called by a cron job or Bull queue.
   */
  async syncAllActiveShipments(): Promise<{ synced: number; failed: number }> {
    // Only sync shipments that have a tracking reference. Auto-created
    // pending shipments without a Sürat tracking number would just spam
    // the API with "not found" responses.
    const activeShipments = await this.prisma.shipment.findMany({
      where: {
        provider: "surat",
        status: {
          notIn: [
            ShipmentStatus.delivered,
            ShipmentStatus.returned,
            ShipmentStatus.cancelled,
            ShipmentStatus.failed,
          ],
        },
        OR: [
          { providerTrackingId: { not: null } },
          { trackingNumber: { not: null } },
        ],
      },
    });

    let synced = 0;
    let failed = 0;

    for (const shipment of activeShipments) {
      try {
        const success = await this.syncShipmentTracking(shipment.id);
        if (success) synced++;
        else failed++;
      } catch (error: any) {
        this.logger.error(
          `Failed to sync shipment ${shipment.id}: ${error.message}`,
        );
        failed++;
      }
    }

    this.logger.log(
      `Surat tracking sync: ${synced} synced, ${failed} failed out of ${activeShipments.length}`,
    );
    return { synced, failed };
  }

  // ─── Kargo kodu (barkod) retry job ────────────────────────────────────────
  // İlk barkod oluşturma (OrtakBarkodOlustur) NON-BLOCKING'tir: Sürat timeout'u,
  // entegrasyonun o an kapalı olması ya da geçici hata yüzünden kayıt kodsuz
  // (providerTrackingId NULL) kalabilir. Poller yalnız DURUM çeker, kod üretmez —
  // ve Sürat'ta hiç oluşmamış bir gönderiyi backfill de edemez. Bu iş o boşluğu
  // kapatır: kodsuz kalmış kayıtlar için oluşturmayı güvenle yeniden dener.
  //
  // Idempotency anahtarı ilk oluşturmayla AYNI (OzelKargoTakipNo bazlı) → retry
  // Sürat'ta mükerrer gönderi oluşturmaz; ilk başarıdan sonra cache'ten döner.
  // Aday şartı hep providerTrackingId IS NULL olduğundan kodu olan kayıt hiç
  // aday olmaz (başarılı kayda ikinci kez dokunulmaz).

  /** Çok yeni kaydı deneme: ilk senkron denemesi henüz bitti, anlık yarış/timeout
   * kendiliğinden düzelebilir. */
  private static readonly RETRY_MIN_AGE_MS = 5 * 60 * 1000; // 5 dk
  /** Bu kadar süredir kod alamayan kayıt geçici değil yapısal hatalıdır (bozuk
   * adres vb.). Sonsuz denemeyi bırak → admin müdahalesine düş. */
  private static readonly RETRY_MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48 s
  /** API'yi boğmamak için tick başına yüzey başına üst sınır; kalanı sonraki tick. */
  private static readonly RETRY_BATCH = 25;
  /** M2: başarısız denemede üstel geri çekilme — taban bir tick (30 dk), tavan 8 s.
   * Kalıcı hatalı kayıt (bozuk adres vb.) böylece 48 saatte ~96 değil ~8-10 kez
   * denenir. Sayaç cache'te tutulur (migration yok); cache uçarsa backoff sıfırlanır
   * — kabul edilebilir, yalnız birkaç fazladan deneme demek. */
  private static readonly RETRY_BACKOFF_BASE_MS = 30 * 60 * 1000;
  private static readonly RETRY_BACKOFF_MAX_MS = 8 * 60 * 60 * 1000;

  private backoffKey(surface: string, id: string): string {
    return `surat:retry:backoff:${surface}:${id}`;
  }

  private attemptsKey(surface: string, id: string): string {
    return `surat:retry:attempts:${surface}:${id}`;
  }

  /** true → kayıt backoff penceresinde, bu tick atla (failed SAYILMAZ). */
  private async inRetryBackoff(surface: string, id: string): Promise<boolean> {
    return (await this.cache.get(this.backoffKey(surface, id))) != null;
  }

  /** Başarısız denemede sayacı artırıp üstel TTL'li backoff penceresi açar.
   * Sayaç pencereden UZUN yaşar (3 gün) ki pencere kapanınca üstel büyüme
   * sıfırlanmasın. */
  private async recordRetryFailure(surface: string, id: string): Promise<void> {
    const attempts =
      ((await this.cache.get<number>(this.attemptsKey(surface, id))) ?? 0) + 1;
    await this.cache.set(this.attemptsKey(surface, id), attempts, {
      ttl: 3 * 24 * 3600,
    });
    const delayMs = Math.min(
      SuratTrackingService.RETRY_BACKOFF_BASE_MS * 2 ** (attempts - 1),
      SuratTrackingService.RETRY_BACKOFF_MAX_MS,
    );
    await this.cache.set(this.backoffKey(surface, id), attempts, {
      ttl: Math.max(60, Math.floor(delayMs / 1000)),
    });
  }

  /** Başarıda backoff izlerini temizle. */
  private async clearRetryBackoff(surface: string, id: string): Promise<void> {
    await this.cache.del(this.backoffKey(surface, id));
    await this.cache.del(this.attemptsKey(surface, id));
  }

  /**
   * Kodsuz kalmış (providerTrackingId NULL) order/trade kayıtları için barkod
   * oluşturmayı yaş-filtreli olarak yeniden dener. Scheduler'dan periyodik
   * çağrılır. Her yüzey bağımsız — biri patlarsa diğeri devam eder.
   *
   * NOT (M4): refund iade barkodu için yüzey YOK — openReturnShipment blocking
   * olduğundan (başarısızsa throw, hiçbir şey yazmaz) "surat + kodsuz" aday
   * durumu oluşamaz; kurtarma refund-scheduler'ın 10-dk tam-açılış retry'ıdır.
   */
  async retryPendingBarcodes(): Promise<{
    order: BarcodeRetryStat;
    trade: BarcodeRetryStat;
  }> {
    const now = Date.now();
    // Aday penceresi:  (now - MAX)  <  createdAt  <  (now - MIN)
    const createdBefore = new Date(now - SuratTrackingService.RETRY_MIN_AGE_MS);
    const createdAfter = new Date(now - SuratTrackingService.RETRY_MAX_AGE_MS);

    const empty: BarcodeRetryStat = { retried: 0, failed: 0 };
    let order = empty;
    let trade = empty;

    try {
      order = await this.retryPendingOrderBarcodes(createdAfter, createdBefore);
    } catch (e: any) {
      this.logger.error(`Order barcode retry failed: ${e?.message}`);
    }
    try {
      trade = await this.retryPendingTradeBarcodes(createdAfter, createdBefore);
    } catch (e: any) {
      this.logger.error(`Trade barcode retry failed: ${e?.message}`);
    }

    // M2: pencereden kodsuz düşen kayıtlar sessizce kaybolmasın.
    try {
      await this.alertAgedOutBarcodes(createdAfter);
    } catch (e: any) {
      this.logger.error(`Barcode age-out alert failed: ${e?.message}`);
    }

    return { order, trade };
  }

  /** Lazy bildirim — NotificationService'i moduleRef ile çöz (circular import yok). */
  private async notifyUser(
    userId: string,
    typeName: "CARGO_CODE_READY" | "CARGO_MOVEMENT_MISSING",
    data: Record<string, any>,
  ): Promise<void> {
    try {
      const { NotificationService } = await import(
        "../notification/notification.service"
      );
      const { NotificationType } = await import("../notification/dto");
      const svc = this.moduleRef.get(NotificationService, { strict: false });
      await svc?.createInAppNotification(
        userId,
        NotificationType[typeName],
        data,
      );
    } catch (e: any) {
      this.logger.warn(
        `notify ${typeName} failed for user ${userId}: ${e?.message}`,
      );
    }
  }

  /**
   * İnsani senaryolar A9 + B15/D27 (CARGO_HUMAN_SCENARIOS.md): bayat kargo
   * tespiti. Kayıt başına haftada bir (cache dedupe) ERROR alarmı — log-tabanlı
   * uyarı kanalı yakalar; alarm sonrası akış ops runbook'ta.
   */
  async alertStaleCargo(): Promise<void> {
    const pickupDays = Number(process.env.CARGO_PICKUP_NO_DATA_DAYS) || 3;
    const staleDays = Number(process.env.CARGO_STALE_MOVEMENT_DAYS) || 14;
    const now = Date.now();
    const pickupCutoff = new Date(now - pickupDays * 24 * 3600 * 1000);
    const staleCutoff = new Date(now - staleDays * 24 * 3600 * 1000);
    const movingStatuses = [
      ShipmentStatus.picked_up,
      ShipmentStatus.in_transit,
      ShipmentStatus.at_delivery_branch,
      ShipmentStatus.out_for_delivery,
    ];

    // A9: satıcı manuel "kargoya verdim" işaretledi ama Sürat'tan HİÇ veri
    // gelmedi (providerStatusCode null) → paket muhtemelen şubeye gitmedi;
    // preparing deadline'ı bu işaretle atlatılmış olabilir. Satıcıya hatırlat
    // + alarm.
    const ghostPickups = await this.prisma.shipment.findMany({
      where: {
        provider: "surat",
        status: ShipmentStatus.picked_up,
        providerStatusCode: null,
        updatedAt: { lt: pickupCutoff },
      },
      select: {
        id: true,
        order: { select: { id: true, orderNumber: true, sellerId: true } },
      },
      take: 50,
    });
    for (const s of ghostPickups) {
      const key = `surat:alert:ghost-pickup:${s.id}`;
      if (await this.cache.get(key)) continue;
      await this.cache.set(key, 1, { ttl: 7 * 24 * 3600 });
      this.logger.error(
        `CARGO NO-MOVEMENT: shipment ${s.id} (order=${s.order?.orderNumber}) marked picked_up ${pickupDays}+ days ago but Surat has no record — possible deadline bypass`,
      );
      if (s.order) {
        await this.notifyUser(s.order.sellerId, "CARGO_MOVEMENT_MISSING", {
          reference: s.order.orderNumber,
          orderId: s.order.id,
        });
      }
    }

    // B15: hareket hâlindeki sipariş kargosunda N gündür yeni event yok →
    // kayıp şüphesi (Sürat tazmin süreci ops'ta başlatılır).
    const movingShipments = await this.prisma.shipment.findMany({
      where: {
        provider: "surat",
        status: { in: movingStatuses },
        createdAt: { lt: staleCutoff },
      },
      select: {
        id: true,
        status: true,
        order: { select: { orderNumber: true } },
        events: {
          orderBy: { occurredAt: "desc" },
          take: 1,
          select: { occurredAt: true },
        },
      },
      take: 50,
    });
    for (const s of movingShipments) {
      const lastMove = s.events[0]?.occurredAt ?? null;
      if (lastMove && lastMove > staleCutoff) continue;
      const key = `surat:alert:stale-shipment:${s.id}`;
      if (await this.cache.get(key)) continue;
      await this.cache.set(key, 1, { ttl: 7 * 24 * 3600 });
      this.logger.error(
        `CARGO STALE: shipment ${s.id} (order=${s.order?.orderNumber}, status=${s.status}) has no movement for ${staleDays}+ days — possible lost parcel`,
      );
    }

    // B15 (takas bacakları): aynı kayıp-şüphesi taraması TradeShipment için.
    const movingTradeLegs = await this.prisma.tradeShipment.findMany({
      where: {
        carrier: "surat",
        status: { in: movingStatuses },
        createdAt: { lt: staleCutoff },
      },
      select: {
        id: true,
        leg: true,
        tradeId: true,
        status: true,
        events: {
          orderBy: { eventTime: "desc" },
          take: 1,
          select: { eventTime: true },
        },
      },
      take: 50,
    });
    for (const t of movingTradeLegs) {
      const lastMove = t.events[0]?.eventTime ?? null;
      if (lastMove && lastMove > staleCutoff) continue;
      const key = `surat:alert:stale-trade:${t.id}`;
      if (await this.cache.get(key)) continue;
      await this.cache.set(key, 1, { ttl: 7 * 24 * 3600 });
      this.logger.error(
        `CARGO STALE: trade ${t.leg} shipment ${t.id} (trade=${t.tradeId}, status=${t.status}) has no movement for ${staleDays}+ days — possible lost parcel`,
      );
    }

    // D27: iade dönüş kargosu yolda ama N gündür teslim olmadı → kayıp şüphesi
    // (alıcı parasını alamıyor; ops manuel çözer).
    const staleReturns = await this.prisma.refundRequest.findMany({
      where: {
        returnProvider: "surat",
        status: "return_in_transit",
        returnCreatedAt: { lt: staleCutoff },
      },
      select: { id: true, refundNumber: true, returnShippedAt: true },
      take: 50,
    });
    for (const r of staleReturns) {
      if (r.returnShippedAt && r.returnShippedAt > staleCutoff) continue;
      const key = `surat:alert:stale-return:${r.id}`;
      if (await this.cache.get(key)) continue;
      await this.cache.set(key, 1, { ttl: 7 * 24 * 3600 });
      this.logger.error(
        `CARGO STALE: refund return ${r.refundNumber} in transit with no delivery for ${staleDays}+ days — possible lost parcel, buyer refund blocked`,
      );
    }
  }

  /**
   * M2: 48 saat penceresinden hâlâ kodsuz düşen kayıtlar için kayıt başına BİR
   * kez (cache dedupe, 7 gün) ERROR seviyesinde alarm logla — log-tabanlı uyarı
   * altyapısı bu satırı yakalar; bu noktadan sonrası manuel müdahaledir.
   */
  private async alertAgedOutBarcodes(createdAfter: Date): Promise<void> {
    // Tarama alt sınırı: 7 günden eski kayıtlar zaten alarmlandı/koptu.
    const oldest = new Date(Date.now() - 7 * 24 * 3600 * 1000);

    const agedShipments = await this.prisma.shipment.findMany({
      where: {
        provider: "surat",
        providerTrackingId: null,
        status: { in: [ShipmentStatus.pending, ShipmentStatus.label_created] },
        createdAt: { lt: createdAfter, gte: oldest },
        order: { status: { in: [OrderStatus.paid, OrderStatus.preparing] } },
      },
      select: { id: true, trackingNumber: true },
      take: 50,
    });
    for (const s of agedShipments) {
      const key = `surat:retry:ageout:shipment:${s.id}`;
      if (await this.cache.get(key)) continue;
      await this.cache.set(key, 1, { ttl: 7 * 24 * 3600 });
      this.logger.error(
        `BARCODE AGE-OUT: order shipment ${s.id} (oid=${s.trackingNumber}) left the 48h retry window with NO cargo code — manual intervention required`,
      );
    }

    const agedTradeLegs = await this.prisma.tradeShipment.findMany({
      where: {
        providerTrackingId: null,
        status: { in: [ShipmentStatus.pending, ShipmentStatus.label_created] },
        createdAt: { lt: createdAfter, gte: oldest },
        OR: [{ carrier: "surat" }, { leg: "return", carrier: "pending" }],
      },
      select: { id: true, leg: true, trackingNumber: true, tradeId: true },
      take: 50,
    });
    for (const t of agedTradeLegs) {
      const key = `surat:retry:ageout:trade:${t.id}`;
      if (await this.cache.get(key)) continue;
      await this.cache.set(key, 1, { ttl: 7 * 24 * 3600 });
      this.logger.error(
        `BARCODE AGE-OUT: trade ${t.leg} shipment ${t.id} (trade=${t.tradeId}, oid=${t.trackingNumber ?? "DRAFT"}) left the 48h retry window with NO cargo code — manual intervention required`,
      );
    }
  }

  /** Order Shipment kodsuzları — mevcut createSuratBarcodeForOrder'ı yeniden
   * kullanır (payload/idempotency birebir aynı). Ayrıca M1/H4: shipment satırı
   * hiç oluşmamış (Sürat OK ama lokal create patladı) veya iptal sonrası yeniden
   * ödemede `cancelled` kalmış CANLI siparişleri ensureSuratShipmentForOrder ile
   * onarır. */
  private async retryPendingOrderBarcodes(
    createdAfter: Date,
    createdBefore: Date,
  ): Promise<BarcodeRetryStat> {
    const codelessWhere: Prisma.ShipmentWhereInput = {
      provider: "surat",
      providerTrackingId: null,
      status: {
        in: [ShipmentStatus.pending, ShipmentStatus.label_created],
      },
      trackingNumber: { not: null },
      createdAt: { gte: createdAfter, lte: createdBefore },
      // Siparişi hâlâ canlı olanlar; iptal/teslim/iade akışına düşmüş sipariş
      // için kod üretmenin anlamı yok.
      order: { status: { in: [OrderStatus.paid, OrderStatus.preparing] } },
    };
    const candidates = await this.prisma.shipment.findMany({
      where: codelessWhere,
      select: {
        id: true,
        orderId: true,
        trackingNumber: true,
        order: { select: { orderNumber: true, sellerId: true } },
      },
      take: SuratTrackingService.RETRY_BATCH,
    });

    // M1/H4: satırsız veya `cancelled` satırlı canlı siparişler. Yaş penceresi
    // updatedAt üzerinden: yeniden ödeme updatedAt'i taşıdığı için deploy öncesi
    // takılmış siparişler de pencereye girer. Sanal siparişler (membership/boost)
    // kargo taşımaz — dışla.
    const orphanWhere: Prisma.OrderWhereInput = {
      status: { in: [OrderStatus.paid, OrderStatus.preparing] },
      updatedAt: { gte: createdAfter, lte: createdBefore },
      OR: [
        { shipment: null },
        { shipment: { status: ShipmentStatus.cancelled } },
      ],
      NOT: [
        { productId: { startsWith: "membership-" } },
        { productId: { startsWith: "boost-" } },
      ],
    };
    const orphanOrders = await this.prisma.order.findMany({
      where: orphanWhere,
      select: { id: true, orderNumber: true },
      take: SuratTrackingService.RETRY_BATCH,
    });

    // L8: batch dolduysa toplamı say — büyük yığın sessizce görünmez kalmasın.
    if (candidates.length === SuratTrackingService.RETRY_BATCH) {
      const total = await this.prisma.shipment.count({ where: codelessWhere });
      if (total > SuratTrackingService.RETRY_BATCH) {
        this.logger.warn(
          `Barcode retry backlog: ${total} code-less order shipments in window (processing ${SuratTrackingService.RETRY_BATCH}/tick)`,
        );
      }
    }
    if (orphanOrders.length === SuratTrackingService.RETRY_BATCH) {
      const total = await this.prisma.order.count({ where: orphanWhere });
      if (total > SuratTrackingService.RETRY_BATCH) {
        this.logger.warn(
          `Barcode retry backlog: ${total} orphan orders (no/cancelled shipment) in window (processing ${SuratTrackingService.RETRY_BATCH}/tick)`,
        );
      }
    }

    if (candidates.length === 0 && orphanOrders.length === 0) {
      return { retried: 0, failed: 0 };
    }

    const { PaymentCommonService } =
      await import("../payment/payment-common.service");
    const paymentCommon = this.moduleRef.get(PaymentCommonService, {
      strict: false,
    });
    if (!paymentCommon) {
      this.logger.warn(
        `PaymentCommonService not resolvable; skipping ${candidates.length + orphanOrders.length} order barcode retries`,
      );
      return { retried: 0, failed: candidates.length + orphanOrders.length };
    }

    let retried = 0;
    let failed = 0;

    // Önce onarım: satırı oluştur/revive et (kod da mümkünse hemen dolar; barkod
    // yine üretilemezse satır `pending`+kodsuz kalır ve aşağıdaki yüzey sonraki
    // tick'te tamamlar).
    for (const o of orphanOrders) {
      if (await this.inRetryBackoff("order-orphan", o.id)) continue;
      try {
        const res = await paymentCommon.ensureSuratShipmentForOrder(o.id);
        if (res === "created" || res === "revived") {
          retried++;
          await this.clearRetryBackoff("order-orphan", o.id);
          this.logger.log(
            `Retry OK: shipment ${res} for order ${o.orderNumber}`,
          );
        } else if (res === "skipped") {
          failed++;
          await this.recordRetryFailure("order-orphan", o.id);
        }
        // "exists": eşzamanlı onarımla yarıştık — no-op, sayma.
      } catch (e: any) {
        failed++;
        await this.recordRetryFailure("order-orphan", o.id);
        this.logger.error(
          `Retry ensure-shipment threw order=${o.orderNumber}: ${e?.message}`,
        );
      }
    }
    for (const s of candidates) {
      if (await this.inRetryBackoff("order", s.id)) continue;
      try {
        const barcode = await paymentCommon.createSuratBarcodeForOrder(
          s.orderId,
        );
        if (barcode?.kargoTakipNo) {
          await this.prisma.shipment.update({
            where: { id: s.id },
            data: {
              providerTrackingId: barcode.kargoTakipNo,
              labelZpl: barcode.labelZpl ?? null,
            },
          });
          retried++;
          await this.clearRetryBackoff("order", s.id);
          this.logger.log(
            `Retry OK: order barcode filled shipment=${s.id} oid=${s.trackingNumber} code=${barcode.kargoTakipNo}`,
          );
          // A2: kod gecikmeli oluştu — satıcı "hazırlanıyor" görüp bekliyordu;
          // artık şubeye gidebilir, haber ver.
          if (s.order) {
            await this.notifyUser(s.order.sellerId, "CARGO_CODE_READY", {
              reference: s.order.orderNumber,
              orderId: s.orderId,
              link: `/orders/${s.orderId}`,
            });
          }
        } else {
          failed++;
          await this.recordRetryFailure("order", s.id);
        }
      } catch (e: any) {
        failed++;
        await this.recordRetryFailure("order", s.id);
        this.logger.error(
          `Retry order barcode threw shipment=${s.id}: ${e?.message}`,
        );
      }
    }
    return { retried, failed };
  }

  /** Takas bacakları kodsuzları: depoya-giriş (to_warehouse) bacaklarını
   * TradeShipmentService, iade (return: reject RET-INI/REC + stuck RET-STK
   * DRAFT'ları) bacaklarını AdminTradeWarehouseService kendi payload
   * builder'larıyla yeniden dener. (H3: return DRAFT'ları önceden hiçbir
   * otomatik mekanizmanın kapsamında değildi.) */
  private async retryPendingTradeBarcodes(
    createdAfter: Date,
    createdBefore: Date,
  ): Promise<BarcodeRetryStat> {
    const inboundWhere: Prisma.TradeShipmentWhereInput = {
      carrier: "surat",
      providerTrackingId: null,
      leg: "to_warehouse",
      status: {
        in: [ShipmentStatus.pending, ShipmentStatus.label_created],
      },
      trackingNumber: { not: null },
      fromAddressId: { not: null },
      createdAt: { gte: createdAfter, lte: createdBefore },
    };
    const inbound = await this.prisma.tradeShipment.findMany({
      where: inboundWhere,
      select: { id: true },
      take: SuratTrackingService.RETRY_BATCH,
    });

    // Return DRAFT'ları: carrier "pending" (hiç submit olmamış) veya "surat" +
    // kodsuz (submit sonrası persist patlamış). Manuel fallback ("Tarodan
    // Warehouse") bilinçli — sorguya girmez.
    const returnWhere: Prisma.TradeShipmentWhereInput = {
      leg: "return",
      providerTrackingId: null,
      carrier: { in: ["pending", "surat"] },
      status: {
        in: [ShipmentStatus.pending, ShipmentStatus.label_created],
      },
      createdAt: { gte: createdAfter, lte: createdBefore },
    };
    const returns = await this.prisma.tradeShipment.findMany({
      where: returnWhere,
      select: { id: true },
      take: SuratTrackingService.RETRY_BATCH,
    });

    // L8: batch dolduysa toplamı say — yığın görünür olsun.
    for (const [label, where, fetched] of [
      ["inbound", inboundWhere, inbound.length],
      ["return", returnWhere, returns.length],
    ] as const) {
      if (fetched === SuratTrackingService.RETRY_BATCH) {
        const total = await this.prisma.tradeShipment.count({ where });
        if (total > SuratTrackingService.RETRY_BATCH) {
          this.logger.warn(
            `Barcode retry backlog: ${total} code-less trade ${label} legs in window (processing ${SuratTrackingService.RETRY_BATCH}/tick)`,
          );
        }
      }
    }

    if (inbound.length === 0 && returns.length === 0) {
      return { retried: 0, failed: 0 };
    }

    let retried = 0;
    let failed = 0;

    if (inbound.length > 0) {
      const { TradeShipmentService } =
        await import("../trade/trade-shipment.service");
      const svc = this.moduleRef.get(TradeShipmentService, { strict: false });
      if (!svc) {
        this.logger.warn(
          `TradeShipmentService not resolvable; skipping ${inbound.length} trade inbound barcode retries`,
        );
        failed += inbound.length;
      } else {
        for (const ts of inbound) {
          if (await this.inRetryBackoff("trade-inbound", ts.id)) continue;
          try {
            const ok = await svc.retryInboundBarcode(ts.id);
            if (ok) {
              retried++;
              await this.clearRetryBackoff("trade-inbound", ts.id);
            } else {
              failed++;
              await this.recordRetryFailure("trade-inbound", ts.id);
            }
          } catch (e: any) {
            failed++;
            await this.recordRetryFailure("trade-inbound", ts.id);
            this.logger.error(
              `Retry trade barcode threw trade-shipment=${ts.id}: ${e?.message}`,
            );
          }
        }
      }
    }

    if (returns.length > 0) {
      const { AdminTradeWarehouseService } =
        await import("../admin/admin-trade-warehouse.service");
      const warehouseSvc = this.moduleRef.get(AdminTradeWarehouseService, {
        strict: false,
      });
      if (!warehouseSvc) {
        this.logger.warn(
          `AdminTradeWarehouseService not resolvable; skipping ${returns.length} trade return barcode retries`,
        );
        failed += returns.length;
      } else {
        for (const ts of returns) {
          if (await this.inRetryBackoff("trade-return", ts.id)) continue;
          try {
            const ok = await warehouseSvc.retryReturnBarcode(ts.id);
            if (ok) {
              retried++;
              await this.clearRetryBackoff("trade-return", ts.id);
            } else {
              failed++;
              await this.recordRetryFailure("trade-return", ts.id);
            }
          } catch (e: any) {
            failed++;
            await this.recordRetryFailure("trade-return", ts.id);
            this.logger.error(
              `Retry trade return barcode threw trade-shipment=${ts.id}: ${e?.message}`,
            );
          }
        }
      }
    }

    return { retried, failed };
  }

  private async applyTrackingUpdate(
    shipment: any,
    gonderi: SuratTakipGonderi,
  ): Promise<boolean> {
    const mappedStatus = mapSuratStatusToShipmentStatus(
      gonderi.KargonunDurumuSayi,
    );
    // L2: bilinmeyen kod statüyü değiştirmez; ham kod yine kaydedilir.
    if (mappedStatus === null) {
      this.logger.warn(
        `Unknown Surat status code ${gonderi.KargonunDurumuSayi} ("${gonderi.KargonunDurumu}") for shipment ${shipment.id}; keeping status ${shipment.status}`,
      );
    }
    const newStatus = mappedStatus ?? shipment.status;
    const isDelivered = isSuratDelivered(gonderi.KargonunDurumuSayi);
    const isReturnCompleted = isSuratReturnCompleted(
      gonderi.KargonunDurumuSayi,
    );

    // #86: a re-poll can return a stale/older code; never regress a terminal
    // shipment (e.g. delivered → in_transit). Skip the update, keep current state.
    if (!canTransitionShipmentStatus(shipment.status, newStatus)) {
      this.logger.warn(
        `Skipping illegal shipment transition ${shipment.status} → ${newStatus} ` +
          `for ${shipment.id} (Sürat poll, code=${gonderi.KargonunDurumuSayi})`,
      );
      return false;
    }

    // Build update data
    const updateData: Record<string, any> = {
      status: newStatus,
      providerStatusCode: gonderi.KargonunDurumuSayi,
      providerRawStatus: gonderi.KargonunDurumu,
    };

    // Set tracking number and URL from Sürat if we don't have them yet
    if (!shipment.trackingNumber && gonderi.KargoTakipNo) {
      updateData.trackingNumber = gonderi.KargoTakipNo;
    }
    if (!shipment.trackingUrl && gonderi.TakipUrl) {
      updateData.trackingUrl = gonderi.TakipUrl;
    }

    // Provider-specific tracking ID
    if (!shipment.providerTrackingId && gonderi.KargoTakipNo) {
      updateData.providerTrackingId = gonderi.KargoTakipNo;
    }

    // Delivery info. H1: tarih parse edilemezse teslim gerçeği kaybolmasın —
    // yaklaşık zaman olarak şimdi'yi yaz (Invalid Date update'i patlatıyordu).
    if (isDelivered && gonderi.TeslimTarihi) {
      updateData.deliveredAt =
        this.parseSuratDate(gonderi.TeslimTarihi) ?? new Date();
    }
    if (gonderi.TeslimAlan) {
      updateData.receivedBy = gonderi.TeslimAlan;
    }

    // Estimated delivery — parse edilemiyorsa hiç yazma (kritik olmayan alan).
    if (gonderi.PlanlananTeslimTarihi && !shipment.estimatedDelivery) {
      const estimated = this.parseSuratDate(gonderi.PlanlananTeslimTarihi);
      if (estimated) {
        updateData.estimatedDelivery = estimated;
      }
    }

    // Return info
    if (isSuratReturnFlow(gonderi.KargonunDurumuSayi)) {
      const reason = gonderi.IadeAciklama || gonderi.DevirSebebi || "";
      if (reason) {
        updateData.returnReason = reason;
      }
    }

    // Update shipment — M7 CAS: canTransition guard'ı baştaki snapshot'a göre
    // çalışıyor; arada başka bir yazar (webhook, admin) statüyü değiştirdiyse bu
    // güncelleme stale'dir. Snapshot'ı where'e koy: count 0 → hiçbir alanı yazma,
    // sonraki tick taze snapshot'la işler. (delivered→in_transit regresyonu gibi
    // terminal-dışı yarış pencerelerini kapatır.)
    const cas = await this.prisma.shipment.updateMany({
      where: { id: shipment.id, status: shipment.status },
      data: updateData,
    });
    if (cas.count === 0) {
      this.logger.warn(
        `Skipping stale shipment update for ${shipment.id}: status changed concurrently (snapshot=${shipment.status})`,
      );
      return false;
    }

    // Sync movement events (Hareketler)
    await this.syncShipmentEvents(shipment.id, gonderi);

    // Teslim: order geçişini + escrow release'ini + 48h dallanmasını TEK kanonik
    // handler yapar (webhook/worker ile aynı yol). Eskiden burada yalnız
    // order.status=delivered set ediliyor, scheduleHoldReleaseOnDelivery ATLANIYOR ve
    // deliveredAt yazılmıyordu → PaymentHold.releaseAt null kalıp satıcı hiç ödenmiyordu
    // (kanonik oto-oluşturulan siparişler). Handler idempotent; re-poll deliveredAt'i
    // taşımaz. PaymentService/NotificationService circular import'u önlemek için lazy. (#83)
    if (isDelivered) {
      const deliveredAt =
        updateData.deliveredAt instanceof Date
          ? updateData.deliveredAt
          : new Date();
      try {
        const { PaymentService } = await import("../payment/payment.service");
        const paymentService = this.moduleRef.get(PaymentService, {
          strict: false,
        });
        if (paymentService) {
          const res = await paymentService.handleOrderDelivered(
            shipment.orderId,
            deliveredAt,
          );
          if (
            res.acted &&
            res.use48h &&
            res.confirmationDeadline &&
            res.buyerId
          ) {
            try {
              const { NotificationService } =
                await import("../notification/notification.service");
              const notificationService = this.moduleRef.get(
                NotificationService,
                {
                  strict: false,
                },
              );
              await notificationService?.notifyOrderDeliveredConfirm(
                res.buyerId,
                shipment.orderId,
                res.confirmationDeadline,
              );
            } catch (e: any) {
              this.logger.warn(
                `notify delivered-confirm failed (poll) for ${shipment.orderId}: ${e?.message}`,
              );
            }
          }
        }
      } catch (error: any) {
        this.logger.error(
          `handleOrderDelivered failed (poll) for order ${shipment.orderId}: ${error.message}. Manual intervention may be needed.`,
        );
      }
    }

    if (isReturnCompleted && shipment.order) {
      await this.prisma.order.update({
        where: { id: shipment.orderId },
        data: { status: OrderStatus.refund_requested },
      });

      // Auto-trigger refund when Sürat reports return delivery (status 12).
      // PaymentService is resolved lazily via ModuleRef to avoid circular import.
      try {
        const { PaymentService } = await import("../payment/payment.service");
        const paymentService = this.moduleRef.get(PaymentService, {
          strict: false,
        });
        if (paymentService) {
          await paymentService.processRefund(shipment.orderId);
          this.logger.log(
            `Auto-refunded order ${shipment.orderId} after Sürat return completion (suratCode=${gonderi.KargonunDurumuSayi})`,
          );
        }
      } catch (error: any) {
        this.logger.error(
          `Failed to auto-refund order ${shipment.orderId} after return: ${error.message}. Manual intervention may be needed.`,
        );
      }
    }

    this.logger.log(
      `Shipment ${shipment.id} synced: status=${newStatus} suratCode=${gonderi.KargonunDurumuSayi} (${gonderi.KargonunDurumu})`,
    );

    return true;
  }

  /**
   * Sync Sürat Hareketler (movement events) to ShipmentEvent records.
   * Only creates events that don't already exist (based on timestamp + action).
   */
  private async syncShipmentEvents(
    shipmentId: string,
    gonderi: SuratTakipGonderi,
  ): Promise<void> {
    if (!gonderi.Hareketler || gonderi.Hareketler.length === 0) return;

    const existingEvents = await this.prisma.shipmentEvent.findMany({
      where: { shipmentId },
      select: { occurredAt: true, status: true },
    });

    const existingSet = new Set(
      existingEvents.map((e) => `${e.occurredAt.toISOString()}|${e.status}`),
    );

    // H1: geçersiz IslemTarihi'nde .toISOString() RangeError fırlatıp senkronu
    // düşürüyordu — parse edilemeyen hareket satırını atla, kalanlar işlensin.
    const parsedEvents = gonderi.Hareketler.flatMap((h) => {
      const occurredAt = this.parseSuratDate(h.IslemTarihi);
      if (!occurredAt) {
        this.logger.warn(
          `Skipping shipment event with unparseable IslemTarihi "${h.IslemTarihi}" for ${shipmentId}`,
        );
        return [];
      }
      return [{ h, occurredAt }];
    });

    const newEvents = parsedEvents.filter(
      ({ h, occurredAt }) =>
        !existingSet.has(`${occurredAt.toISOString()}|${h.Islem}`),
    );

    if (newEvents.length === 0) return;

    await this.prisma.shipmentEvent.createMany({
      data: newEvents.map(({ h, occurredAt }) => ({
        shipmentId,
        status: h.Islem,
        description: h.Aciklama,
        location: h.HareketYeri,
        occurredAt,
      })),
    });
  }

  /**
   * Parse Sürat date format: "25/07/2024", "25.07.2024" (opsiyonel saat) veya ISO.
   * H1: ASLA Invalid Date döndürmez — tanınmayan format `null` döner. Eskiden
   * Invalid Date, prisma update'ine sızıp senkronu patlatıyor ve teslim edilen
   * siparişte `handleOrderDelivered` (escrow) hiç çalışmadan her poll'da yeniden
   * throw ediyordu. Çağıran taraf null'da güvenli fallback'e düşer.
   */
  private parseSuratDate(dateStr: string): Date | null {
    // DD/MM/YYYY veya DD.MM.YYYY (+ opsiyonel HH:mm[:ss])
    const ddmmyyyy = dateStr
      .trim()
      .match(
        /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
      );
    if (ddmmyyyy) {
      const [, d, m, y, hh, mm, ss] = ddmmyyyy;
      const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${(hh ?? "0").padStart(2, "0")}:${mm ?? "00"}:${ss ?? "00"}.000Z`;
      const parsed = new Date(iso);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const parsed = new Date(dateStr);
    if (Number.isNaN(parsed.getTime())) {
      this.logger.warn(`Unparseable Surat date: "${dateStr}"`);
      return null;
    }
    return parsed;
  }

  /**
   * Sync all active refund return shipments (alıcı → satıcı).
   * Refund returns are tracked separately on RefundRequest, not on Shipment.
   */
  async syncAllActiveRefundReturns(): Promise<{
    synced: number;
    failed: number;
  }> {
    const activeReturns = await this.prisma.refundRequest.findMany({
      where: {
        returnProvider: "surat",
        status: {
          in: ["return_shipment_open", "return_in_transit"],
        },
        returnTrackingNumber: { not: null },
      },
    });

    let synced = 0;
    let failed = 0;
    for (const rr of activeReturns) {
      try {
        const ok = await this.syncRefundReturnTracking(rr.id);
        if (ok) synced++;
        else failed++;
      } catch (error: any) {
        this.logger.error(
          `Failed to sync refund return ${rr.id}: ${error.message}`,
        );
        failed++;
      }
    }
    return { synced, failed };
  }

  async syncRefundReturnTracking(refundRequestId: string): Promise<boolean> {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
    });
    if (!rr || rr.returnProvider !== "surat" || !rr.returnTrackingNumber) {
      return false;
    }

    const data = await this.fetchTrackingInfo(rr.returnTrackingNumber);
    if (!data || data.Gonderiler.length === 0) return false;

    const gonderi = data.Gonderiler[0];
    const suratCode = gonderi.KargonunDurumuSayi;
    const newStatus = mapSuratStatusToShipmentStatus(suratCode);
    // L2: bilinmeyen kodda iade durumunu değiştirme — güncellenecek şey yok.
    if (newStatus === null) {
      this.logger.warn(
        `Unknown Surat status code ${suratCode} for refund return ${refundRequestId}; skipping update`,
      );
      return false;
    }
    // İade gönderisinin "geri teslim edildi" durumu, Sürat dokümanına (KargoTakip
    // HareketDetayi) göre KargonunDurumuSayi = 12 (İade Teslim Edildi). İleri
    // gönderinin 6/7 kodları bu akışta geçerli değil; yine de tolerans için
    // ikisini de kabul ediyoruz.
    const isReturnDelivered =
      isSuratReturnCompleted(suratCode) || isSuratDelivered(suratCode);

    // Backfill: gerçek Sürat kodu (KargoTakipNo) kayıtlı değilse poll cevabından
    // doldur — order/trade path'lerindeki backfill'in paritesi. Barkod-rework
    // öncesi açılan legacy iadeler kodu ancak buradan alır (UI kod gelene dek
    // "hazırlanıyor" gösterir).
    if (!rr.returnProviderTrackingId && gonderi.KargoTakipNo) {
      await this.prisma.refundRequest
        .update({
          where: { id: rr.id },
          data: { returnProviderTrackingId: gonderi.KargoTakipNo },
        })
        .catch((e: any) =>
          this.logger.warn(
            `Failed to backfill return code for refund ${rr.id}: ${e?.message}`,
          ),
        );
    }

    const { RefundService } = await import("../refund/refund.service");
    const refundService = this.moduleRef.get(RefundService, { strict: false });
    if (!refundService) {
      this.logger.warn(
        `RefundService not resolvable when syncing ${refundRequestId}`,
      );
      return false;
    }

    await refundService.applyReturnTrackingUpdate(refundRequestId, {
      status: newStatus,
      // H1: parse edilemeyen tarihte teslim gerçeği kaybolmasın — şimdi'ye düş.
      deliveredAt: isReturnDelivered
        ? ((gonderi.TeslimTarihi
            ? this.parseSuratDate(gonderi.TeslimTarihi)
            : null) ?? new Date())
        : undefined,
    });

    // D26: teslimde ANINDA finalize YOK — satıcıya kontrol penceresi
    // (REFUND_RETURN_INSPECTION_HOURS, vars. 24s) tanınır; pencere dolunca
    // refund-scheduler'ın finalize sweep'i otomatik işler. Sorun varsa admin
    // kaydı `disputed` yapar ve sweep onu atlar.
    if (isReturnDelivered) {
      this.logger.log(
        `RefundRequest ${refundRequestId} return delivered (suratCode=${suratCode}); finalize deferred to inspection window`,
      );
    }

    return true;
  }

  /**
   * Sync a single TradeShipment row from Sürat Kargo tracking API.
   * Updates status / deliveredAt and, when both `to_warehouse` legs of the
   * parent Trade are delivered, transitions the Trade to `at_warehouse`.
   */
  async syncTradeShipmentTracking(tradeShipmentId: string): Promise<boolean> {
    const tradeShipment = await this.prisma.tradeShipment.findUnique({
      where: { id: tradeShipmentId },
    });

    if (!tradeShipment || tradeShipment.carrier !== "surat") {
      return false;
    }

    // For TradeShipment we don't store a providerTrackingId column, so the
    // tracking reference is the trackingNumber we recorded at label creation.
    const webSiparisKodu = tradeShipment.trackingNumber;
    if (!webSiparisKodu) {
      return false;
    }

    const data = await this.fetchTrackingInfo(webSiparisKodu);
    if (!data || data.Gonderiler.length === 0) {
      return false;
    }

    const gonderi = data.Gonderiler[0];
    const mappedStatus = mapSuratStatusToShipmentStatus(
      gonderi.KargonunDurumuSayi,
    );
    // L2: bilinmeyen kod statüyü değiştirmez; backfill/shippedAt yine işlenir.
    if (mappedStatus === null) {
      this.logger.warn(
        `Unknown Surat status code ${gonderi.KargonunDurumuSayi} for trade-shipment ${tradeShipment.id}; keeping status ${tradeShipment.status}`,
      );
    }
    const newStatus = mappedStatus ?? tradeShipment.status;
    const isDelivered = isSuratDelivered(gonderi.KargonunDurumuSayi);

    // #86: same terminal-regression guard for the trade-shipment poll path.
    if (!canTransitionShipmentStatus(tradeShipment.status, newStatus)) {
      this.logger.warn(
        `Skipping illegal trade-shipment transition ${tradeShipment.status} → ${newStatus} ` +
          `for ${tradeShipment.id} (Sürat poll, code=${gonderi.KargonunDurumuSayi})`,
      );
      return false;
    }

    const updateData: Record<string, any> = {
      status: newStatus,
    };

    // Backfill the real Sürat code into providerTrackingId if it's not set yet
    // (created before this change, or barcode-create failed). trackingNumber
    // stays our OzelKargoTakipNo — the query ref must not change.
    if (!tradeShipment.providerTrackingId && gonderi.KargoTakipNo) {
      updateData.providerTrackingId = gonderi.KargoTakipNo;
    }

    // M3: escrow bacağında kargoya veriliş anı hiçbir yerde yazılmıyordu →
    // handedToCargo cancel-lock'u ve "both shipped" reveal gate'i hep ölüydü.
    // Sürat ilk hareketi raporladığında shippedAt'i mühürle.
    const movementStatuses: ShipmentStatus[] = [
      ShipmentStatus.picked_up,
      ShipmentStatus.in_transit,
      ShipmentStatus.at_delivery_branch,
      ShipmentStatus.out_for_delivery,
      ShipmentStatus.delivered,
    ];
    if (!tradeShipment.shippedAt && movementStatuses.includes(newStatus)) {
      updateData.shippedAt = new Date();
    }

    if (isDelivered && !tradeShipment.deliveredAt) {
      // H1: parse edilemeyen tarihte teslim bilgisi kaybolmasın — şimdi'ye düş.
      updateData.deliveredAt =
        (gonderi.TeslimTarihi
          ? this.parseSuratDate(gonderi.TeslimTarihi)
          : null) ?? new Date();
    }

    // M7 CAS: order path ile aynı — stale snapshot'la yazma.
    const cas = await this.prisma.tradeShipment.updateMany({
      where: { id: tradeShipment.id, status: tradeShipment.status },
      data: updateData,
    });
    if (cas.count === 0) {
      this.logger.warn(
        `Skipping stale trade-shipment update for ${tradeShipment.id}: status changed concurrently (snapshot=${tradeShipment.status})`,
      );
      return false;
    }

    await this.syncTradeShipmentEvents(tradeShipment.id, gonderi);

    // Critical transition: when this is a `to_warehouse` leg and it just
    // became delivered, check whether the OTHER to_warehouse leg of the same
    // trade is also delivered. If so, transition the parent Trade.
    if (
      isDelivered &&
      tradeShipment.leg === "to_warehouse" &&
      tradeShipment.recipientType === "warehouse"
    ) {
      // H2: depoya İLK varışta kullanıcı iptalini kilitle (admin path ile aynı
      // semantik) — sonra iki bacak da teslimse at_warehouse'a geçir.
      await this.maybeLockTradeCancelOnArrival(tradeShipment.tradeId);
      await this.maybeTransitionTradeToAtWarehouse(tradeShipment.tradeId);
    }

    this.logger.log(
      `TradeShipment ${tradeShipment.id} synced: status=${newStatus} suratCode=${gonderi.KargonunDurumuSayi} (${gonderi.KargonunDurumu})`,
    );

    return true;
  }

  /**
   * Sync all active TradeShipments shipped via Sürat. Mirrors
   * {@link syncAllActiveShipments} but operates on the TradeShipment table.
   */
  async syncAllActiveTradeShipments(): Promise<{
    synced: number;
    failed: number;
  }> {
    const activeTradeShipments = await this.prisma.tradeShipment.findMany({
      where: {
        carrier: "surat",
        status: {
          in: [
            ShipmentStatus.label_created,
            ShipmentStatus.pending,
            ShipmentStatus.in_transit,
          ],
        },
        trackingNumber: { not: null },
      },
    });

    let synced = 0;
    let failed = 0;

    for (const ts of activeTradeShipments) {
      try {
        const success = await this.syncTradeShipmentTracking(ts.id);
        if (success) synced++;
        else failed++;
      } catch (error: any) {
        this.logger.error(
          `Failed to sync trade-shipment ${ts.id}: ${error.message}`,
        );
        failed++;
      }
    }

    this.logger.log(
      `Surat trade-shipment sync: ${synced} synced, ${failed} failed out of ${activeTradeShipments.length}`,
    );
    return { synced, failed };
  }

  /**
   * Best-effort dedupe + insert of Sürat Hareketler rows into TradeShipmentEvent.
   */
  private async syncTradeShipmentEvents(
    tradeShipmentId: string,
    gonderi: SuratTakipGonderi,
  ): Promise<void> {
    if (!gonderi.Hareketler || gonderi.Hareketler.length === 0) return;

    const existingEvents = await this.prisma.tradeShipmentEvent.findMany({
      where: { tradeShipmentId },
      select: { eventTime: true, status: true },
    });

    const existingSet = new Set(
      existingEvents.map((e) => `${e.eventTime.toISOString()}|${e.status}`),
    );

    // H1: geçersiz IslemTarihi → RangeError → senkron düşer; satırı atla.
    const parsedEvents = gonderi.Hareketler.flatMap((h) => {
      const eventTime = this.parseSuratDate(h.IslemTarihi);
      if (!eventTime) {
        this.logger.warn(
          `Skipping trade-shipment event with unparseable IslemTarihi "${h.IslemTarihi}" for ${tradeShipmentId}`,
        );
        return [];
      }
      return [{ h, eventTime }];
    });

    const newEvents = parsedEvents.filter(
      ({ h, eventTime }) =>
        !existingSet.has(`${eventTime.toISOString()}|${h.Islem}`),
    );

    if (newEvents.length === 0) return;

    await this.prisma.tradeShipmentEvent.createMany({
      data: newEvents.map(({ h, eventTime }) => ({
        tradeShipmentId,
        status: h.Islem,
        description: h.Aciklama,
        location: h.HareketYeri,
        eventTime,
      })),
    });
  }

  /**
   * H2: Poll yolunda depoya İLK varışta kullanıcı iptalini kilitle — admin-manuel
   * markWarehouseReceived ile aynı semantik (firstWarehouseArrivalAt +
   * cancelLockedAt + trade.cancel-locked event'i). Eskiden bu alanları yalnız
   * admin path set ediyordu; poller teslimi işlediğinde koli fiziksel olarak
   * depodayken taraflar takası hâlâ iptal edebiliyordu. FOR UPDATE + null-check
   * ile idempotent; admin path'le yarışta biri kazanır, diğeri no-op.
   */
  private async maybeLockTradeCancelOnArrival(tradeId: string): Promise<void> {
    const locked = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM trades WHERE id = ${tradeId} FOR UPDATE`;
      const trade = await tx.trade.findUnique({
        where: { id: tradeId },
        select: {
          firstWarehouseArrivalAt: true,
          initiatorId: true,
          receiverId: true,
        },
      });
      if (!trade || trade.firstWarehouseArrivalAt) return null;
      const now = new Date();
      await tx.trade.update({
        where: { id: tradeId },
        data: {
          firstWarehouseArrivalAt: now,
          cancelLockedAt: now,
          updatedAt: now,
        },
      });
      return { initiatorId: trade.initiatorId, receiverId: trade.receiverId };
    });
    if (!locked) return;

    this.logger.log(
      `Trade ${tradeId} cancel locked on first warehouse arrival (Sürat poll)`,
    );
    // Bildirim admin path'iyle aynı event üzerinden; lazy (circular import yok).
    try {
      const { EventService } = await import("../events/event.service");
      const eventService = this.moduleRef.get(EventService, { strict: false });
      await eventService?.emitTradeCancelLocked({
        tradeId,
        initiatorId: locked.initiatorId,
        receiverId: locked.receiverId,
      });
    } catch (e: any) {
      this.logger.warn(
        `emit trade.cancel-locked failed (poll) for ${tradeId}: ${e?.message}`,
      );
    }
  }

  /**
   * If both to_warehouse legs of the trade are delivered and the trade is
   * still pre-warehouse, atomically flip Trade.status -> at_warehouse and
   * write a TradeShipmentEvent on each leg recording the auto-transition.
   */
  private async maybeTransitionTradeToAtWarehouse(
    tradeId: string,
  ): Promise<void> {
    const transitioned = await this.prisma.$transaction(async (tx) => {
      // Lock the trade row to avoid racing with admin manual transition.
      await tx.$queryRaw`SELECT id FROM trades WHERE id = ${tradeId} FOR UPDATE`;

      const trade = await tx.trade.findUnique({
        where: { id: tradeId },
        select: { id: true, status: true, firstWarehouseArrivalAt: true },
      });
      if (!trade) return false;
      if (trade.status === TradeStatus.at_warehouse) return false;

      const toWarehouseShipments = await tx.tradeShipment.findMany({
        where: { tradeId, leg: "to_warehouse" },
        select: { id: true, status: true, deliveredAt: true },
      });

      const bothDelivered =
        toWarehouseShipments.length >= 2 &&
        toWarehouseShipments.every(
          (s) =>
            s.deliveredAt !== null || s.status === ShipmentStatus.delivered,
        );

      if (!bothDelivered) return false;

      const now = new Date();
      await tx.trade.update({
        where: { id: tradeId },
        data: {
          status: TradeStatus.at_warehouse,
          updatedAt: now,
          // H2 savunması: ilk-varış kilidi bir şekilde atlanmışsa (fix öncesi
          // teslim edilen bacak) en geç burada mühürle — admin path ile aynı.
          ...(trade.firstWarehouseArrivalAt
            ? {}
            : { firstWarehouseArrivalAt: now, cancelLockedAt: now }),
        },
      });

      // Log the transition on each to_warehouse shipment so it surfaces in
      // the trade event timeline (no admin user, so no AuditLog row).
      await tx.tradeShipmentEvent.createMany({
        data: toWarehouseShipments.map((s) => ({
          tradeShipmentId: s.id,
          status: "auto_at_warehouse",
          description:
            "Both to_warehouse legs delivered; trade auto-transitioned to at_warehouse",
          eventTime: now,
        })),
      });

      this.logger.log(
        `Trade ${tradeId} auto-transitioned to at_warehouse after Sürat reported both to_warehouse legs delivered`,
      );
      return true;
    });

    // YENİ MODEL: takas nakit komisyonu e-Arşivi CASH PAYMENT'ta değil, ürünler DEPOYA VARINCA
    // (at_warehouse) kesilir → iptal penceresi geçmiş olur, iptalde fatura kesilmemiş olur.
    // Post-commit, non-blocking, idempotent (cut() type+sourceId tekil).
    if (!transitioned) return;
    try {
      const tcp = await this.prisma.tradeCashPayment.findUnique({
        where: { tradeId },
        select: { id: true, status: true },
      });
      if (tcp && tcp.status === PaymentStatus.completed) {
        const elogo = this.moduleRef.get(ElogoInvoicingService, {
          strict: false,
        });
        await elogo
          .issueTradeCashCommissionInvoice(tcp.id)
          .catch((e: any) =>
            this.logger.warn(
              `eLogo takas komisyonu (depo) tetik hatası ${tradeId}: ${e?.message}`,
            ),
          );
      }
    } catch (e: any) {
      this.logger.warn(
        `at_warehouse takas komisyonu faturası hatası ${tradeId}: ${e?.message}`,
      );
    }
  }
}
