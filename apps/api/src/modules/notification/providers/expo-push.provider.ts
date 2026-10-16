/**
 * Expo Push Notification Provider
 * GAP-014: Real Notification Providers (Expo, SendGrid, SMS)
 *
 * Requirement: Push notifications for iOS & Android (project.md)
 *
 * Gönderimin TEK çekirdeği (`sendMessages`): ana yol (dispatch) ve kuyruk yolu
 * (push worker) aynı bilet işleme, ölü token temizliği ve makbuz (receipt)
 * planlamasından geçer. Eskiden worker kendi fetch'ini yapıyordu, makbuz hiç
 * okunmuyordu: APNs/FCM'in sonradan "cihaz kayıtlı değil" ya da "kimlik bilgisi
 * geçersiz" dediği gönderimler sessizce kayboluyordu.
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bull";
import type { Queue } from "bull";
import { PrismaService } from "../../../prisma";
import { QUEUE_NAMES } from "../../../workers/constants";
import { i18nMessage } from "../../i18n";
import {
  EXPO_RECEIPT_BATCH_SIZE,
  EXPO_RECEIPT_CHECK_DELAY_MS,
  EXPO_REQUEST_TIMEOUT_MS,
  EXPO_SEND_BATCH_SIZE,
  PUSH_RECEIPT_JOB,
  chunk,
  classifyExpoPushError,
  isExpoPushToken,
  type PushReceiptJobData,
  type PushTicketRef,
} from "../helpers/push-delivery";

export interface ExpoPushMessage {
  to: string; // Expo push token (tek cihaz — bilet sırası token'la eşlenir)
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  channelId?: string;
  priority?: "default" | "normal" | "high";
  ttl?: number; // Time to live in seconds
  subtitle?: string; // iOS only
}

export interface ExpoPushTicket {
  id?: string;
  status: "ok" | "error";
  message?: string;
  details?: {
    error?: string;
    expoPushToken?: string;
  };
}

export interface ExpoPushReceipt {
  status: "ok" | "error";
  message?: string;
  details?: {
    error?: string;
  };
}

export interface PushNotificationResult {
  success: boolean;
  ticketId?: string;
  error?: string;
}

/** `sendMessages` özeti — worker iş sonucu ve log için. */
export interface PushSendOutcome {
  sent: number;
  failed: number;
  /** DeviceNotRegistered nedeniyle pasifleştirilen token satırı sayısı. */
  deactivated: number;
  tickets: ExpoPushTicket[];
}

/** `checkReceipts` özeti. */
export interface PushReceiptOutcome {
  checked: number;
  ok: number;
  failed: number;
  deactivated: number;
}

/** Ana yolun (sendToUser) seçenekleri. */
export interface SendToUserOptions {
  /** Android kanal kimliği (`pushChannelFor`). */
  channelId?: string;
  /** iOS uygulama rozeti: `"unread"` → okunmamış zil bildirimi sayısı. */
  badge?: number | "unread";
}

@Injectable()
export class ExpoPushProvider {
  private readonly logger = new Logger(ExpoPushProvider.name);
  private readonly expoApiUrl = "https://exp.host/--/api/v2/push/send";
  private readonly expoReceiptsUrl =
    "https://exp.host/--/api/v2/push/getReceipts";
  private readonly accessToken: string;
  private readonly enabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    // Makbuz kontrolü gecikmeli bir `push` işi olarak planlanır. Kuyruk yoksa
    // (kısmi test kurulumu) gönderim yine yapılır, yalnız makbuz okunmaz.
    @Optional()
    @InjectQueue(QUEUE_NAMES.PUSH)
    private readonly pushQueue?: Queue,
  ) {
    this.accessToken = this.configService.get<string>("EXPO_ACCESS_TOKEN", "");
    this.enabled = !!this.accessToken;

    if (!this.enabled) {
      this.logger.warn(
        "EXPO_ACCESS_TOKEN is not set; push is sent without Expo enhanced security.",
      );
    }
  }

  /**
   * Validate Expo push token format
   */
  isValidExpoToken(token: string): boolean {
    return isExpoPushToken(token);
  }

  private buildHeaders(): Record<string, string> {
    // Not: Expo Push endpoint'i access-token OLMADAN da çalışır (token yalnızca
    // "Enhanced Security" açıkken gerekir); auth header sadece token varsa eklenir.
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    };
    if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }
    return headers;
  }

  /** Süre sınırlı Expo isteği (asılı bağlantı bir işi/kapanışı bekletmesin). */
  private async postJson(url: string, body: unknown): Promise<unknown> {
    const response = await fetch(url, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(EXPO_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Expo Push API error: ${response.status}${text ? ` - ${text.slice(0, 300)}` : ""}`,
      );
    }
    return response.json();
  }

  /**
   * Gönderim çekirdeği. Mesajlar 100'lük parçalarla gönderilir; biletler
   * mesaj sırasıyla token'a eşlenir:
   *  - `DeviceNotRegistered` → token hemen pasifleşir,
   *  - kimlik bilgisi / yük boyutu hataları ayrı (alarm) mesajla loglanır,
   *  - başarılı biletler ~15 dk sonra makbuz kontrolüne planlanır.
   *
   * Bir parçanın HTTP isteği başarısızsa fırlatır (worker yeniden dener).
   */
  async sendMessages(messages: ExpoPushMessage[]): Promise<PushSendOutcome> {
    const valid = messages.filter((m) => isExpoPushToken(m.to));
    const outcome: PushSendOutcome = {
      sent: 0,
      failed: 0,
      deactivated: 0,
      tickets: [],
    };
    if (valid.length === 0) return outcome;

    const deadTokens: string[] = [];
    const receiptRefs: PushTicketRef[] = [];

    for (const part of chunk(valid, EXPO_SEND_BATCH_SIZE)) {
      const payload = part.map((m) => ({
        to: m.to,
        title: m.title,
        body: m.body,
        data: m.data,
        sound: m.sound === undefined ? "default" : m.sound,
        badge: m.badge,
        channelId: m.channelId ?? "default",
        priority: m.priority ?? "high",
        ttl: m.ttl ?? 86400, // 24 hours default
        subtitle: m.subtitle,
      }));
      const response = (await this.postJson(this.expoApiUrl, payload)) as {
        data?: ExpoPushTicket[] | ExpoPushTicket;
      };
      const raw = response?.data;
      const tickets = Array.isArray(raw) ? raw : raw ? [raw] : [];

      tickets.forEach((ticket, index) => {
        const token = part[index]?.to;
        outcome.tickets.push(ticket);
        if (ticket.status === "ok") {
          outcome.sent++;
          if (ticket.id && token) receiptRefs.push({ id: ticket.id, token });
          return;
        }
        outcome.failed++;
        const code = ticket.details?.error;
        if (classifyExpoPushError(code) === "device_not_registered" && token) {
          deadTokens.push(token);
        } else {
          this.reportDeliveryError("ticket", code, ticket.message);
        }
      });
    }

    outcome.deactivated = await this.deactivateTokens(deadTokens);
    await this.scheduleReceiptCheck(receiptRefs);
    return outcome;
  }

  /**
   * Bilet/makbuz hatasını sınıfına göre loglar. Kimlik bilgisi ve yük boyutu
   * hataları `error` seviyesinde AYRI mesajla gider (Sentry'de ayrı sorun):
   * ilki hiçbir cihaza push gitmediği, ikincisi üreticinin hatalı yük kurduğu
   * anlamına gelir.
   */
  private reportDeliveryError(
    stage: "ticket" | "receipt",
    code: string | undefined,
    message: string | undefined,
  ): void {
    switch (classifyExpoPushError(code)) {
      case "credentials":
        this.logger.error(
          `[push-credentials] Expo ${stage} rejected by APNs/FCM (${code}): push credentials are invalid or mismatched — check the EAS push credentials. ${message ?? ""}`,
        );
        return;
      case "message_too_big":
        this.logger.error(
          `[push-message-too-big] Expo ${stage} rejected: payload exceeds 4 KB (${code}). ${message ?? ""}`,
        );
        return;
      default:
        this.logger.warn(
          `Expo push ${stage} error (${code ?? "unknown"}): ${message ?? ""}`,
        );
    }
  }

  /**
   * Ölü token temizliği — ana yol, worker ve makbuz kontrolü bunu kullanır.
   * Token'ın TÜM satırları pasifleşir (cihaz kaydı silinmiş).
   */
  async deactivateTokens(tokens: string[]): Promise<number> {
    const unique = [...new Set(tokens.filter(Boolean))];
    if (unique.length === 0) return 0;
    const { count } = await this.prisma.pushToken.updateMany({
      where: { token: { in: unique }, isActive: true },
      data: { isActive: false },
    });
    if (count > 0) {
      this.logger.log(`Deactivated ${count} unregistered push token row(s)`);
    }
    return count;
  }

  /**
   * Başarılı biletleri gecikmeli makbuz kontrolüne planlar (Bull işi, `push`
   * kuyruğu). İş verisi bilet→token eşlemesini taşır; ayrı tablo gerekmez.
   * İş yalnız worker rolünde işlenir; worker yoksa Redis'te bekler.
   */
  private async scheduleReceiptCheck(refs: PushTicketRef[]): Promise<void> {
    if (refs.length === 0 || !this.pushQueue) return;
    try {
      for (const part of chunk(refs, EXPO_RECEIPT_BATCH_SIZE)) {
        const data: PushReceiptJobData = { tickets: part };
        await this.pushQueue.add(PUSH_RECEIPT_JOB, data, {
          delay: EXPO_RECEIPT_CHECK_DELAY_MS,
          attempts: 3,
          backoff: { type: "exponential", delay: 60_000 },
          removeOnComplete: true,
        });
      }
    } catch (error) {
      // Makbuz kontrolü temizlik işidir; planlanamaması gönderimi bozmaz.
      this.logger.warn(
        `Push receipt check could not be scheduled: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Makbuzları okur (en çok 1000 kimlik/istek) ve sonuca göre davranır:
   * DeviceNotRegistered → token pasif; kimlik bilgisi / yük boyutu → alarm.
   * HTTP hatasında fırlatır (Bull yeniden dener; makbuzlar 24 saat durur).
   */
  async checkReceipts(refs: PushTicketRef[]): Promise<PushReceiptOutcome> {
    const outcome: PushReceiptOutcome = {
      checked: 0,
      ok: 0,
      failed: 0,
      deactivated: 0,
    };
    const tokenById = new Map(refs.map((r) => [r.id, r.token]));
    const deadTokens: string[] = [];

    for (const part of chunk([...tokenById.keys()], EXPO_RECEIPT_BATCH_SIZE)) {
      const receipts = await this.getReceipts(part);
      for (const [id, receipt] of Object.entries(receipts)) {
        outcome.checked++;
        if (receipt.status === "ok") {
          outcome.ok++;
          continue;
        }
        outcome.failed++;
        const code = receipt.details?.error;
        const token = tokenById.get(id);
        if (classifyExpoPushError(code) === "device_not_registered" && token) {
          deadTokens.push(token);
        } else {
          this.reportDeliveryError("receipt", code, receipt.message);
        }
      }
    }

    outcome.deactivated = await this.deactivateTokens(deadTokens);
    return outcome;
  }

  /**
   * Get push notification receipts (to check delivery status).
   * Access token gerekmez (yalnız Enhanced Security açıksa eklenir).
   */
  async getReceipts(
    ticketIds: string[],
  ): Promise<Record<string, ExpoPushReceipt>> {
    if (ticketIds.length === 0) return {};
    const result = (await this.postJson(this.expoReceiptsUrl, {
      ids: ticketIds,
    })) as { data?: Record<string, ExpoPushReceipt> };
    return result?.data ?? {};
  }

  /**
   * iOS uygulama rozeti: okunmamış zil bildirimi sayısı (zil sayacıyla aynı
   * tanım — `NotificationDispatchService.getUnreadCount`). Okunamazsa rozet
   * gönderilmez (cihazdaki değer korunur).
   */
  async unreadBadgeCount(userId: string): Promise<number | undefined> {
    try {
      return await this.prisma.notificationLog.count({
        where: { userId, channel: "in_app", status: "sent" },
      });
    } catch {
      return undefined;
    }
  }

  /**
   * Send push notification to a user by user ID — tüm aktif cihazlarına TEK
   * istekte.
   */
  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
    options: SendToUserOptions = {},
  ): Promise<PushNotificationResult[]> {
    const tokens = await this.prisma.pushToken.findMany({
      where: { userId, isActive: true },
      select: { token: true },
    });
    const validTokens = tokens
      .map((t) => t.token)
      .filter((t) => isExpoPushToken(t));

    if (validTokens.length === 0) {
      this.logger.debug(`No valid push tokens for user ${userId}`);
      return [{ success: false, error: "No push tokens found for user" }];
    }

    const badge =
      options.badge === "unread"
        ? await this.unreadBadgeCount(userId)
        : options.badge;

    try {
      const outcome = await this.sendMessages(
        validTokens.map((to) => ({
          to,
          title,
          body,
          data,
          badge,
          channelId: options.channelId,
        })),
      );
      return outcome.tickets.map((ticket) =>
        ticket.status === "ok"
          ? { success: true, ticketId: ticket.id }
          : { success: false, error: ticket.message },
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(
        `Failed to send push notification via Expo: ${errorMessage}`,
      );
      return [{ success: false, error: errorMessage }];
    }
  }

  /**
   * Register push token for a user.
   *
   * `deviceId` kurulum başına SABİT kimliktir (mobil ≥ 1.0.7); eski sürümler
   * buraya cihaz modelini yazıyordu. `deviceModel` ayrı alandır.
   */
  async registerToken(
    userId: string,
    token: string,
    platform: "ios" | "android",
    deviceId?: string,
    deviceModel?: string,
  ): Promise<void> {
    if (!this.isValidExpoToken(token)) {
      throw new BadRequestException(i18nMessage("server.pushToken.invalid"));
    }

    // Kayıt rotası (çıkışta jetonsuz iptal için) public olduğundan yasaklı
    // kullanıcı guard'ına takılmaz: yasaklı / silinmiş hesap cihaz kaydedemez —
    // yoksa yasaklamada pasifleştirilen token bir sonraki açılışta geri gelir.
    const owner = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isBanned: true, deletedAt: true },
    });
    if (!owner || owner.isBanned || owner.deletedAt) {
      throw new ForbiddenException(
        i18nMessage("server.pushToken.accountInactive"),
      );
    }

    // Bir Expo token'ı bir CİHAZDIR: aynı cihazda başka bir hesap oturum
    // açtıysa önceki hesabın satırı pasifleşir — yoksa önceki hesabın
    // bildirimleri (mesaj önizlemesi dahil) yeni kullanıcının ekranına düşer
    // (önceki hesap çıkış yapmadan, ör. oturum süresi dolarak ayrıldıysa).
    // `deviceModel` verilmediyse (eski sürüm) mevcut değere dokunulmaz.
    const modelField = deviceModel !== undefined ? { deviceModel } : {};
    await this.prisma.$transaction([
      this.prisma.pushToken.updateMany({
        where: { token, userId: { not: userId }, isActive: true },
        data: { isActive: false },
      }),
      this.prisma.pushToken.upsert({
        where: {
          userId_token: { userId, token },
        },
        update: {
          platform,
          deviceId,
          ...modelField,
          isActive: true,
          updatedAt: new Date(),
        },
        create: {
          userId,
          token,
          platform,
          deviceId,
          ...modelField,
          isActive: true,
        },
      }),
    ]);

    this.logger.log(
      `Push token registered for user ${userId}, platform: ${platform}`,
    );
  }

  /**
   * Deactivate a push token
   */
  async deactivateToken(token: string): Promise<void> {
    // Cihaz çıkışı: o token'ın TÜM satırları (hangi hesaba ait olursa olsun).
    await this.prisma.pushToken.updateMany({
      where: { token },
      data: { isActive: false },
    });

    this.logger.log(`Push token deactivated: ${token.substring(0, 30)}...`);
  }

  /**
   * Check if Expo Push is properly configured
   */
  isConfigured(): boolean {
    return this.enabled;
  }
}
