import { Module } from '@nestjs/common';
import { ModerationAiClient } from './moderation-ai.client';

/**
 * Lokal AI moderasyon servisine (görsel + metin) erişim sağlayan istemciyi
 * paylaşır. ConfigModule global olduğu için ayrıca import edilmez.
 */
@Module({
  providers: [ModerationAiClient],
  exports: [ModerationAiClient],
})
export class ModerationModule {}
