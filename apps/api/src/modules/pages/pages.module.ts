import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma';
import { PagesService } from './pages.service';
import { PagesController } from './pages.controller';

@Module({
  imports: [PrismaModule],
  controllers: [PagesController],
  providers: [PagesService],
  exports: [PagesService],
})
export class PagesModule {}
