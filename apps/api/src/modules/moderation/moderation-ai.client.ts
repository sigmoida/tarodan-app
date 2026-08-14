import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma";
import { i18nMessage } from "../i18n";

/**
 * Bir AI denetiminin hangi varlığa ait olduğunu tarif eden bağlam.
 * `assertImageClean`/`assertTextClean` çağrılırken verilirse, engellenen
 * içerik birleşik `moderation_events` günlüğüne yazılır (admin "AI Denetim").
 */
export interface ModerationContext {
  /** Hedef varlık türü: product | user | collection | upload | message */
  entityType: string;
  entityId?: string | null;
  /** İçeriği üreten/yükleyen kullanıcı id'si */
  userId?: string | null;
  /** Alan anahtarı: avatar | bio | display_name | cover | item | upload ... */
  field?: string;
}

export interface ImageModerationResult {
  relevanceScore: number;
  nsfwScore: number;
  topLabels: Array<{ label: string; score: number; vehicle: boolean }>;
  decision: "pass" | "review" | "flag";
  reason: string;
}

export interface TextModerationResult {
  scores: Record<string, number>;
  maxScore: number;
  toxic: boolean;
  decision: "pass" | "flag";
  reason: string | null;
}

/**
 * Lokal AI moderasyon servisine (services/ai-moderation, FastAPI) HTTP istemcisi.
 * Servis kapalı/erişilemezse `null` döner -> çağıran taraf mevcut davranışa düşer
 * (ürün `pending` kalır, mesaj regex sonucuna göre işlenir). Sistem ASLA bu yüzden
 * bozulmaz / istek bloklanmaz.
 */
@Injectable()
export class ModerationAiClient {
  private readonly logger = new Logger(ModerationAiClient.name);
  private readonly baseUrl: string;
  private readonly enabled: boolean;
  private readonly timeoutMs: number;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.baseUrl = this.config
      .get<string>("AI_MODERATION_URL", "http://localhost:8000")
      .replace(/\/$/, "");
    this.enabled =
      this.config.get<string>("AI_MODERATION_ENABLED", "false") === "true";
    this.timeoutMs = Number(
      this.config.get<string>("AI_MODERATION_TIMEOUT_MS", "20000"),
    );
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  // Türkçe küfür/argo — deterministik (AI tek kelimelerde tutarsız).
  private readonly profanityStrong =
    /(orospu|amc[ıi]k|am[ıi]na|am[ıi]n[ıi]|sikt[ıi]r|sike[yn]|siki[mş]|sikik|sikiş|sikey|yarr?a[gkğ]|kaltak|pezeven|kah[pb]e|ibne|ipne|gavat|kavat|sürtük|taşş?ak|puşt|yavşak|şerefsiz|götver|götoş|götlek|götveren|soka(y[ıi]m|r[ıi]m)|piçkuru|sülaleni|avradını|amına ?koy)/i;
  private readonly profanityExact =
    /(?<![a-zçğıöşü0-9])(am|oç|piç|göt|sik)(?![a-zçğıöşü0-9])/i;

  hasProfanity(text: string): boolean {
    return (
      this.profanityStrong.test(text || "") ||
      this.profanityExact.test(text || "")
    );
  }

  /** Metin (ürün başlığı/açıklaması vb.) küfür/toksik mi? */
  async checkText(
    text: string,
  ): Promise<{ clean: boolean; reason: string | null }> {
    if (!text) return { clean: true, reason: null };
    if (this.hasProfanity(text)) {
      return { clean: false, reason: "küfür/uygunsuz dil" };
    }
    const ai = await this.moderateText(text);
    if (ai?.toxic) return { clean: false, reason: "uygunsuz içerik" };
    return { clean: true, reason: null };
  }

  /**
   * Yüklenen görsel dosyasını NSFW için denetle; uygunsuzsa isteği engelle.
   * Servis kapalıysa veya dosya görsel değilse no-op (fail-open) — sistem
   * bu yüzden asla bloklanmaz. Tüm görsel yükleme uçları bu tek noktayı çağırır.
   */
  async assertImageClean(
    file?: {
      buffer?: Buffer;
      mimetype?: string;
    },
    ctx?: ModerationContext,
  ): Promise<void> {
    if (
      !this.enabled ||
      !file?.buffer ||
      !file.mimetype?.startsWith("image/")
    ) {
      return;
    }
    const dataUri = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
    const verdict = await this.moderateImage(dataUri);
    if (verdict?.decision === "flag") {
      if (ctx) {
        await this.recordEvent({
          ...ctx,
          kind: "image",
          decision: "blocked",
          relevanceScore: verdict.relevanceScore,
          nsfwScore: verdict.nsfwScore,
          labels: verdict.topLabels,
          reason: verdict.reason || "nsfw",
        });
      }
      throw new BadRequestException(
        "Yüklediğiniz resim uygun değildir. Lütfen uygun bir görsel seçin.",
      );
    }
    // Temiz/inceleme sonuçlarını da kaydet (admin "AI Denetim" > "Temiz" filtresi için)
    if (verdict && ctx) {
      await this.recordEvent({
        ...ctx,
        kind: "image",
        decision: verdict.decision, // 'pass' | 'review'
        relevanceScore: verdict.relevanceScore,
        nsfwScore: verdict.nsfwScore,
        labels: verdict.topLabels,
        reason: verdict.reason || null,
      });
    }
  }

  /**
   * Serbest metni (profil adı, biyografi, yorum vb.) küfür/toksisite için
   * denetle; uygunsuzsa isteği engelle. Boş metin veya servis kapalıysa no-op.
   */
  async assertTextClean(
    text: string | null | undefined,
    ctx?: ModerationContext & { label?: string },
  ): Promise<void> {
    if (!text?.trim() || !this.enabled) return;
    const check = await this.checkText(text);
    if (!check.clean) {
      if (ctx) {
        await this.recordEvent({
          entityType: ctx.entityType,
          entityId: ctx.entityId,
          userId: ctx.userId,
          field: ctx.field,
          kind: "text",
          decision: "blocked",
          reason: check.reason,
        });
      }
      throw new BadRequestException(
        i18nMessage("server.moderation.contentRejected", {
          field: ctx?.label ?? "içerik",
          reason: check.reason,
        }),
      );
    }
  }

  /**
   * Birleşik AI moderasyon günlüğüne bir olay yaz (admin "AI Denetim").
   * Asla isteği bozmaz: yazma hatası yutulur ve sadece loglanır.
   */
  async recordEvent(input: {
    entityType: string;
    entityId?: string | null;
    userId?: string | null;
    kind: "image" | "text";
    field?: string | null;
    decision: "pass" | "review" | "flag" | "blocked";
    relevanceScore?: number | null;
    nsfwScore?: number | null;
    labels?: unknown;
    reason?: string | null;
  }): Promise<void> {
    try {
      await this.prisma.moderationEvent.create({
        data: {
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          userId: input.userId ?? null,
          kind: input.kind,
          field: input.field ?? null,
          decision: input.decision,
          relevanceScore: input.relevanceScore ?? null,
          nsfwScore: input.nsfwScore ?? null,
          labels: (input.labels ?? undefined) as object | undefined,
          reason: input.reason ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `ModerationEvent kaydedilemedi: ${(err as Error).message}`,
      );
    }
  }

  private async post<T>(path: string, body: unknown): Promise<T | null> {
    if (!this.enabled) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.warn(`AI moderation ${path} -> HTTP ${res.status}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (err) {
      this.logger.warn(
        `AI moderation ${path} erişilemedi: ${(err as Error).message}`,
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Görseli denetle (http(s) URL veya data:base64). Erişilemezse null. */
  async moderateImage(
    imageUrlOrBase64: string,
  ): Promise<ImageModerationResult | null> {
    const body = /^data:/i.test(imageUrlOrBase64)
      ? { imageBase64: imageUrlOrBase64 }
      : { imageUrl: imageUrlOrBase64 };
    return this.post<ImageModerationResult>("/moderate/image", body);
  }

  /** Metni denetle. Erişilemezse null. */
  async moderateText(text: string): Promise<TextModerationResult | null> {
    return this.post<TextModerationResult>("/moderate/text", { text });
  }

  /** Aktif eşikleri oku (admin paneli için). */
  async getConfig(): Promise<{
    relevanceThreshold: number;
    nsfwThreshold: number;
  } | null> {
    if (!this.enabled) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/config`, {
        signal: controller.signal,
      });
      if (!res.ok) return null;
      return (await res.json()) as {
        relevanceThreshold: number;
        nsfwThreshold: number;
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Eşikleri güncelle (admin paneli) — canlı + kalıcı (config.json). */
  async setConfig(cfg: {
    relevanceThreshold?: number;
    nsfwThreshold?: number;
  }): Promise<{ relevanceThreshold: number; nsfwThreshold: number } | null> {
    return this.post("/config", cfg);
  }
}
