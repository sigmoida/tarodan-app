import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { EventService } from './event.service';
import { QUEUE_NAMES } from '../../workers/constants';
import { PrismaModule } from '../../prisma';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue(
      { name: QUEUE_NAMES.EMAIL },
      { name: QUEUE_NAMES.PUSH },
      { name: QUEUE_NAMES.SHIPPING },
      { name: QUEUE_NAMES.ANALYTICS },
    ),
  ],
  providers: [EventService],
  exports: [EventService],
})
export class EventModule { }
