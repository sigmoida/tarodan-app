import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';

export interface FilterResult {
  isClean: boolean;
  filteredContent: string;
  flaggedPatterns: string[];
  requiresApproval: boolean;
  flaggedReason: string | null;
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

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.loadFilters();
  }

  /**
   * Load content filters from database
   */
  async loadFilters(): Promise<void> {
    const dbFilters = await this.prisma.contentFilter.findMany({
      where: { isActive: true },
      orderBy: { priority: 'desc' },
    });

    this.filters = dbFilters.map((f) => ({
      id: f.id,
      filterType: f.filterType,
      name: f.name,
      pattern: f.pattern,
      replacement: f.replacement,
      requiresApproval: f.requiresApproval,
      priority: f.priority,
      regex: new RegExp(f.pattern, 'gi'),
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
    let requiresApproval = false;

    // Apply each filter in priority order
    for (const filter of this.filters) {
      const matches = content.match(filter.regex);
      
      if (matches && matches.length > 0) {
        // Replace matches with filter replacement
        filteredContent = filteredContent.replace(filter.regex, filter.replacement);
        
        // Track which patterns were flagged
        flaggedPatterns.push(filter.name);
        
        // Check if any filter requires admin approval
        if (filter.requiresApproval) {
          requiresApproval = true;
        }
      }
    }

    const isClean = flaggedPatterns.length === 0;
    const flaggedReason = flaggedPatterns.length > 0
      ? `Tespit edilen içerik: ${flaggedPatterns.join(', ')}`
      : null;

    return {
      isClean,
      filteredContent,
      flaggedPatterns,
      requiresApproval,
      flaggedReason,
    };
  }

  /**
   * AI-based moderation (STEP 2 - Future implementation)
   * Currently returns the regex filter result
   * Can be extended to call external AI moderation APIs
   */
  async moderateWithAI(content: string): Promise<FilterResult> {
    // Step 1: Apply regex filters first
    const regexResult = this.filterContent(content);

    // If regex already flagged it, no need for AI
    if (!regexResult.isClean) {
      return regexResult;
    }

    // Step 2: AI moderation (placeholder for future implementation)
    // This can be extended to use:
    // - OpenAI Moderation API
    // - Perspective API
    // - Custom ML model
    // - AWS Comprehend
    // - Azure Content Moderator

    /*
    // Example AI moderation implementation:
    try {
      const aiResult = await this.callAIModerationAPI(content);
      
      if (aiResult.flagged) {
        return {
          isClean: false,
          filteredContent: content,
          flaggedPatterns: aiResult.categories,
          requiresApproval: true,
          flaggedReason: `AI Moderation: ${aiResult.categories.join(', ')}`,
        };
      }
    } catch (error) {
      this.logger.warn('AI moderation failed');
    }
    */

    return regexResult;
  }

  /**
   * Builtin patterns for common cases (backup if DB is empty)
   */
  getBuiltinPatterns(): Array<{type: string; pattern: string; name: string}> {
    return [
      // Turkish phone numbers
      {
        type: 'phone',
        pattern: '(\\+90|0)?\\s*5\\d{2}\\s*\\d{3}\\s*\\d{2}\\s*\\d{2}',
        name: 'Türk Telefon Numarası',
      },
      // International phone
      {
        type: 'phone',
        pattern: '\\+?\\d{1,3}[-.\\s]?\\(?\\d{1,4}\\)?[-.\\s]?\\d{1,4}[-.\\s]?\\d{1,9}',
        name: 'Uluslararası Telefon',
      },
      // Email
      {
        type: 'email',
        pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
        name: 'E-posta Adresi',
      },
      // WhatsApp
      {
        type: 'social_media',
        pattern: '(whatsapp|wp|wa|w\\s*a)[\\s:]*[\\d+()-]+',
        name: 'WhatsApp',
      },
      // Instagram
      {
        type: 'social_media',
        pattern: '(instagram|ig|insta)[:\\s@]+[a-zA-Z0-9_.]+',
        name: 'Instagram',
      },
      // Telegram
      {
        type: 'social_media',
        pattern: '(telegram|tg)[:\\s@]+[a-zA-Z0-9_.]+',
        name: 'Telegram',
      },
      // Discord
      {
        type: 'social_media',
        pattern: '(discord)[:\\s#]+[a-zA-Z0-9_.#]+',
        name: 'Discord',
      },
      // Facebook
      {
        type: 'social_media',
        pattern: '(facebook|fb)[:\\s/]+[a-zA-Z0-9_.]+',
        name: 'Facebook',
      },
      // URLs
      {
        type: 'url',
        pattern: 'https?:\\/\\/[^\\s]+',
        name: 'URL Link',
      },
      // Spelled out numbers (Turkish)
      {
        type: 'phone',
        pattern: '(beş|dört|üç|iki|bir|sıfır|altı|yedi|sekiz|dokuz)\\s*(beş|dört|üç|iki|bir|sıfır|altı|yedi|sekiz|dokuz)\\s*(beş|dört|üç|iki|bir|sıfır|altı|yedi|sekiz|dokuz)',
        name: 'Yazıyla Numara',
      },
      // Hidden numbers with spaces
      {
        type: 'phone',
        pattern: '\\d\\s+\\d\\s+\\d\\s+\\d\\s+\\d\\s+\\d\\s+\\d',
        name: 'Gizli Numara',
      },
      // Number with dashes/dots as separators
      {
        type: 'phone',
        pattern: '\\d{2,3}[-.\\s]\\d{2,3}[-.\\s]\\d{2,4}',
        name: 'Formatlanmış Numara',
      },
    ];
  }

  /**
   * Test a pattern against sample content
   */
  testPattern(pattern: string, content: string): boolean {
    try {
      const regex = new RegExp(pattern, 'gi');
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
