import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ImageModerationResult {
  relevanceScore: number;
  nsfwScore: number;
  topLabels: Array<{ label: string; score: number; vehicle: boolean }>;
  decision: 'pass' | 'review' | 'flag';
  reason: string;
}

export interface TextModerationResult {
  scores: Record<string, number>;
  maxScore: number;
  toxic: boolean;
  decision: 'pass' | 'flag';
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

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config
      .get<string>('AI_MODERATION_URL', 'http://localhost:8000')
      .replace(/\/$/, '');
    this.enabled =
      this.config.get<string>('AI_MODERATION_ENABLED', 'false') === 'true';
    this.timeoutMs = Number(
      this.config.get<string>('AI_MODERATION_TIMEOUT_MS', '20000'),
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
      this.profanityStrong.test(text || '') ||
      this.profanityExact.test(text || '')
    );
  }

  /** Metin (ürün başlığı/açıklaması vb.) küfür/toksik mi? */
  async checkText(
    text: string,
  ): Promise<{ clean: boolean; reason: string | null }> {
    if (!text) return { clean: true, reason: null };
    if (this.hasProfanity(text)) {
      return { clean: false, reason: 'küfür/uygunsuz dil' };
    }
    const ai = await this.moderateText(text);
    if (ai?.toxic) return { clean: false, reason: 'uygunsuz içerik' };
    return { clean: true, reason: null };
  }

  private async post<T>(path: string, body: unknown): Promise<T | null> {
    if (!this.enabled) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    return this.post<ImageModerationResult>('/moderate/image', body);
  }

  /** Metni denetle. Erişilemezse null. */
  async moderateText(text: string): Promise<TextModerationResult | null> {
    return this.post<TextModerationResult>('/moderate/text', { text });
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
    return this.post('/config', cfg);
  }
}
