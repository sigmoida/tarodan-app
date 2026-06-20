// apps/api/src/modules/auth/google-auth.service.spec.ts
import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuthService } from './google-auth.service';

describe('GoogleAuthService', () => {
  let service: GoogleAuthService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        GoogleAuthService,
        { provide: ConfigService, useValue: { get: (k: string) => (k === 'GOOGLE_CLIENT_ID_WEB' ? 'web-client-id' : undefined) } },
      ],
    }).compile();
    service = moduleRef.get(GoogleAuthService);
  });

  const mockTicket = (payload: any) => ({ getPayload: () => payload });

  it('returns normalized payload for a valid verified token', async () => {
    (service as any).client.verifyIdToken = jest.fn().mockResolvedValue(
      mockTicket({ sub: 'g-1', email: 'a@b.com', email_verified: true, name: 'Ali', picture: 'http://x/y.png' }),
    );
    const r = await service.verifyIdToken('tok');
    expect(r).toEqual({ sub: 'g-1', email: 'a@b.com', name: 'Ali', picture: 'http://x/y.png' });
  });

  it('rejects when email_verified is false', async () => {
    (service as any).client.verifyIdToken = jest.fn().mockResolvedValue(
      mockTicket({ sub: 'g-1', email: 'a@b.com', email_verified: false }),
    );
    await expect(service.verifyIdToken('tok')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when verifyIdToken throws (invalid token)', async () => {
    (service as any).client.verifyIdToken = jest.fn().mockRejectedValue(new Error('bad token'));
    await expect(service.verifyIdToken('tok')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
