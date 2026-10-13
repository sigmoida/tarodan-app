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
  TR_MOBILE_PHONE_PATTERN_SOURCE,
} from "../../common/helpers/contact-patterns";

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
  /** Deterministik küfür listesi eşleşti. */
  profanity: boolean;
  /** AI metin moderasyonu toksik dedi. */
  aiFlagged: boolean;
}

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

  // Türkçe küfür/argo — Detoxify (AI) tek/kısa kelimelerde tutarsız olduğu için
  // bilinen küfürleri skordan bağımsız deterministik yakalayan liste.
  // Çok karakterli kökler (suffix alabilir): orospu, amcık, siktir...
  private readonly profanityStrong =
    /(orospu|amc[ıi]k|am[ıi]na|am[ıi]n[ıi]|sikt[ıi]r|sike[yn]|siki[mş]|sikik|sikiş|sikey|yarr?a[gkğ]|kaltak|pezeven|kah[pb]e|ibne|ipne|gavat|kavat|sürtük|taşş?ak|puşt|yavşak|şerefsiz|götver|götoş|götlek|götveren|soka(y[ıi]m|r[ıi]m)|piçkuru|sülaleni|avradını|amına ?koy)/i;
  // Kısa/riskli kelimeler: yalnızca TAM kelime (Türkçe harf sınırlı) — "göt" yakalanır, "götür" yakalanmaz.
  private readonly profanityExact =
    /(?<![a-zçğıöşü0-9])(am|oç|piç|göt|sik)(?![a-zçğıöşü0-9])/i;

  private hasProfanity(content: string): boolean {
    return (
      this.profanityStrong.test(content) || this.profanityExact.test(content)
    );
  }

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
    const profanity = this.hasProfanity(content);

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
      ...(aiFlagged ? [`ai:${ai?.reason ?? "toxic"}`] : []),
    ];
    const reasons = [
      regexResult.flaggedReason,
      profanity ? "Uygunsuz dil (küfür)" : null,
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
      requiresApproval: regexResult.requiresApproval || profanity || aiFlagged,
      flaggedReason: reasons.length > 0 ? reasons.join("; ") : null,
      matches: regexResult.matches,
      profanity,
      aiFlagged,
    };
  }

  /**
   * Onay kuyruğu OLMAYAN kullanıcılar arası serbest metin (teklif notu, takas
   * mesajı, takas red/iptal gerekçesi) için mesajlaşmayla AYNI filtre — TEK
   * kaynak (S9a, Apple 1.2). Mesajlaşmadaki üç sonucun kuyruksuz karşılığı:
   *
   * - temiz → metin aynen kaydedilir;
   * - yalnız maskelenen kural (ör. iletişim bilgisi, onay istemeyen) →
   *   maskelenmiş metin kaydedilir (DM'de alıcının gördüğü `filteredContent`);
   * - onay gerektiren sonuç (küfür, AI toksik, onay isteyen kural) → DM'de
   *   yönetici onayına düşerdi; burada kuyruk olmadığı için istek 400 ile
   *   reddedilir, kullanıcı metni düzeltip yeniden gönderir.
   *
   * Yavaş olabilir (AI çağrısı): transaction AÇILMADAN çağrılmalıdır.
   */
  async screenUnqueuedText<T extends string | null | undefined>(
    content: T,
  ): Promise<T | string> {
    if (!content || !content.trim()) return content;
    const result = await this.moderateWithAI(content);
    if (result.isClean) return content;
    if (result.requiresApproval) {
      throw new BadRequestException(
        i18nMessage("server.messaging.contentRejected"),
      );
    }
    return result.filteredContent;
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
        pattern: "(whatsapp|wp|wa|w\\s*a)[\\s:]*[\\d+()-]+",
        name: "WhatsApp",
      },
      // Instagram
      {
        type: "social_media",
        pattern: "(instagram|ig|insta)[:\\s@]+[a-zA-Z0-9_.]+",
        name: "Instagram",
      },
      // Telegram
      {
        type: "social_media",
        pattern: "(telegram|tg)[:\\s@]+[a-zA-Z0-9_.]+",
        name: "Telegram",
      },
      // Discord
      {
        type: "social_media",
        pattern: "(discord)[:\\s#]+[a-zA-Z0-9_.#]+",
        name: "Discord",
      },
      // Facebook
      {
        type: "social_media",
        pattern: "(facebook|fb)[:\\s/]+[a-zA-Z0-9_.]+",
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
