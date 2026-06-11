/**
 * AI Moderasyon Worker'ı
 * Ürün görsellerini lokal AI servisine (services/ai-moderation) gönderir:
 *  - ilgili (araç/model) + temiz + yüksek güven  -> ürünü OTO-ONAYLA (active)
 *  - NSFW şüphesi ya da düşük ilgililik           -> pending bırak (admin kuyruğu)
 * AI servisi kapalı/erişilemezse ürün bugünkü gibi `pending` kalır (graceful).
 */
import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma';
import { StorageService } from '../modules/storage/storage.service';
import { ModerationAiClient } from '../modules/moderation/moderation-ai.client';
import { QUEUE_NAMES } from './constants';

export interface ProductModerationJob {
  productId: string;
  /** Denetlenecek görsel S3 anahtarları (card varyantı yeterli). */
  cardKeys: string[];
}

@Processor(QUEUE_NAMES.MODERATION)
export class ModerationWorker {
  private readonly logger = new Logger(ModerationWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ai: ModerationAiClient,
  ) {}

  @Process('product-image')
  async handleProductImage(job: Job<ProductModerationJob>) {
    const { productId, cardKeys } = job.data;
    if (!this.ai.isEnabled) {
      return { skipped: true, reason: 'ai_disabled' };
    }
    if (!cardKeys?.length) {
      return { skipped: true, reason: 'no_images' };
    }

    let maxNsfw = 0;
    let minRelevance = 1;
    let anyFlag = false;
    let anyReview = false;
    let checked = 0;
    let topLabels: unknown = null;

    for (const key of cardKeys) {
      const url = this.storage.getPublicAssetUrl(key);
      if (!url) continue;
      const result = await this.ai.moderateImage(url);
      if (!result) continue; // servis erişilemedi -> bu görsel atlanır
      checked += 1;
      maxNsfw = Math.max(maxNsfw, result.nsfwScore);
      minRelevance = Math.min(minRelevance, result.relevanceScore);
      if (topLabels === null) topLabels = result.topLabels;
      if (result.decision === 'flag') anyFlag = true;
      else if (result.decision === 'review') anyReview = true;
    }

    if (checked === 0) {
      // Hiç görsel denetlenemedi (servis down/URL yok) -> dokunma, pending kalsın
      return { skipped: true, reason: 'none_checked' };
    }

    // Karar
    let status: 'passed' | 'flagged' | 'review';
    let reason: string;
    if (anyFlag) {
      status = 'flagged';
      reason = 'nsfw';
    } else if (anyReview) {
      status = 'review';
      reason = 'low_relevance';
    } else {
      status = 'passed';
      reason = 'relevant_clean';
    }

    // AI sonuçlarını ürüne yaz
    await this.prisma.product.update({
      where: { id: productId },
      data: {
        aiCheckStatus: status,
        aiRelevanceScore: minRelevance,
        aiNsfwScore: maxNsfw,
        aiCheckLabels: topLabels as object,
        aiCheckReason: reason,
        aiCheckedAt: new Date(),
      },
    });

    // Temiz + ilgili -> OTO-ONAY (yalnızca hâlâ pending ise; admin kararını ezme)
    if (status === 'passed') {
      const res = await this.prisma.product.updateMany({
        where: { id: productId, status: ProductStatus.pending },
        data: { status: ProductStatus.active },
      });
      if (res.count > 0) {
        this.logger.log(`Ürün ${productId} AI ile oto-onaylandı (active)`);
      }
    } else {
      this.logger.log(
        `Ürün ${productId} admin incelemesine kaldı (${status}/${reason})`,
      );
    }

    return { status, reason, maxNsfw, minRelevance, checked };
  }

  @OnQueueFailed()
  onFailed(job: Job, err: Error) {
    this.logger.error(`Moderation job ${job.id} başarısız: ${err.message}`);
  }
}
