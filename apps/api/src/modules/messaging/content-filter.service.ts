import {
  BadRequestException,
  Injectable,
  OnModuleInit,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { ModerationAiClient } from "../moderation/moderation-ai.client";
import { i18nMessage } from "../i18n";
import {
  EMAIL_PATTERN_SOURCE,
  INSTAGRAM_HANDLE_PATTERN_SOURCE,
  TR_MOBILE_PHONE_PATTERN_SOURCE,
  WHATSAPP_PATTERN_SOURCE,
  wordLedSource,
} from "../../common/helpers/contact-patterns";
import {
  maskAmbiguousProfanity,
  scanProfanity,
} from "../../common/helpers/profanity";

export interface FilterMatch {
  name: string;
  filterType: string;
  requiresApproval: boolean;
}

export interface FilterResult {
  isClean: boolean;
  filteredContent: string;
  flaggedPatterns: string[];
  requiresApproval: boolean;
  flaggedReason: string | null;
  /** Eşleşen DB kuralları (maske + onay kararı için ayrıntı). */
  matches: FilterMatch[];
  /** Belirsiz olmayan küfür (deterministik liste) eşleşti. */
  profanity: boolean;
  /**
   * Türkçede meşru kelimelerle çakışan kısa kök ("am", "sik") eşleşti: sert
   * reddedilmez, kuyruksuz metinde maskelenip incelemeye işaretlenir.
   */
  ambiguousProfanity: boolean;
  /** AI metin moderasyonu toksik dedi. */
  aiFlagged: boolean;
}

/**
 * İletişim bilgisi kuralları: kuyruğu olmayan metinde (teklif notu, takas
 * mesajı) yalnız MASKELENİR — paylaşım engellenir, metin gider.
 */
const CONTACT_FILTER_TYPES = new Set(["phone", "email", "social_media", "url"]);

/** Kuyruksuz metnin kaynağı — inceleme kaydı (ModerationEvent) için. */
export interface UnqueuedTextContext {
  /** offer | trade */
  entityType: string;
  /** Metni yazan kullanıcı. */
  userId: string;
  /** offer_message | trade_message | trade_reject_reason | trade_cancel_reason */
  field: string;
  entityId?: string | null;
}

/**
 * Taranmış kuyruksuz metin. Sonucu metne bağlı varlık (teklif, takas) henüz
 * YOKKEN taranan akışlar (oluşturma) için inceleme kaydı varlık yazıldıktan
 * SONRA `recordFlag(entityId)` ile atılır; işaret yoksa çağrı no-op'tur.
 */
export interface ScreenedText<T> {
  text: T | string;
  recordFlag(entityId: string | null): Promise<void>;
}

/** Filtresiz kurulum (dar test kurulumu) için: metin aynen, işaret yok. */
export function unscreenedText<T>(text: T): ScreenedText<T> {
  return { text, recordFlag: async () => undefined };
}

/** İnceleme gerekçesine eklenen işaretlenen metnin üst sınırı (karakter). */
const FLAGGED_TEXT_EXCERPT_LENGTH = 500;

export interface ContentFilterRule {
  id: string;
  filterType: string;
  name: string;
  pattern: string;
  replacement: string;
  requiresApproval: boolean;
  priority: number;
  regex: RegExp;
}

@Injectable()
export class ContentFilterService implements OnModuleInit {
  private readonly logger = new Logger(ContentFilterService.name);
  private filters: ContentFilterRule[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiClient: ModerationAiClient,
  ) {}

  async onModuleInit() {
    await this.loadFilters();
  }

  /**
   * Load content filters from database
   */
  async loadFilters(): Promise<void> {
    const dbFilters = await this.prisma.contentFilter.findMany({
      where: { isActive: true },
      orderBy: { priority: "desc" },
    });

    this.filters = dbFilters.map((f) => ({
      id: f.id,
      filterType: f.filterType,
      name: f.name,
      pattern: f.pattern,
      replacement: f.replacement,
      requiresApproval: f.requiresApproval,
      priority: f.priority,
      regex: new RegExp(f.pattern, "gi"),
    }));

    this.logger.log(`Loaded ${this.filters.length} content filters`);
  }

  /**
   * Filter content using regex patterns
   * This is STEP 1 of the moderation pipeline
   */
  filterContent(content: string): FilterResult {
    let filteredContent = content;
    const flaggedPatterns: string[] = [];
    const matched: FilterMatch[] = [];
    let requiresApproval = false;

    // Apply each filter in priority order
    for (const filter of this.filters) {
      const matches = content.match(filter.regex);

      if (matches && matches.length > 0) {
        // Replace matches with filter replacement
        filteredContent = filteredContent.replace(
          filter.regex,
          filter.replacement,
        );

        // Track which patterns were flagged
        flaggedPatterns.push(filter.name);
        matched.push({
          name: filter.name,
          filterType: filter.filterType,
          requiresApproval: filter.requiresApproval,
        });

        // Check if any filter requires admin approval
        if (filter.requiresApproval) {
          requiresApproval = true;
        }
      }
    }

    const isClean = flaggedPatterns.length === 0;
    const flaggedReason =
      flaggedPatterns.length > 0
        ? `Tespit edilen içerik: ${flaggedPatterns.join(", ")}`
        : null;

    return {
      isClean,
      filteredContent,
      flaggedPatterns,
      requiresApproval,
      flaggedReason,
      matches: matched,
      profanity: false,
      ambiguousProfanity: false,
      aiFlagged: false,
    };
  }

  /**
   * AI-based moderation (STEP 2 - Future implementation)
   * Currently returns the regex filter result
   * Can be extended to call external AI moderation APIs
   */
  async moderateWithAI(content: string): Promise<FilterResult> {
    // ÜÇ katman da HER ZAMAN değerlendirilir ve en ağır sonuç uygulanır.
    // Eskiden herhangi bir regex eşleşmesi erken dönüyordu: yalnız maskelenen
    // bir kural (ör. telefon) eşleşince küfür ve AI hiç bakılmıyor, küfürlü
    // mesaj maskelenip onaysız gidiyordu.
    const regexResult = this.filterContent(content);

    // Deterministik Türkçe küfür listesi — AI'dan bağımsız, her zaman çalışır
    // (Detoxify tek/kısa kelimelerde tutarsız: "am"/"orospu" eşik altı kalabiliyor).
    const scan = scanProfanity(content);
    const profanity = scan.strong;
    const ambiguousProfanity = scan.ambiguous.length > 0;

    // Lokal AI metin moderasyonu (Detoxify multilingual — Türkçe dahil).
    // services/ai-moderation kapalı/erişilemezse null döner → diğer katmanlar
    // geçerlidir (istek bloklanmaz, sistem bozulmaz).
    let ai: { toxic?: boolean; reason?: string | null } | null = null;
    try {
      ai = await this.aiClient.moderateText(content);
    } catch (error) {
      this.logger.warn(
        "AI metin moderasyonu başarısız, regex/küfür sonucu kullanılıyor",
      );
    }
    const aiFlagged = Boolean(ai?.toxic);

    const flaggedPatterns = [
      ...regexResult.flaggedPatterns,
      ...(profanity ? ["profanity"] : []),
      ...(ambiguousProfanity ? ["profanity_ambiguous"] : []),
      ...(aiFlagged ? [`ai:${ai?.reason ?? "toxic"}`] : []),
    ];
    const reasons = [
      regexResult.flaggedReason,
      profanity ? "Uygunsuz dil (küfür)" : null,
      ambiguousProfanity ? "Olası uygunsuz dil (belirsiz kısa kök)" : null,
      aiFlagged
        ? `AI moderasyon: uygunsuz içerik${ai?.reason ? ` (${ai.reason})` : ""}`
        : null,
    ].filter((reason): reason is string => Boolean(reason));

    // Not: Mesaj görseli artık YÜKLEME anında (dosyanın kendisi, base64) denetlenir
    // -> media.controller.uploadFile (folder=messages). Burada URL denetimi yok.
    return {
      isClean: flaggedPatterns.length === 0,
      filteredContent: regexResult.filteredContent,
      flaggedPatterns,
      // En ağır sonuç: herhangi bir katman onay istiyorsa onay.
      requiresApproval:
        regexResult.requiresApproval ||
        profanity ||
        ambiguousProfanity ||
        aiFlagged,
      flaggedReason: reasons.length > 0 ? reasons.join("; ") : null,
      matches: regexResult.matches,
      profanity,
      ambiguousProfanity,
      aiFlagged,
    };
  }

  /**
   * Onay kuyruğu OLMAYAN kullanıcılar arası serbest metin (teklif notu, takas
   * mesajı, takas red/iptal gerekçesi) için mesajlaşmayla AYNI filtre — TEK
   * kaynak (S9a, Apple 1.2). DM'de onaya düşecek her şeyi burada reddetmek
   * meşru notları da kesiyordu (yanlış pozitif kural → sert 400), bu yüzden
   * kuyruksuz karşılık katmana göre ayrılır:
   *
   * - temiz → metin aynen kaydedilir;
   * - deterministik küfür listesi (belirsiz olmayan) → 400
   *   `server.messaging.contentRejected`;
   * - belirsiz kısa kök ("am", "sik": "8 am", "sık sık") → REDDEDİLMEZ,
   *   maskelenir ve incelemeye işaretlenir;
   * - iletişim bilgisi kuralları → maskelenmiş metin kaydedilir;
   * - diğer onay isteyen kurallar ve AI toksik → REDDEDİLMEZ: maskeli metin
   *   kaydedilir ve admin incelemesi için işaretlenir (ModerationEvent
   *   `decision: "flag"` → admin "AI Denetim" ve kullanıcının etkinlik sekmesi).
   *
   * Yavaş olabilir (AI çağrısı): transaction AÇILMADAN çağrılmalıdır.
   */
  async screenUnqueuedText<T extends string | null | undefined>(
    content: T,
    ctx?: UnqueuedTextContext,
  ): Promise<T | string> {
    const screened = await this.screenUnqueuedTextDeferred(content, ctx);
    await screened.recordFlag(ctx?.entityId ?? null);
    return screened.text;
  }

  /**
   * `screenUnqueuedText` ile AYNI tarama; inceleme kaydı hemen değil, çağıranın
   * `recordFlag(entityId)` çağrısıyla yazılır. Metne bağlı varlığın kimliği
   * tarama anında yoksa (yeni teklif / yeni takas) kayıt varlık oluşunca atılır;
   * böylece "AI Denetim" kaydı ilgili teklife/takasa bağlanır.
   */
  async screenUnqueuedTextDeferred<T extends string | null | undefined>(
    content: T,
    ctx?: UnqueuedTextContext,
  ): Promise<ScreenedText<T>> {
    if (!content || !content.trim()) return unscreenedText(content);
    const result = await this.moderateWithAI(content);
    if (result.isClean) return unscreenedText(content);
    if (result.profanity) {
      throw new BadRequestException(
        i18nMessage("server.messaging.contentRejected"),
      );
    }
    const reviewRules = result.matches.filter(
      (match) =>
        match.requiresApproval && !CONTACT_FILTER_TYPES.has(match.filterType),
    );
    const needsReview =
      result.aiFlagged || result.ambiguousProfanity || reviewRules.length > 0;
    return {
      text: maskAmbiguousProfanity(result.filteredContent),
      recordFlag: async (entityId) => {
        if (!needsReview) return;
        await this.flagForReview(
          result,
          content,
          ctx && { ...ctx, entityId: entityId ?? ctx.entityId ?? null },
        );
      },
    };
  }

  /**
   * Kuyruksuz metni admin incelemesine işaretle; asla fırlatmaz. Gerekçeye
   * işaretlenen ORİJİNAL metin (kısaltılmış) eklenir: kayıt maskeli metni
   * değil, yöneticinin görmesi gereken gerçek içeriği gösterir.
   */
  private async flagForReview(
    result: FilterResult,
    original: string,
    ctx?: UnqueuedTextContext,
  ): Promise<void> {
    this.logger.warn(
      `Unqueued text flagged for review (entity=${ctx?.entityType ?? "unknown"}, field=${ctx?.field ?? "unknown"}, user=${ctx?.userId ?? "unknown"}): ${result.flaggedReason ?? ""}`,
    );
    if (!ctx?.entityType) return;
    const excerpt =
      original.length > FLAGGED_TEXT_EXCERPT_LENGTH
        ? `${original.slice(0, FLAGGED_TEXT_EXCERPT_LENGTH)}…`
        : original;
    await this.aiClient.recordEvent({
      entityType: ctx.entityType,
      entityId: ctx.entityId ?? null,
      userId: ctx.userId,
      kind: "text",
      field: ctx.field,
      decision: "flag",
      reason: `${result.flaggedReason ?? ""} | ${excerpt}`.trim(),
    });
  }

  /**
   * Builtin patterns for common cases (backup if DB is empty)
   */
  getBuiltinPatterns(): Array<{ type: string; pattern: string; name: string }> {
    return [
      // Turkish phone numbers — shared with UAT masking (common/helpers/contact-patterns)
      {
        type: "phone",
        pattern: TR_MOBILE_PHONE_PATTERN_SOURCE,
        name: "Türk Telefon Numarası",
      },
      // International phone
      {
        type: "phone",
        pattern:
          "\\+?\\d{1,3}[-.\\s]?\\(?\\d{1,4}\\)?[-.\\s]?\\d{1,4}[-.\\s]?\\d{1,9}",
        name: "Uluslararası Telefon",
      },
      // Email
      {
        type: "email",
        pattern: EMAIL_PATTERN_SOURCE,
        name: "E-posta Adresi",
      },
      // WhatsApp
      {
        type: "social_media",
        pattern: WHATSAPP_PATTERN_SOURCE,
        name: "WhatsApp",
      },
      // Instagram
      {
        type: "social_media",
        pattern: INSTAGRAM_HANDLE_PATTERN_SOURCE,
        name: "Instagram",
      },
      // Telegram
      {
        type: "social_media",
        pattern: `${wordLedSource(["telegram", "tg"])}[:\\s@]+[a-zA-Z0-9_.]+`,
        name: "Telegram",
      },
      // Discord
      {
        type: "social_media",
        pattern: `${wordLedSource(["discord"])}[:\\s#]+[a-zA-Z0-9_.#]+`,
        name: "Discord",
      },
      // Facebook
      {
        type: "social_media",
        pattern: `${wordLedSource(["facebook", "fb"])}[:\\s/]+[a-zA-Z0-9_.]+`,
        name: "Facebook",
      },
      // URLs
      {
        type: "url",
        pattern: "https?:\\/\\/[^\\s]+",
        name: "URL Link",
      },
      // Spelled out numbers (Turkish)
      {
        type: "phone",
        pattern:
          "(beş|dört|üç|iki|bir|sıfır|altı|yedi|sekiz|dokuz)\\s*(beş|dört|üç|iki|bir|sıfır|altı|yedi|sekiz|dokuz)\\s*(beş|dört|üç|iki|bir|sıfır|altı|yedi|sekiz|dokuz)",
        name: "Yazıyla Numara",
      },
      // Hidden numbers with spaces
      {
        type: "phone",
        pattern: "\\d\\s+\\d\\s+\\d\\s+\\d\\s+\\d\\s+\\d\\s+\\d",
        name: "Gizli Numara",
      },
      // Number with dashes/dots as separators
      {
        type: "phone",
        pattern: "\\d{2,3}[-.\\s]\\d{2,3}[-.\\s]\\d{2,4}",
        name: "Formatlanmış Numara",
      },
    ];
  }

  /**
   * Test a pattern against sample content
   */
  testPattern(pattern: string, content: string): boolean {
    try {
      const regex = new RegExp(pattern, "gi");
      return regex.test(content);
    } catch {
      return false;
    }
  }

  /**
   * Add a new filter pattern
   */
  async addFilter(
    filterType: string,
    name: string,
    pattern: string,
    replacement: string,
    requiresApproval: boolean,
    priority: number,
  ): Promise<void> {
    await this.prisma.contentFilter.create({
      data: {
        filterType,
        name,
        pattern,
        replacement,
        requiresApproval,
        priority,
        isActive: true,
      },
    });

    // Reload filters
    await this.loadFilters();
  }

  /**
   * Update a filter pattern
   */
  async updateFilter(
    id: string,
    data: {
      pattern?: string;
      replacement?: string;
      requiresApproval?: boolean;
      priority?: number;
      isActive?: boolean;
    },
  ): Promise<void> {
    await this.prisma.contentFilter.update({
      where: { id },
      data,
    });

    // Reload filters
    await this.loadFilters();
  }

  /**
   * Get all filters
   */
  async getAllFilters(): Promise<ContentFilterRule[]> {
    await this.loadFilters();
    return this.filters;
  }
}
