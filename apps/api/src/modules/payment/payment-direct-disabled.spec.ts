import { Test, TestingModule } from '@nestjs/testing';
import { GoneException } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

describe('PaymentController process-direct disabled (Faz 1)', () => {
  let controller: PaymentController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentController],
      providers: [
        { provide: PaymentService, useValue: {} },
        { provide: JwtService, useValue: {} },
        { provide: ConfigService, useValue: {} },
      ],
    }).compile();
    controller = module.get(PaymentController);
  });

  it('process-direct artık desteklenmiyor → GoneException', () => {
    expect(() => (controller as any).processDirect({}, {})).toThrow(GoneException);
  });
});
