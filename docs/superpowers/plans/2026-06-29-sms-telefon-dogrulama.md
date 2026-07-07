# SMS ile Telefon Doğrulama Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kullanıcının telefon numarasını NetGSM SMS OTP ile doğrulayan, web + mobilde simetrik bir güvenlik özelliği eklemek.

**Architecture:** Eklemeli (additive) yaklaşım. Backend'de yeni `PhoneVerificationToken` modeli + yeni `NetGsmProvider` (Twilio'ya dokunulmaz) + auth modülünde iki yeni JWT-korumalı endpoint. Frontend'de web'deki pasif "2FA Yakında" bloğu telefon doğrulama ile değiştirilir; mobilde mevcut 2FA bölümü korunarak yeni telefon doğrulama bölümü eklenir.

**Tech Stack:** NestJS, Prisma, @nestjs/throttler, Next.js (web), Expo/React Native (mobile), Jest.

## Global Constraints

- Hiçbir mevcut endpoint/UI/provider imzası değişmez. Tüm değişiklikler eklemeli.
- Twilio `SmsProvider` (`apps/api/src/modules/notification/providers/sms.provider.ts`) DEĞİŞTİRİLMEZ.
- Mobil TOTP 2FA (`/security/2fa/*`, `apps/mobile/app/settings/security.tsx` 2FA bölümü) DEĞİŞTİRİLMEZ.
- NetGSM env'leri (`NETGSM_USERCODE`, `NETGSM_PASSWORD`, `NETGSM_MSGHEADER`) şimdilik BOŞ. Provider env yoksa graceful: kodu log'a yazar, `success: true` döner (Twilio provider mock davranışıyla birebir).
- OTP kuralları: 6 haneli sayısal kod · 3 dk TTL · 60 sn resend cooldown · 5 yanlış deneme · 3 SMS/dk rate limit.
- Telefon formatı E.164 saklanır (`+90...`); NetGSM'e `905XXXXXXXXX` formatında gider.
- Tüm kullanıcıya dönük metinler Türkçe (mevcut kod stiliyle), web `locale==='en'` desteğini korur.
- Migration sonrası API başlatmadan önce `prisma generate` zorunlu (bayat client riski).

---

## File Structure

**Backend (apps/api):**
- `prisma/schema.prisma` — yeni `PhoneVerificationToken` model + `User` relation alanı (Modify)
- `src/modules/notification/providers/netgsm.provider.ts` — yeni NetGSM provider (Create)
- `src/modules/notification/providers/netgsm.provider.spec.ts` — testler (Create)
- `src/modules/notification/notification.module.ts` — provider'ı kaydet/export (Modify)
- `src/modules/auth/dto/phone-verification.dto.ts` — `SendPhoneCodeDto`, `VerifyPhoneDto` (Create)
- `src/modules/auth/dto/index.ts` — yeni DTO export (Modify)
- `src/modules/auth/phone-verification.service.ts` — sendCode/verify mantığı (Create)
- `src/modules/auth/phone-verification.service.spec.ts` — testler (Create)
- `src/modules/auth/auth.controller.ts` — iki yeni endpoint (Modify)
- `src/modules/auth/auth.module.ts` — yeni servisi kaydet (Modify)

**Frontend (web — apps/web):**
- `src/app/profile/settings/page.tsx` — 2FA bloğunu telefon doğrulama ile değiştir (Modify)

**Frontend (mobile — apps/mobile):**
- `src/services/api.ts` — `authApi`'ya iki metod ekle (Modify)
- `app/settings/security.tsx` — yeni "Telefon Doğrulama" bölümü ekle (Modify)

---

## Task 1: Prisma `PhoneVerificationToken` modeli + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (EmailVerificationToken sonrası, ~178. satır)

**Interfaces:**
- Produces: Prisma model `phoneVerificationToken` — alanlar: `id, userId, phone, codeHash, expiresAt, attempts, usedAt, createdAt`.

- [ ] **Step 1: `User` modeline relation alanı ekle**

`apps/api/prisma/schema.prisma` içinde `User` modelinde, mevcut `emailVerificationTokens` (veya benzeri relation) satırlarının yanına ekle:

```prisma
  phoneVerificationTokens PhoneVerificationToken[]
```

> Not: Eğer `User` modelinde `emailVerificationTokens EmailVerificationToken[]` relation satırı yoksa, önce onu da kontrol et; Prisma her iki tarafta relation gerektirir. `EmailVerificationToken` zaten `user User @relation(...)` ile bağlı olduğundan `User` tarafında karşılık relation alanı vardır — yeni alanı onun hemen altına ekle.

- [ ] **Step 2: Yeni modeli ekle**

`model EmailVerificationToken { ... }` bloğunun hemen altına:

```prisma
model PhoneVerificationToken {
  id        String    @id @default(uuid())
  userId    String    @map("user_id")
  phone     String
  codeHash  String    @map("code_hash")
  expiresAt DateTime  @map("expires_at")
  attempts  Int       @default(0)
  usedAt    DateTime? @map("used_at")
  createdAt DateTime  @default(now()) @map("created_at")
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("phone_verification_tokens")
}
```

- [ ] **Step 3: Migration oluştur**

Run: `cd apps/api && npx prisma migrate dev --name add_phone_verification_token`
Expected: Migration oluşturulur, `phone_verification_tokens` tablosu eklenir, client regenerate edilir.

- [ ] **Step 4: Client'ı doğrula**

Run: `cd apps/api && npx prisma generate && npx tsc --noEmit -p tsconfig.json | head -5`
Expected: `prisma.phoneVerificationToken` tipi erişilebilir, TS hatası yok (yeni alanla ilgili).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): PhoneVerificationToken modeli + migration"
```

---

## Task 2: NetGSM Provider

**Files:**
- Create: `apps/api/src/modules/notification/providers/netgsm.provider.ts`
- Test: `apps/api/src/modules/notification/providers/netgsm.provider.spec.ts`
- Modify: `apps/api/src/modules/notification/notification.module.ts`

**Interfaces:**
- Consumes: `ConfigService`.
- Produces: `NetGsmProvider` injectable.
  - `formatTurkishNumber(phone: string): string` → E.164 (`+90...`)
  - `toNetgsmNumber(phone: string): string` → `905XXXXXXXXX` (E.164'ten `+` atılır)
  - `isConfigured(): boolean`
  - `mapResponseCode(code: string): { success: boolean; error?: string }`
  - `sendOtp(phone: string, code: string): Promise<{ success: boolean; messageId?: string; error?: string }>`

- [ ] **Step 1: Failing test yaz**

`apps/api/src/modules/notification/providers/netgsm.provider.spec.ts`:

```typescript
import { ConfigService } from '@nestjs/config';
import { NetGsmProvider } from './netgsm.provider';

function makeProvider(env: Record<string, string> = {}) {
  const config = { get: (k: string, d?: any) => (k in env ? env[k] : d) } as unknown as ConfigService;
  return new NetGsmProvider(config);
}

describe('NetGsmProvider', () => {
  describe('toNetgsmNumber', () => {
    it('E.164 numarayı 90 öneki ile dönüştürür', () => {
      const p = makeProvider();
      expect(p.toNetgsmNumber('+905551234567')).toBe('905551234567');
    });
    it('yerel 0 formatını dönüştürür', () => {
      const p = makeProvider();
      expect(p.toNetgsmNumber('05551234567')).toBe('905551234567');
    });
  });

  describe('mapResponseCode', () => {
    it('00 başarıdır', () => {
      expect(makeProvider().mapResponseCode('00').success).toBe(true);
    });
    it('40 onaysız başlık hatasıdır', () => {
      const r = makeProvider().mapResponseCode('40');
      expect(r.success).toBe(false);
      expect(r.error).toContain('başlık');
    });
    it('30 kimlik hatasıdır', () => {
      expect(makeProvider().mapResponseCode('30').success).toBe(false);
    });
  });

  describe('sendOtp (config yok)', () => {
    it('env yoksa mock başarı döner ve HTTP çağrısı yapmaz', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch' as any);
      const p = makeProvider();
      const res = await p.sendOtp('+905551234567', '123456');
      expect(res.success).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });

  describe('sendOtp (config var)', () => {
    it('başarılı NetGSM yanıtında success döner', async () => {
      const p = makeProvider({
        NETGSM_USERCODE: 'u',
        NETGSM_PASSWORD: 'p',
        NETGSM_MSGHEADER: 'TARODAN',
      });
      const fetchSpy = jest
        .spyOn(global, 'fetch' as any)
        .mockResolvedValue({ ok: true, json: async () => ({ code: '00', jobid: '123' }) } as any);
      const res = await p.sendOtp('+905551234567', '123456');
      expect(res.success).toBe(true);
      expect(res.messageId).toBe('123');
      fetchSpy.mockRestore();
    });

    it('hata kodunda success false döner', async () => {
      const p = makeProvider({
        NETGSM_USERCODE: 'u',
        NETGSM_PASSWORD: 'p',
        NETGSM_MSGHEADER: 'TARODAN',
      });
      const fetchSpy = jest
        .spyOn(global, 'fetch' as any)
        .mockResolvedValue({ ok: true, json: async () => ({ code: '40' }) } as any);
      const res = await p.sendOtp('+905551234567', '123456');
      expect(res.success).toBe(false);
      fetchSpy.mockRestore();
    });
  });
});
```

- [ ] **Step 2: Test'in fail ettiğini doğrula**

Run: `cd apps/api && npx jest src/modules/notification/providers/netgsm.provider.spec.ts`
Expected: FAIL — "Cannot find module './netgsm.provider'".

- [ ] **Step 3: Provider'ı yaz**

`apps/api/src/modules/notification/providers/netgsm.provider.ts`:

```typescript
/**
 * NetGSM SMS Provider — yalnızca telefon doğrulama OTP'leri için.
 * Mevcut Twilio SmsProvider'a dokunulmaz; bu ayrı bir sağlayıcıdır.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface NetGsmResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class NetGsmProvider {
  private readonly logger = new Logger(NetGsmProvider.name);
  private readonly usercode: string;
  private readonly password: string;
  private readonly msgheader: string;
  private readonly baseUrl: string;
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.usercode = this.configService.get<string>('NETGSM_USERCODE', '').trim();
    this.password = this.configService.get<string>('NETGSM_PASSWORD', '').trim();
    this.msgheader = this.configService.get<string>('NETGSM_MSGHEADER', '').trim();
    this.baseUrl = this.configService
      .get<string>('NETGSM_BASE_URL', 'https://api.netgsm.com.tr')
      .trim();
    this.enabled = !!this.usercode && !!this.password && !!this.msgheader;

    if (!this.enabled) {
      this.logger.warn('NetGSM yapılandırılmadı. OTP SMS yalnızca log\'a yazılacak.');
    }
  }

  isConfigured(): boolean {
    return this.enabled;
  }

  /** Türk numarasını E.164 (+90...) formatına getirir. */
  formatTurkishNumber(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('90') && digits.length === 12) return `+${digits}`;
    if (digits.startsWith('0') && digits.length === 11) return `+9${digits}`;
    if (digits.length === 10 && digits.startsWith('5')) return `+90${digits}`;
    return phone.startsWith('+') ? phone : `+${digits}`;
  }

  /** E.164'ten NetGSM'in beklediği 905XXXXXXXXX biçimine çevirir. */
  toNetgsmNumber(phone: string): string {
    const e164 = this.formatTurkishNumber(phone);
    return e164.replace(/^\+/, '');
  }

  /** NetGSM response kodunu anlamlı sonuca çevirir. */
  mapResponseCode(code: string): { success: boolean; error?: string } {
    switch (code) {
      case '00':
      case '01':
      case '02':
        return { success: true };
      case '20':
        return { success: false, error: 'Mesaj içeriği/karakter hatası (20)' };
      case '30':
        return { success: false, error: 'Geçersiz kimlik veya API erişimi yok (30)' };
      case '40':
        return { success: false, error: 'Onaysız/tanımsız gönderici başlık (40)' };
      case '50':
        return { success: false, error: 'İYS kaynaklı gönderim engeli (50)' };
      case '70':
        return { success: false, error: 'Geçersiz parametre (70)' };
      case '80':
        return { success: false, error: 'Gönderim limiti aşıldı (80)' };
      case '85':
        return { success: false, error: 'Mükerrer gönderim limiti (85)' };
      default:
        return { success: false, error: `NetGSM hata kodu: ${code}` };
    }
  }

  /** OTP doğrulama kodu gönderir. */
  async sendOtp(phone: string, code: string): Promise<NetGsmResult> {
    const no = this.toNetgsmNumber(phone);
    const msg = `Tarodan dogrulama kodunuz: ${code}. Bu kod 3 dakika gecerlidir.`;

    if (!this.enabled) {
      this.logger.log(`[NETGSM-MOCK] To: ${no}, Code: ${code}`);
      return { success: true, messageId: `mock-netgsm-${no}` };
    }

    try {
      const auth = Buffer.from(`${this.usercode}:${this.password}`).toString('base64');
      const response = await fetch(`${this.baseUrl}/sms/rest/v2/send`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          msgheader: this.msgheader,
          encoding: 'TR',
          messages: [{ msg, no }],
        }),
      });

      const result: any = await response.json().catch(() => ({}));

      if (!response.ok) {
        this.logger.error(`NetGSM HTTP hatası: ${response.status}`);
        return { success: false, error: `NetGSM HTTP ${response.status}` };
      }

      const mapped = this.mapResponseCode(String(result.code ?? ''));
      if (!mapped.success) {
        this.logger.error(`NetGSM gönderim hatası: ${mapped.error}`);
        return mapped;
      }

      this.logger.log(`NetGSM OTP gönderildi: ${no}, jobid: ${result.jobid}`);
      return { success: true, messageId: result.jobid };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Bilinmeyen hata';
      this.logger.error(`NetGSM gönderimi başarısız: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }
}
```

- [ ] **Step 4: notification.module.ts'e kaydet**

`apps/api/src/modules/notification/notification.module.ts` içinde import ekle ve hem `providers` hem `exports` dizilerine `NetGsmProvider` ekle:

```typescript
import { NetGsmProvider } from './providers/netgsm.provider';
```

`providers: [ ... , SmtpProvider, NetGsmProvider]` ve `exports: [ ... , SmtpProvider, NetGsmProvider]`.

- [ ] **Step 5: Testlerin geçtiğini doğrula**

Run: `cd apps/api && npx jest src/modules/notification/providers/netgsm.provider.spec.ts`
Expected: PASS (tüm testler).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/notification/providers/netgsm.provider.ts apps/api/src/modules/notification/providers/netgsm.provider.spec.ts apps/api/src/modules/notification/notification.module.ts
git commit -m "feat(notification): NetGSM OTP SMS provider (Twilio'ya dokunmadan)"
```

---

## Task 3: Phone Verification Service

**Files:**
- Create: `apps/api/src/modules/auth/dto/phone-verification.dto.ts`
- Modify: `apps/api/src/modules/auth/dto/index.ts`
- Create: `apps/api/src/modules/auth/phone-verification.service.ts`
- Test: `apps/api/src/modules/auth/phone-verification.service.spec.ts`
- Modify: `apps/api/src/modules/auth/auth.module.ts`

**Interfaces:**
- Consumes: `PrismaService` (`prisma.phoneVerificationToken`, `prisma.user`), `NetGsmProvider.sendOtp`, `NetGsmProvider.formatTurkishNumber`.
- Produces: `PhoneVerificationService`
  - `sendCode(userId: string, phone: string): Promise<{ message: string }>`
  - `verify(userId: string, code: string): Promise<{ message: string; isPhoneVerified: true }>`
  - Sabitler: `CODE_TTL_MS = 3*60*1000`, `RESEND_COOLDOWN_MS = 60*1000`, `MAX_ATTEMPTS = 5`.

- [ ] **Step 1: DTO'ları yaz**

`apps/api/src/modules/auth/dto/phone-verification.dto.ts`:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, Length } from 'class-validator';

export class SendPhoneCodeDto {
  @ApiProperty({ example: '+905551234567', description: 'Telefon numarası' })
  @IsString()
  @Matches(/^[+\d\s()-]{10,20}$/, { message: 'Geçersiz telefon numarası formatı' })
  phone!: string;
}

export class VerifyPhoneDto {
  @ApiProperty({ example: '123456', description: '6 haneli doğrulama kodu' })
  @IsString()
  @Length(6, 6, { message: 'Kod 6 haneli olmalıdır' })
  @Matches(/^\d{6}$/, { message: 'Kod yalnızca rakamlardan oluşmalıdır' })
  code!: string;
}
```

`apps/api/src/modules/auth/dto/index.ts` sonuna ekle:

```typescript
export * from './phone-verification.dto';
```

- [ ] **Step 2: Failing test yaz**

`apps/api/src/modules/auth/phone-verification.service.spec.ts`:

```typescript
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PhoneVerificationService } from './phone-verification.service';

function makeDeps() {
  const tokenStore: any[] = [];
  const users: Record<string, any> = { u1: { id: 'u1', phone: null, isPhoneVerified: false } };
  const prisma: any = {
    user: {
      findFirst: jest.fn(async ({ where }: any) =>
        Object.values(users).find(
          (u: any) => u.phone === where.phone && u.id !== where.id?.not,
        ) || null,
      ),
      update: jest.fn(async ({ where, data }: any) => {
        Object.assign(users[where.id], data);
        return users[where.id];
      }),
    },
    phoneVerificationToken: {
      findFirst: jest.fn(async () =>
        tokenStore.filter((t) => !t.usedAt).sort((a, b) => b.createdAt - a.createdAt)[0] || null,
      ),
      deleteMany: jest.fn(async () => {
        tokenStore.length = 0;
      }),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `t${tokenStore.length}`, attempts: 0, usedAt: null, ...data };
        tokenStore.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = tokenStore.find((t) => t.id === where.id);
        Object.assign(row, data);
        return row;
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
    const res = await svc.sendCode('u1', '+905551234567');
    expect(res.message).toBeTruthy();
    expect(tokenStore.length).toBe(1);
    expect(netgsm.sendOtp).toHaveBeenCalled();
  });

  it('başka kullanıcıya kayıtlı numarayı reddeder', async () => {
    const { prisma, netgsm, users } = makeDeps();
    users.u2 = { id: 'u2', phone: '+905551234567', isPhoneVerified: true };
    const svc = new PhoneVerificationService(prisma, netgsm);
    await expect(svc.sendCode('u1', '+905551234567')).rejects.toThrow(ConflictException);
  });

  it('doğru kodu doğrular ve isPhoneVerified=true yapar', async () => {
    const { prisma, netgsm, users } = makeDeps();
    const svc = new PhoneVerificationService(prisma, netgsm);
    // sendOtp çağrısının aldığı kodu yakala
    let sentCode = '';
    netgsm.sendOtp.mockImplementation(async (_p: string, c: string) => {
      sentCode = c;
      return { success: true };
    });
    await svc.sendCode('u1', '+905551234567');
    const res = await svc.verify('u1', sentCode);
    expect(res.isPhoneVerified).toBe(true);
    expect(users.u1.isPhoneVerified).toBe(true);
  });

  it('yanlış kodda hata fırlatır', async () => {
    const { prisma, netgsm } = makeDeps();
    const svc = new PhoneVerificationService(prisma, netgsm);
    await svc.sendCode('u1', '+905551234567');
    await expect(svc.verify('u1', '000000')).rejects.toThrow(BadRequestException);
  });
});
```

- [ ] **Step 3: Test'in fail ettiğini doğrula**

Run: `cd apps/api && npx jest src/modules/auth/phone-verification.service.spec.ts`
Expected: FAIL — "Cannot find module './phone-verification.service'".

- [ ] **Step 4: Servisi yaz**

`apps/api/src/modules/auth/phone-verification.service.ts`:

```typescript
import {
  Injectable,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma';
import { NetGsmProvider } from '../notification/providers/netgsm.provider';

@Injectable()
export class PhoneVerificationService {
  private readonly logger = new Logger(PhoneVerificationService.name);
  static readonly CODE_TTL_MS = 3 * 60 * 1000; // 3 dakika
  static readonly RESEND_COOLDOWN_MS = 60 * 1000; // 60 sn
  static readonly MAX_ATTEMPTS = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly netgsm: NetGsmProvider,
  ) {}

  private hash(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  private generateCode(): string {
    return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  async sendCode(userId: string, phone: string): Promise<{ message: string }> {
    const normalized = this.netgsm.formatTurkishNumber(phone);

    // Başka kullanıcıya kayıtlı mı?
    const taken = await this.prisma.user.findFirst({
      where: { phone: normalized, id: { not: userId } },
    });
    if (taken) {
      throw new ConflictException('Bu telefon numarası başka bir hesapta kayıtlı');
    }

    // Resend cooldown: son aktif token 60 sn içindeyse engelle
    const last = await this.prisma.phoneVerificationToken.findFirst({
      where: { userId, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (
      last &&
      Date.now() - new Date(last.createdAt).getTime() < PhoneVerificationService.RESEND_COOLDOWN_MS
    ) {
      throw new BadRequestException('Çok sık deneme. Lütfen biraz sonra tekrar deneyin.');
    }

    // Numarayı kullanıcıya yaz (henüz doğrulanmadı)
    await this.prisma.user.update({
      where: { id: userId },
      data: { phone: normalized, isPhoneVerified: false },
    });

    // Eski tokenları temizle, yenisini oluştur
    await this.prisma.phoneVerificationToken.deleteMany({ where: { userId } });
    const code = this.generateCode();
    await this.prisma.phoneVerificationToken.create({
      data: {
        userId,
        phone: normalized,
        codeHash: this.hash(code),
        expiresAt: new Date(Date.now() + PhoneVerificationService.CODE_TTL_MS),
      },
    });

    const result = await this.netgsm.sendOtp(normalized, code);
    if (!result.success) {
      throw new BadRequestException(result.error || 'SMS gönderilemedi');
    }

    return { message: 'Doğrulama kodu telefonunuza gönderildi' };
  }

  async verify(
    userId: string,
    code: string,
  ): Promise<{ message: string; isPhoneVerified: true }> {
    const token = await this.prisma.phoneVerificationToken.findFirst({
      where: { userId, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!token) {
      throw new BadRequestException('Aktif doğrulama kodu yok. Yeni kod isteyin.');
    }
    if (new Date(token.expiresAt) < new Date()) {
      throw new BadRequestException('Kodun süresi doldu. Yeni kod isteyin.');
    }
    if (token.attempts >= PhoneVerificationService.MAX_ATTEMPTS) {
      throw new BadRequestException('Çok fazla yanlış deneme. Yeni kod isteyin.');
    }

    if (token.codeHash !== this.hash(code)) {
      await this.prisma.phoneVerificationToken.update({
        where: { id: token.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Kod hatalı');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { isPhoneVerified: true },
    });
    await this.prisma.phoneVerificationToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    });

    return { message: 'Telefon numaranız doğrulandı', isPhoneVerified: true };
  }
}
```

- [ ] **Step 5: auth.module.ts'e kaydet**

`apps/api/src/modules/auth/auth.module.ts`:
- import: `import { PhoneVerificationService } from './phone-verification.service';`
- `providers` dizisine `PhoneVerificationService` ekle.
- `NotificationModule` zaten import'lu (satır 29) — `NetGsmProvider` oradan gelir; ek import gerekmez.

- [ ] **Step 6: Testlerin geçtiğini doğrula**

Run: `cd apps/api && npx jest src/modules/auth/phone-verification.service.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/auth/dto/phone-verification.dto.ts apps/api/src/modules/auth/dto/index.ts apps/api/src/modules/auth/phone-verification.service.ts apps/api/src/modules/auth/phone-verification.service.spec.ts apps/api/src/modules/auth/auth.module.ts
git commit -m "feat(auth): telefon doğrulama servisi (OTP üretim/doğrulama)"
```

---

## Task 4: Controller endpoint'leri

**Files:**
- Modify: `apps/api/src/modules/auth/auth.controller.ts`

**Interfaces:**
- Consumes: `PhoneVerificationService.sendCode/verify`, `JwtAuthGuard`, `CurrentUser` decorator (RequestUser), `Throttle`.
- Produces: HTTP endpoint'leri:
  - `POST /auth/phone/send-code` body `{ phone }` → `{ message }`
  - `POST /auth/phone/verify` body `{ code }` → `{ message, isPhoneVerified }`

- [ ] **Step 1: Controller'ı güncelle**

`apps/api/src/modules/auth/auth.controller.ts`:
- Constructor'a servisi enjekte et:

```typescript
constructor(
  private readonly authService: AuthService,
  private readonly phoneVerificationService: PhoneVerificationService,
) {}
```

- import ekle (üstteki DTO import bloğuna): `SendPhoneCodeDto, VerifyPhoneDto`, ve ayrı satır: `import { PhoneVerificationService } from './phone-verification.service';`
- `RequestUser` zaten import'lu (satır 34). Aşağıdaki endpoint'leri controller sınıfına ekle:

```typescript
  /**
   * POST /auth/phone/send-code
   * Kullanıcının telefonuna doğrulama kodu gönderir.
   */
  @Post('phone/send-code')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Telefon doğrulama kodu gönder' })
  async sendPhoneCode(
    @CurrentUser() user: RequestUser,
    @Body() dto: SendPhoneCodeDto,
  ): Promise<{ message: string }> {
    return this.phoneVerificationService.sendCode(user.id, dto.phone);
  }

  /**
   * POST /auth/phone/verify
   * Gönderilen kodu doğrular.
   */
  @Post('phone/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Telefon doğrulama kodunu doğrula' })
  async verifyPhone(
    @CurrentUser() user: RequestUser,
    @Body() dto: VerifyPhoneDto,
  ): Promise<{ message: string; isPhoneVerified: boolean }> {
    return this.phoneVerificationService.verify(user.id, dto.code);
  }
```

> Not: `CurrentUser` decorator'ının döndürdüğü alan adı (`user.id` vs `user.userId`) için mevcut korumalı endpoint'lerden birine bak (örn. change-password) ve aynısını kullan.

- [ ] **Step 2: Build doğrula**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json | head -20`
Expected: Yeni kodla ilgili TS hatası yok.

- [ ] **Step 3: API'yi başlatıp endpoint'leri manuel test et**

Run: `cd apps/api && npm run start:dev` (ayrı terminalde). Geçerli bir JWT ile:

```bash
curl -s -X POST http://localhost:3001/auth/phone/send-code \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"phone":"+905551234567"}'
```
Expected: `{"message":"Doğrulama kodu telefonunuza gönderildi"}`; API log'unda `[NETGSM-MOCK] ... Code: XXXXXX`.

```bash
curl -s -X POST http://localhost:3001/auth/phone/verify \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"code":"<LOGDAN_OKUNAN_KOD>"}'
```
Expected: `{"message":"Telefon numaranız doğrulandı","isPhoneVerified":true}`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/auth/auth.controller.ts
git commit -m "feat(auth): telefon doğrulama endpoint'leri (send-code, verify)"
```

---

## Task 5: Web UI — 2FA bloğunu telefon doğrulama ile değiştir

**Files:**
- Modify: `apps/web/src/app/profile/settings/page.tsx`

**Interfaces:**
- Consumes: backend `POST /auth/phone/send-code`, `POST /auth/phone/verify`. Web `api` client (`@/lib/api`), `useAuthStore` (mevcut `user.phone`, `user.isPhoneVerified`).
- Produces: Güvenlik bölümünde telefon doğrulama satırı + doğrulama modalı.

> Not: API çağrısı için mevcut `api` (`@/lib/api`) kullanımına bak (diğer çağrılar nasıl yapılıyor — `api.post('/auth/...')`). Aynı imzayı kullan.

- [ ] **Step 1: State + handler'lar ekle**

`page.tsx` component'i içinde (notification state'lerinin yanına):

```typescript
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneInput, setPhoneInput] = useState(user?.phone || '');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneStep, setPhoneStep] = useState<'enter' | 'verify'>('enter');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const handleSendPhoneCode = async () => {
    setPhoneLoading(true);
    try {
      await api.post('/auth/phone/send-code', { phone: phoneInput });
      toast.success(locale === 'en' ? 'Code sent' : 'Kod gönderildi');
      setPhoneStep('verify');
      setResendIn(60);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || (locale === 'en' ? 'Failed' : 'Gönderilemedi'));
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleVerifyPhone = async () => {
    setPhoneLoading(true);
    try {
      await api.post('/auth/phone/verify', { code: phoneCode });
      toast.success(locale === 'en' ? 'Phone verified' : 'Telefon doğrulandı');
      setShowPhoneModal(false);
      setPhoneStep('enter');
      setPhoneCode('');
      // user store'u tazele (mevcut refresh mekanizması neyse onu kullan)
      window.location.reload();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || (locale === 'en' ? 'Invalid code' : 'Kod hatalı'));
    } finally {
      setPhoneLoading(false);
    }
  };
```

> Not: `api.post` imzası farklıysa (örn. `api('/...', {...})`), dosyadaki mevcut kullanımla eşleştir. `user` `useAuthStore`'dan; yoksa ekle.

- [ ] **Step 2: 2FA bloğunu telefon doğrulama satırı ile değiştir**

`page.tsx` satır 349-366'daki `<div className="flex items-center justify-between p-5 opacity-60"> ... </div>` (İki Faktörlü Doğrulama / Yakında) bloğunun TAMAMINI şununla değiştir:

```tsx
            <button
              type="button"
              onClick={() => {
                setPhoneInput(user?.phone || '');
                setPhoneStep('enter');
                setShowPhoneModal(true);
              }}
              className="w-full flex items-center justify-between p-5 hover:bg-surface transition-colors text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-info-50 rounded-xl flex items-center justify-center">
                  <DevicePhoneMobileIcon className="w-5 h-5 text-info-600" />
                </div>
                <div>
                  <p className="font-medium text-heading">
                    {locale === 'en' ? 'Phone Verification' : 'Telefon Doğrulama'}
                  </p>
                  <p className="text-sm text-muted">
                    {user?.isPhoneVerified
                      ? (locale === 'en' ? 'Your phone is verified' : 'Telefonunuz doğrulandı')
                      : (locale === 'en' ? 'Verify your phone via SMS' : 'Telefonunuzu SMS ile doğrulayın')}
                  </p>
                </div>
              </div>
              {user?.isPhoneVerified ? (
                <span className="text-xs bg-success-50 text-success-700 px-3 py-1 rounded-full font-medium">
                  {locale === 'en' ? 'Verified' : 'Doğrulandı'}
                </span>
              ) : (
                <ArrowLeftIcon className="w-5 h-5 text-subtle rotate-180" />
              )}
            </button>
```

> `DevicePhoneMobileIcon` zaten import'lu (satır 11). `FingerPrintIcon` artık kullanılmıyorsa import'tan kaldır (lint hatası vermesin).

- [ ] **Step 3: Modal ekle**

`page.tsx`'in return'ünün sonuna (en dıştaki kapanıştan önce), Danger Zone modallarının yanına:

```tsx
        <Modal
          isOpen={showPhoneModal}
          onClose={() => setShowPhoneModal(false)}
          title={locale === 'en' ? 'Phone Verification' : 'Telefon Doğrulama'}
        >
          {phoneStep === 'enter' ? (
            <div className="space-y-4">
              <Input
                label={locale === 'en' ? 'Phone number' : 'Telefon numarası'}
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="+905551234567"
              />
              <Button onClick={handleSendPhoneCode} disabled={phoneLoading || !phoneInput} className="w-full">
                {locale === 'en' ? 'Send Code' : 'Kod Gönder'}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Input
                label={locale === 'en' ? 'Verification code' : 'Doğrulama kodu'}
                value={phoneCode}
                onChange={(e) => setPhoneCode(e.target.value)}
                placeholder="123456"
                maxLength={6}
              />
              <Button onClick={handleVerifyPhone} disabled={phoneLoading || phoneCode.length !== 6} className="w-full">
                {locale === 'en' ? 'Verify' : 'Doğrula'}
              </Button>
              <button
                type="button"
                onClick={handleSendPhoneCode}
                disabled={resendIn > 0 || phoneLoading}
                className="w-full text-sm text-muted disabled:opacity-50"
              >
                {resendIn > 0
                  ? `${locale === 'en' ? 'Resend in' : 'Tekrar gönder'} ${resendIn}s`
                  : (locale === 'en' ? 'Resend code' : 'Kodu tekrar gönder')}
              </button>
            </div>
          )}
        </Modal>
```

> `Modal`, `Input`, `Button` zaten `@tarodan/ui`'dan import'lu (satır 24). `Modal`/`Input` prop adlarını (`isOpen` vs `open`, `onChange` imzası) dosyadaki mevcut Modal/Input kullanımıyla eşleştir.

- [ ] **Step 4: Manuel doğrula**

Run: `cd apps/web && npm run dev` → `/profile/settings` → Güvenlik bölümü.
Expected:
- "Yakında" rozeti YOK; yerine "Telefon Doğrulama" satırı var, kart layout'u kaymadı.
- Tıkla → numara gir → Kod Gönder → (API log'undan kodu al) → Doğrula → "Doğrulandı" rozeti.
- `npx tsc --noEmit` (web) yeni kodla ilgili hata vermez.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/profile/settings/page.tsx
git commit -m "feat(web/settings): 2FA 'Yakında' yerine telefon doğrulama"
```

---

## Task 6: Mobil UI — Telefon doğrulama bölümü ekle

**Files:**
- Modify: `apps/mobile/src/services/api.ts`
- Modify: `apps/mobile/app/settings/security.tsx`

**Interfaces:**
- Consumes: backend endpoint'leri. `authApi` (mevcut `getTwoFactorStatus` pattern'i).
- Produces: `authApi.sendPhoneCode(phone)`, `authApi.verifyPhone(code)`; security ekranında yeni bölüm.

- [ ] **Step 1: authApi metodları ekle**

`apps/mobile/src/services/api.ts` içinde `authApi` nesnesine (mevcut `getTwoFactorStatus`'ın yanına, aynı stille):

```typescript
  sendPhoneCode: (phone: string) => apiClient.post('/auth/phone/send-code', { phone }),
  verifyPhone: (code: string) => apiClient.post('/auth/phone/verify', { code }),
```

> `apiClient` adı/çağrı stilini dosyadaki mevcut `authApi` metodlarıyla eşleştir.

- [ ] **Step 2: State + handler ekle**

`apps/mobile/app/settings/security.tsx` component'i içinde (diğer state'lerin yanına):

```typescript
  const { user } = useAuthStore();
  const [showPhoneDialog, setShowPhoneDialog] = useState(false);
  const [phoneInput, setPhoneInput] = useState(user?.phone || '');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneStep, setPhoneStep] = useState<'enter' | 'verify'>('enter');
  const [phoneVerified, setPhoneVerified] = useState(!!user?.isPhoneVerified);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setInterval(() => setResendIn((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  const handleSendPhoneCode = async () => {
    setLoading(true);
    try {
      await authApi.sendPhoneCode(phoneInput);
      setPhoneStep('verify');
      setResendIn(60);
      appAlert('Bilgi', 'Doğrulama kodu telefonunuza gönderildi');
    } catch (e: any) {
      appAlert('Hata', e?.response?.data?.message || 'Kod gönderilemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPhone = async () => {
    setLoading(true);
    try {
      await authApi.verifyPhone(phoneCode);
      setPhoneVerified(true);
      setShowPhoneDialog(false);
      setPhoneStep('enter');
      setPhoneCode('');
      appAlert('Başarılı', 'Telefon numaranız doğrulandı');
    } catch (e: any) {
      appAlert('Hata', e?.response?.data?.message || 'Kod hatalı');
    } finally {
      setLoading(false);
    }
  };
```

> `useAuthStore` zaten import'lu (satır 17); `user`'ı oradan al (mevcut destructure'a ekle). `loading`/`setLoading` zaten var (satır 29).

- [ ] **Step 3: Telefon doğrulama bölümünü ekle (2FA bölümünü KORU)**

`security.tsx`'te, mevcut 2FA `<Card>` bölümünün hemen ALTINA (2FA bölümüne dokunmadan), aynı Card/section stilinde yeni bir bölüm ekle:

```tsx
        <Card style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="call-outline" size={20} color={colors.primary} />
            <Text style={styles.sectionTitle}>Telefon Doğrulama</Text>
          </View>
          <Text style={styles.infoText}>
            {phoneVerified
              ? 'Telefon numaranız doğrulandı.'
              : 'Telefon numaranızı SMS ile doğrulayın.'}
          </Text>
          {phoneVerified ? (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={styles.verifiedText}>Doğrulandı</Text>
            </View>
          ) : (
            <Button
              title="Doğrula"
              onPress={() => {
                setPhoneInput(user?.phone || '');
                setPhoneStep('enter');
                setShowPhoneDialog(true);
              }}
              testID="phone-verify-button"
            />
          )}
        </Card>
```

> `styles.section`, `styles.sectionHeader`, `styles.sectionTitle`, `styles.infoText` mevcut 2FA bölümünden kullan. `styles.verifiedBadge`/`verifiedText` yoksa StyleSheet'e ekle (satır içi: `verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }`, `verifiedText: { color: colors.success, fontWeight: '600' }`).

- [ ] **Step 4: Doğrulama Modal'ı ekle**

`security.tsx`'teki mevcut Modal'ların yanına:

```tsx
        <Modal visible={showPhoneDialog} onClose={() => setShowPhoneDialog(false)} title="Telefon Doğrulama">
          {phoneStep === 'enter' ? (
            <View style={{ gap: 12 }}>
              <Input
                label="Telefon numarası"
                value={phoneInput}
                onChangeText={setPhoneInput}
                placeholder="+905551234567"
                keyboardType="phone-pad"
                testID="phone-input"
              />
              <Button title="Kod Gönder" onPress={handleSendPhoneCode} disabled={loading || !phoneInput} />
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              <Input
                label="Doğrulama kodu"
                value={phoneCode}
                onChangeText={setPhoneCode}
                placeholder="123456"
                keyboardType="number-pad"
                maxLength={6}
                testID="phone-code-input"
              />
              <Button title="Doğrula" onPress={handleVerifyPhone} disabled={loading || phoneCode.length !== 6} />
              <TouchableOpacity onPress={handleSendPhoneCode} disabled={resendIn > 0 || loading}>
                <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>
                  {resendIn > 0 ? `Tekrar gönder ${resendIn}s` : 'Kodu tekrar gönder'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </Modal>
```

> `Modal`/`Input`/`Button`/`TouchableOpacity` zaten import'lu (satır 2-14). Modal/Input prop adlarını (`visible` vs `isOpen`, `onChangeText`) dosyadaki mevcut Modal/Input kullanımıyla eşleştir. `colors.textSecondary` yoksa mevcut tema renk adını kullan.

- [ ] **Step 5: Manuel doğrula**

Run: Mobil uygulamayı başlat (mobil güvenilir başlatma reçetesine göre; API 3001 ayakta olmalı). Ayarlar → Güvenlik.
Expected:
- Mevcut 2FA bölümü AYNEN duruyor (bozulmadı).
- Altında "Telefon Doğrulama" bölümü var; spacing/sıralama düzgün.
- Doğrula → numara → Kod Gönder → (API log'undan kod) → Doğrula → "Doğrulandı" rozeti.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/services/api.ts apps/mobile/app/settings/security.tsx
git commit -m "feat(mobile/settings): telefon doğrulama bölümü (2FA korunarak)"
```

---

## Self-Review Notları

- **Spec coverage:** Backend model/provider/servis/endpoint (Task 1-4), web UI 2FA→telefon (Task 5), mobil ek bölüm + 2FA korunması (Task 6), OTP kuralları (Task 3 sabitleri), rate limit (Task 4 @Throttle + servis cooldown), graceful no-config (Task 2). NetGSM onaylı başlık env'i — bilinçli olarak boş, mock-mode ile kapsanıyor.
- **Tutarlılık:** `sendOtp(phone, code)`, `formatTurkishNumber`, `toNetgsmNumber`, `sendCode/verify` isimleri tüm task'larda aynı.
- **Bozmama:** Twilio `SmsProvider` ve mobil 2FA bölümüne hiç dokunulmadı; tüm eklemeler additive.
- **Dış bağımlılık riski:** NetGSM REST v2 endpoint/başlık davranışı canlı panelden teyit edilecek; provider env ile esnek ve config yoksa mock olduğundan dev akışı kırılmaz.
