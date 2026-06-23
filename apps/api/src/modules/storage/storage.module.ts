import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { StorageService } from './storage.service';
import { MediaAccessService } from './media-access.service';
import { PrismaModule } from '../../prisma';
import { ModerationModule } from '../moderation/moderation.module';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    ModerationModule,
    MulterModule.register({
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    }),
  ],
  providers: [StorageService, MediaAccessService],
  exports: [StorageService, MediaAccessService],
})
export class StorageModule {}
