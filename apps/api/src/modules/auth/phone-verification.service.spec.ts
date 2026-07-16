import { BadRequestException, ConflictException } from '@nestjs/common';
import { PhoneVerificationService } from './phone-verification.service';

function makeDeps() {
  const tokenStore: any[] = [];
  const users: Record<string, any> = { u1: { id: 'u1', phone: null, isPhoneVerified: false } };
  const prisma: any = {
    user: {
      findFirst: jest.fn(async ({ where }: any) => {
        // Match: phone === where.phone AND isPhoneVerified === true AND id !== where.id.not
        return (
          Object.values(users).find(
            (u: any) =>
              u.phone === where.phone &&
              u.isPhoneVerified === true &&
              u.id !== where.id?.not,
          ) || null
        );
      }),
      update: jest.fn(async ({ where, data }: any) => {
        Object.assign(users[where.id], data);
        return users[where.id];
      }),
    },
    phoneVerificationToken: {
      findFirst: jest.fn(async ({ where }: any) => {
        let filtered = tokenStore;
        if (where?.userId) filtered = filtered.filter((t) => t.userId === where.userId);
        if (where?.usedAt === null) filtered = filtered.filter((t) => !t.usedAt);
        return filtered.sort((a, b) => b.createdAt - a.createdAt)[0] || null;
      }),
      deleteMany: jest.fn(async () => {
        tokenStore.length = 0;
      }),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `t${tokenStore.length}`, attempts: 0, usedAt: null, createdAt: new Date(), ...data };
        tokenStore.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = tokenStore.find((t) => t.id === where.id);
        if (data.attempts && typeof data.attempts === 'object' && 'increment' in data.attempts) {
          row.attempts = (row.attempts || 0) + data.attempts.increment;
        } else {
          Object.assign(row, data);
        }
        return row;
      }),
      delete: jest.fn(async ({ where }: any) => {
        const idx = tokenStore.findIndex((t) => t.id === where.id);
        if (idx !== -1) tokenStore.splice(idx, 1);
      }),
    },
  };
  const netgsm: any = {
    formatTurkishNumber: (p: string) => (p.startsWith('+') ? p : `+90${p.replace(/\D/g, '')}`),
    sendOtp: jest.fn(async () => ({ success: true, messageId: 'm1' })),
  };
  return { prisma, netgsm, users, tokenStore };
}

describe('PhoneVerificationService', () => {
  it('kod gönderir ve token oluşturur', async () => {
    const { prisma, netgsm, tokenStore } = makeDeps();
    const svc = new PhoneVerificationService(prisma, netgsm);
    await expect(svc.sendCode('u1', '+905551234567')).resolves.toBeUndefined();
    expect(tokenStore.length).toBe(1);
    expect(netgsm.sendOtp).toHaveBeenCalled();
  });

  it('sendCode artık user.phone yazMIYOR (I2)', async () => {
    const { prisma, netgsm, users } = makeDeps();
    const svc = new PhoneVerificationService(prisma, netgsm);
    await svc.sendCode('u1', '+905551234567');
    // user.update çağrılmamış olmalı (telefon veya isPhoneVerified için)
    expect(prisma.user.update).not.toHaveBeenCalled();
    // Kullanıcının phone'u hâlâ null
    expect(users.u1.phone).toBeNull();
  });

  it('başka kullanıcıya DOĞRULANMIŞ kayıtlı numarayı reddeder (I2)', async () => {
    const { prisma, netgsm, users } = makeDeps();
    users.u2 = { id: 'u2', phone: '+905551234567', isPhoneVerified: true };
    const svc = new PhoneVerificationService(prisma, netgsm);
    await expect(svc.sendCode('u1', '+905551234567')).rejects.toThrow(ConflictException);
  });

  it('doğrulanmamış başka kullanıcı aynı numarayı engellemiyor (I2)', async () => {
    const { prisma, netgsm, users } = makeDeps();
    users.u2 = { id: 'u2', phone: '+905551234567', isPhoneVerified: false };
    const svc = new PhoneVerificationService(prisma, netgsm);
    // Conflict fırlatmamalı; başarıyla devam etmeli (sendCode artık void döner,
    // başarı mesajını controller katalogdan kurar — #224)
    await expect(svc.sendCode('u1', '+905551234567')).resolves.toBeUndefined();
  });

  it('geçersiz numara BadRequestException fırlatır (M5)', async () => {
    const { prisma, netgsm } = makeDeps();
    const svc = new PhoneVerificationService(prisma, netgsm);
    await expect(svc.sendCode('u1', 'abc')).rejects.toThrow(BadRequestException);
    await expect(svc.sendCode('u1', '+++')).rejects.toThrow(BadRequestException);
  });

  it('doğru kodu doğrular; user.phone VE isPhoneVerified=true yazar (I2)', async () => {
    const { prisma, netgsm, users } = makeDeps();
    const svc = new PhoneVerificationService(prisma, netgsm);
    let sentCode = '';
    netgsm.sendOtp.mockImplementation(async (_p: string, c: string) => {
      sentCode = c;
      return { success: true };
    });
    await svc.sendCode('u1', '+905551234567');
    const res = await svc.verify('u1', sentCode);
    expect(res.isPhoneVerified).toBe(true);
    expect(users.u1.isPhoneVerified).toBe(true);
    expect(users.u1.phone).toBe('+905551234567');
  });

  it('yanlış kodda hata fırlatır', async () => {
    const { prisma, netgsm } = makeDeps();
    const svc = new PhoneVerificationService(prisma, netgsm);
    await svc.sendCode('u1', '+905551234567');
    await expect(svc.verify('u1', '000000')).rejects.toThrow(BadRequestException);
  });

  it('SMS başarısız olursa token silinir ve hata fırlatır', async () => {
    const { prisma, netgsm, tokenStore } = makeDeps();
    netgsm.sendOtp.mockResolvedValue({ success: false, error: 'NetGSM hatası' });
    const svc = new PhoneVerificationService(prisma, netgsm);
    await expect(svc.sendCode('u1', '+905551234567')).rejects.toThrow(BadRequestException);
    expect(tokenStore.length).toBe(0);
    expect(prisma.phoneVerificationToken.delete).toHaveBeenCalled();
  });

  it('cooldown: aynı kullanıcı için ikinci sendCode hemen hata fırlatır (I1)', async () => {
    const { prisma, netgsm } = makeDeps();
    const svc = new PhoneVerificationService(prisma, netgsm);
    await svc.sendCode('u1', '+905551234567');
    await expect(svc.sendCode('u1', '+905551234567')).rejects.toThrow(BadRequestException);
  });

  it('cooldown: doğrulama sonrası yeni sendCode 60s içinde hâlâ engellenir (M1)', async () => {
    const { prisma, netgsm } = makeDeps();
    const svc = new PhoneVerificationService(prisma, netgsm);
    let sentCode = '';
    netgsm.sendOtp.mockImplementation(async (_p: string, c: string) => {
      sentCode = c;
      return { success: true };
    });
    await svc.sendCode('u1', '+905551234567');
    await svc.verify('u1', sentCode);
    // Token kullanıldı; ama createdAt hâlâ yakın → cooldown devrede olmalı
    await expect(svc.sendCode('u1', '+905551234567')).rejects.toThrow(BadRequestException);
  });

  it('MAX_ATTEMPTS: 5 yanlış denemeden sonra lockout hatası fırlatır', async () => {
    const { prisma, netgsm } = makeDeps();
    const svc = new PhoneVerificationService(prisma, netgsm);
    await svc.sendCode('u1', '+905551234567');
    for (let i = 0; i < PhoneVerificationService.MAX_ATTEMPTS; i++) {
      await expect(svc.verify('u1', '000000')).rejects.toThrow(BadRequestException);
    }
    await expect(svc.verify('u1', '000000')).rejects.toMatchObject({
      response: { i18nKey: 'server.auth.tooManyWrongAttempts' },
    });
  });
});
