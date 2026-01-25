import { Module } from '@nestjs/common';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { MembershipModule } from '../membership/membership.module';

@Module({
  imports: [PrismaModule, MembershipModule],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
