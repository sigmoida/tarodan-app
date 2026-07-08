import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma';
import { RegisterDto, BusinessRegisterDto, LoginDto, AuthResponseDto, TokensDto } from './dto';
import { JwtPayload } from './interfaces';
import { SellerType, OrderStatus, PaymentStatus } from '@prisma/client';
import { NotificationService } from '../notification/notification.service';
import { CacheService } from '../cache/cache.service';
import { StorageService } from '../storage/storage.service';
import { GoogleAuthService } from './google-auth.service';
import { AppleAuthService } from './apple-auth.service';
import { PaymentService } from '../payment/payment.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
    private readonly cacheService: CacheService,
    private readonly storageService: StorageService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly appleAuthService: AppleAuthService,
    private readonly moduleRef: ModuleRef,
  ) { }

  private async resolveAvatarUrl(avatarUrl: string | null | undefined): Promise<string | null> {
    if (!avatarUrl) return null;
    if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) return avatarUrl;
    if (this.storageService) {
      try {
        return await this.storageService.getPresignedDownloadUrl('avatars', avatarUrl, 86400);
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Register a new user
   * POST /auth/register
   */
  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Bu email adresi zaten kayıtlı');
    }

    // Check if phone already exists (if provided)
    if (dto.phone) {
      const existingPhone = await this.prisma.user.findUnique({
        where: { phone: dto.phone },
      });

      if (existingPhone) {
        throw new ConflictException('Bu telefon numarası zaten kayıtlı');
      }
    }

    // Validate age (18+) - double check at server level
    if (dto.birthDate) {
      const birth = new Date(dto.birthDate);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();

      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
      }

      if (age < 18) {
        throw new BadRequestException('Kayıt olmak için en az 18 yaşında olmanız gerekmektedir');
      }
    } else {
      throw new BadRequestException('Doğum tarihi zorunludur');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        displayName: dto.displayName,
        birthDate: new Date(dto.birthDate),
        isSeller: dto.isSeller ?? false,
        sellerType: dto.isSeller ? SellerType.individual : null,
        isVerified: false, // Email verification required
        isEmailVerified: false, // Will be true after email verification
        // acceptsMarketingEmails: dto.marketingConsent ?? dto.acceptsMarketingEmails ?? false, // Will be available after migration
      },
    });

    // Update acceptsMarketingEmails after user creation (until migration is done)
    if (dto.marketingConsent || dto.acceptsMarketingEmails) {
      try {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { acceptsMarketingEmails: true } as any, // Type assertion until migration
        });
      } catch (error) {
        // Ignore if field doesn't exist yet
        this.logger.warn('acceptsMarketingEmails field not available yet, migration needed');
      }
    }

    // Check if there are guest orders with this email and link them to the new user
    try {
      // Get system guest user
      const systemGuestUser = await this.prisma.user.findUnique({
        where: { email: 'guest@tarodan.system' },
      });

      if (systemGuestUser) {
        // Get all orders from system guest user
        const guestOrders = await this.prisma.order.findMany({
          where: {
            buyerId: systemGuestUser.id,
          },
        });

        // Filter orders where guestEmail in shippingAddress matches the new user's email
        const matchingOrders = guestOrders.filter((order: any) => {
          try {
            const shippingAddress = order.shippingAddress as any;
            const guestEmail = shippingAddress?.guestEmail?.toLowerCase()?.trim();
            const userEmail = dto.email.toLowerCase().trim();
            return guestEmail === userEmail;
          } catch {
            return false;
          }
        });

        if (matchingOrders.length > 0) {
          // Link guest orders to the new user
          await this.prisma.order.updateMany({
            where: {
              id: { in: matchingOrders.map((o: any) => o.id) },
            },
            data: {
              buyerId: user.id,
            },
          });

          this.logger.log(`Linked ${matchingOrders.length} guest order(s) to new user ${user.id} (${user.email})`);

          // Misafir, ödeme sonrası success sayfasına ulaşamadıysa (eski guest
          // redirect bug'ı) ödeme yakalanmamış olabilir → sahiplenilen pending
          // siparişleri PayTR'da DOĞRULA. Bloklamadan, arka planda; PayTR'da
          // gerçekten ödenmişse sipariş tamamlanır.
          const pendingOrders = matchingOrders.filter(
            (o: any) => o.status === OrderStatus.pending_payment,
          );
          if (pendingOrders.length > 0) {
            void this.verifyClaimedGuestPayments(pendingOrders).catch(() => undefined);
          }
        }
      }
    } catch (error) {
      // Don't fail registration if linking guest orders fails
      this.logger.error(`Failed to link guest orders for ${user.email}: ${error.message}`);
    }

    // Send email verification
    await this.sendEmailVerification(user.id, user.email);

    // Send welcome email if user accepted marketing emails
    if (dto.marketingConsent || dto.acceptsMarketingEmails) {
      try {
        await this.notificationService.sendWelcomeEmail(user.id);
      } catch (error) {
        this.logger.error(`Failed to send welcome email to ${user.email}: ${error.message}`);
      }
    }

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email, user.isSeller);

    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone ?? undefined,
        displayName: user.displayName,
        isVerified: user.isVerified,
        isSeller: user.isSeller,
        sellerType: user.sellerType ?? undefined,
        createdAt: user.createdAt,
      },
      tokens,
      message: 'Kayıt başarılı! Lütfen email adresinize gönderilen doğrulama linkine tıklayın.',
    };
  }

  /**
   * Sahiplenilen pending misafir siparişlerinin ödemesini PayTR'da doğrula.
   * Misafir, ödeme sonrası success sayfasına ulaşamamış (verify çağrısı hiç
   * çalışmamış) ve callback de gelmemişse sipariş pending kalır; burada PayTR
   * durum-sorgusuyla gerçekten ödenmişse sipariş tamamlanır. ModuleRef ile tembel
   * çözüm (Auth↔Payment modül döngüsünü önler). Asla register'ı bloklamaz/patlatmaz.
   */
  private async verifyClaimedGuestPayments(
    orders: { id: string; checkoutGroupId: string | null }[],
  ): Promise<void> {
    let paymentService: PaymentService;
    try {
      paymentService = this.moduleRef.get(PaymentService, { strict: false });
    } catch {
      return;
    }
    for (const order of orders) {
      try {
        const payment = await this.prisma.payment.findFirst({
          where: {
            status: PaymentStatus.pending,
            OR: [
              { orderId: order.id },
              ...(order.checkoutGroupId
                ? [{ checkoutGroupId: order.checkoutGroupId }]
                : []),
            ],
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        if (!payment) continue;
        const res = await paymentService.verifyPaymentFromClient(payment.id);
        if (res.completed) {
          this.logger.log(
            `Recovered guest payment ${payment.id} for claimed order ${order.id}`,
          );
        }
      } catch (e: any) {
        this.logger.warn(
          `verifyClaimedGuestPayments failed for order ${order.id}: ${e?.message}`,
        );
      }
    }
  }

  /**
   * Send email verification link
   */
  async sendEmailVerification(userId: string, email: string): Promise<void> {
    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(verificationToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 3600000); // 24 hours

    // Delete existing tokens for this user
    await this.prisma.emailVerificationToken.deleteMany({
      where: { userId },
    });

    // Create new token
    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        token: hashedToken,
        email,
        expiresAt,
      },
    });

    // Send verification email
    await this.notificationService.sendEmailVerification(userId, verificationToken);
  }

  /**
   * Verify email with token
   * POST /auth/verify-email
   */
  async verifyEmail(token: string): Promise<{ message: string }> {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const verificationToken = await this.prisma.emailVerificationToken.findUnique({
      where: { token: hashedToken },
      include: { user: true },
    });

    if (!verificationToken) {
      throw new BadRequestException('Geçersiz veya süresi dolmuş doğrulama linki');
    }

    if (verificationToken.usedAt) {
      // İdempotent: link zaten kullanılmış (çift tıklama / e-posta istemcisinin
      // link ön-yüklemesi). Kullanıcı zaten doğrulanmışsa bu bir HATA değildir —
      // başarı dön. Aksi halde ilk çağrı doğrularken ikinci çağrı kullanıcıya
      // yanlışlıkla "Doğrulama Başarısız" gösteriyordu.
      if (verificationToken.user?.isEmailVerified) {
        return { message: 'Email adresiniz zaten doğrulanmış.' };
      }
      throw new BadRequestException('Bu doğrulama linki daha önce kullanılmış');
    }

    if (verificationToken.expiresAt < new Date()) {
      throw new BadRequestException('Doğrulama linkinin süresi dolmuş');
    }

    // Mark email as verified
    await this.prisma.user.update({
      where: { id: verificationToken.userId },
      data: { isEmailVerified: true },
    });

    // Mark token as used
    await this.prisma.emailVerificationToken.update({
      where: { id: verificationToken.id },
      data: { usedAt: new Date() },
    });

    return { message: 'Email adresiniz başarıyla doğrulandı!' };
  }

  /**
   * Register a new business account
   * POST /auth/register/business
   */
  async registerBusiness(dto: BusinessRegisterDto): Promise<AuthResponseDto> {
    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Bu email adresi zaten kayıtlı');
    }

    // Check if phone already exists
    const existingPhone = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (existingPhone) {
      throw new ConflictException('Bu telefon numarası zaten kayıtlı');
    }

    // Check if company name already exists (must be unique for business accounts)
    const existingCompanyName = await this.prisma.user.findFirst({
      where: {
        companyName: dto.companyName,
      },
    });

    if (existingCompanyName) {
      throw new ConflictException('Bu şirket adı zaten kayıtlı');
    }

    // Check if tax ID already exists
    if (dto.taxId) {
      const existingTaxId = await this.prisma.user.findFirst({
        where: { taxId: dto.taxId },
      });

      if (existingTaxId) {
        throw new ConflictException('Bu vergi kimlik numarası zaten kayıtlı');
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Create business user
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        displayName: dto.companyName,
        companyName: dto.companyName,
        taxId: dto.taxId,
        isSeller: false,
        businessStatus: 'pending',
        isVerified: false, // Email verification required
        isEmailVerified: false,
        acceptsMarketingEmails: dto.acceptsMarketingEmails ?? false,
      },
    });

    // Send email verification
    await this.sendEmailVerification(user.id, user.email);

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email, user.isSeller);

    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone ?? undefined,
        displayName: user.displayName,
        isVerified: user.isVerified,
        isSeller: user.isSeller,
        sellerType: user.sellerType ?? undefined,
        createdAt: user.createdAt,
      },
      tokens,
      message: 'Şirket hesabı başarıyla oluşturuldu! Lütfen email adresinize gönderilen doğrulama linkine tıklayın.',
    };
  }

  /**
   * Resend email verification
   * POST /auth/resend-verification
   */
  async resendEmailVerification(userId: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı');
    }

    if (user.isEmailVerified) {
      throw new BadRequestException('Email adresi zaten doğrulanmış');
    }

    await this.sendEmailVerification(userId, user.email);

    return { message: 'Doğrulama emaili tekrar gönderildi' };
  }

  /**
   * Login user
   * POST /auth/login
   */
  async login(dto: LoginDto): Promise<AuthResponseDto> {
    try {
      // Find user by email with membership info
      const user = await this.prisma.user.findUnique({
        where: { email: dto.email },
        include: {
          membership: {
            include: {
              tier: true,
            },
          },
        },
      });

      if (!user) {
        // Log failed login attempt - user not found
        await this.logSecurityEvent('failed_login', 'medium', {
          email: dto.email,
          reason: 'user_not_found',
        });
        throw new UnauthorizedException('Email veya şifre hatalı');
      }

      // Silinmiş (anonimleştirilmiş) hesap: kaynakta reddet, token üretme.
      if (user.deletedAt) {
        await this.logSecurityEvent('failed_login', 'medium', {
          email: dto.email,
          userId: user.id,
          reason: 'deleted_account',
        });
        throw new UnauthorizedException('Email veya şifre hatalı');
      }

      // Guard: OAuth-only accounts have no passwordHash — avoid bcrypt throwing on null
      if (!user.passwordHash) {
        await this.logSecurityEvent('failed_login', 'medium', {
          email: dto.email,
          userId: user.id,
          reason: 'oauth_only_account',
        });
        throw new UnauthorizedException('Email veya şifre hatalı');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

      if (!isPasswordValid) {
        // Log failed login attempt - wrong password
        await this.logSecurityEvent('failed_login', 'medium', {
          email: dto.email,
          userId: user.id,
          reason: 'invalid_password',
        });
        throw new UnauthorizedException('Email veya şifre hatalı');
      }

      // Check if email is verified - require email verification before login
      if (!user.isEmailVerified) {
        throw new UnauthorizedException(
          'Email adresiniz henüz doğrulanmamış. Lütfen email adresinize gönderilen doğrulama linkine tıklayın. ' +
          'Doğrulama emaili gelmediyse, tekrar gönderebilirsiniz.'
        );
      }

      // Update lastLoginAt immediately so it's persisted before any other async work
      const now = new Date();
      try {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: now, lastActivityAt: now },
        });
      } catch (err) {
        this.logger.warn(`Failed to update lastLoginAt for user ${user.id}: ${err}`);
      }

      // Generate tokens
      const tokens = await this.generateTokens(user.id, user.email, user.isSeller);

      // Cache invalidation: Clear any guest session cache and set up user cache
      await this.invalidateGuestCacheOnLogin(user.id);

      // Format membership data safely
      let membershipData = undefined;
      if (user.membership && user.membership.tier) {
        try {
          const tier = user.membership.tier;
          // Ensure tier has required fields
          if (tier && tier.type && tier.name) {
            membershipData = {
              tier: {
                type: String(tier.type),
                name: String(tier.name),
              },
              expiresAt: user.membership.currentPeriodEnd
                ? new Date(user.membership.currentPeriodEnd).toISOString()
                : undefined,
            };
          }
        } catch (membershipError) {
          this.logger.warn('Error formatting membership data for login response');
          // Continue without membership data if there's an error
        }
      }

      const resolvedAvatarUrl = await this.resolveAvatarUrl(user.avatarUrl);

      return {
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone ?? undefined,
          displayName: user.displayName,
          avatarUrl: resolvedAvatarUrl,
          isVerified: user.isVerified,
          isSeller: user.isSeller,
          sellerType: user.sellerType ?? undefined,
          createdAt: user.createdAt,
          membership: membershipData,
        },
        tokens,
      };
    } catch (error) {
      // Re-throw known exceptions
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error('Login failed');
      throw new BadRequestException(
        `Giriş işlemi sırasında bir hata oluştu: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Admin login (separate authentication)
   * POST /auth/admin/login
   */
  async adminLogin(dto: LoginDto) {
    // Find user by email – select only columns that exist in DB (avoids schema/DB drift)
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        displayName: true,
        isVerified: true,
        isSeller: true,
        createdAt: true,
        adminUser: true,
      },
    });

    if (!user || !user.adminUser) {
      this.logger.warn('Admin login failed: user not found or no admin user');
      throw new UnauthorizedException('Email veya şifre hatalı');
    }

    if (!user.adminUser.isActive) {
      this.logger.warn('Admin login failed: admin account inactive');
      throw new UnauthorizedException('Admin hesabı deaktif edilmiş');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      this.logger.warn('Admin login failed: invalid password');
      throw new UnauthorizedException('Email veya şifre hatalı');
    }

    // Generate admin tokens (using separate secret)
    const tokens = await this.generateAdminTokens(
      user.id,
      user.email,
      user.adminUser.role,
    );

    await Promise.all([
      this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
      this.prisma.adminUser.update({
        where: { id: user.adminUser.id },
        data: { lastLoginAt: new Date() },
      }),
    ]);

    this.logger.log('Admin login success');

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        isVerified: user.isVerified,
        isSeller: user.isSeller,
        role: user.adminUser.role,
        permissions: user.adminUser.permissions,
        createdAt: user.createdAt,
      },
      tokens,
    };
  }

  /**
   * Refresh tokens
   * POST /auth/refresh
   *
   * Admin refresh token'ı ile gelindiyse admin token (isAdmin claim'li) üretilir;
   * aksi halde admin-jwt strategy yenilenen token'ı reddederdi (eski bug).
   */
  async refreshTokens(
    userId: string,
    refreshToken: string,
    opts?: { isAdmin?: boolean },
  ): Promise<TokensDto> {
    // Find user (admin için adminUser ilişkisiyle güncel rol/aktiflik)
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { adminUser: true },
    });

    if (!user) {
      throw new UnauthorizedException('Kullanıcı bulunamadı');
    }

    // Sunulan refresh token'ı persist edilmiş duruma karşı doğrula + rotasyon için
    // iptal et. Logout/önceki rotation ile iptal edilmiş ya da süresi dolmuş token
    // burada reddedilir (eskiden yalnız JWT imzasına bakılıyordu → iptal yoktu).
    await this.assertAndRotateRefreshToken(user.id, refreshToken);

    // Admin refresh: hesabın hâlâ aktif admin olduğunu doğrula, admin token üret.
    if (opts?.isAdmin) {
      if (!user.adminUser?.isActive) {
        throw new UnauthorizedException('Admin hesabı bulunamadı veya deaktif');
      }
      return this.generateAdminTokens(user.id, user.email, user.adminUser.role);
    }

    // Generate new tokens (token rotation)
    return this.generateTokens(user.id, user.email, user.isSeller);
  }

  /**
   * Logout (client-side token removal)
   * POST /auth/logout
   * 
   * Note: With JWT, logout is typically handled client-side by removing the token.
   * For enhanced security, we could implement a token blacklist using Redis.
   */
  async logout(refreshToken?: string): Promise<{ message: string }> {
    // Refresh token'ı DB'de iptal et → çalınan/logout sonrası token bir daha
    // /auth/refresh'te kullanılamaz. (Eskiden no-op'tu; token, JWT süresi dolana
    // dek — varsayılan 7 gün — geçerli kalıyordu.)
    if (refreshToken) {
      await this.prisma.refreshToken
        .updateMany({
          where: { tokenHash: this.hashToken(refreshToken) },
          data: { revokedAt: new Date() },
        })
        .catch(() => {
          /* iptal best-effort; cookie zaten temizleniyor */
        });
    }
    return { message: 'Çıkış yapıldı' };
  }

  /**
   * Find user by email (for resend verification)
   */
  async findUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true, isEmailVerified: true },
    });
  }

  /**
   * Get current user profile
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { adminUser: true },
    });

    if (!user) {
      throw new BadRequestException('Kullanıcı bulunamadı');
    }

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      displayName: user.displayName,
      isVerified: user.isVerified,
      isPhoneVerified: user.isPhoneVerified,
      isSeller: user.isSeller,
      sellerType: user.sellerType,
      isAdmin: !!user.adminUser?.isActive,
      role: user.adminUser?.role,
      createdAt: user.createdAt,
    };
  }

  /**
   * Generate access and refresh tokens for regular users
   */
  private async generateTokens(
    userId: string,
    email: string,
    isSeller: boolean,
  ): Promise<TokensDto> {
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    const jwtRefreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');

    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not configured in environment variables');
    }

    if (!jwtRefreshSecret) {
      throw new Error('JWT_REFRESH_SECRET is not configured in environment variables');
    }

    const accessPayload: JwtPayload = {
      sub: userId,
      email,
      isSeller,
      type: 'access',
    };

    const refreshPayload: JwtPayload = {
      sub: userId,
      email,
      isSeller,
      type: 'refresh',
    };

    try {
      const [accessToken, refreshToken] = await Promise.all([
        this.jwtService.signAsync(accessPayload, {
          secret: jwtSecret,
          expiresIn: this.configService.get<string>('JWT_EXPIRES_IN') || '15m',
        }),
        this.jwtService.signAsync(refreshPayload, {
          secret: jwtRefreshSecret,
          expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d',
        }),
      ]);

      await this.persistRefreshToken(userId, refreshToken);
      return { accessToken, refreshToken };
    } catch (error) {
      this.logger.error('Token generation failed');
      throw new Error(`Failed to generate tokens: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate access and refresh tokens for admin users (separate secrets)
   */
  private async generateAdminTokens(
    userId: string,
    email: string,
    role: string,
  ): Promise<TokensDto> {
    const accessPayload: JwtPayload = {
      sub: userId,
      email,
      isSeller: false,
      isAdmin: true,
      role,
      type: 'access',
    };

    const refreshPayload: JwtPayload = {
      sub: userId,
      email,
      isSeller: false,
      isAdmin: true,
      role,
      type: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.configService.get<string>('ADMIN_JWT_SECRET') || this.configService.get<string>('JWT_SECRET'),
        expiresIn: this.configService.get<string>('ADMIN_JWT_EXPIRES_IN') || '15m',
      }),

      this.jwtService.signAsync(refreshPayload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn:
          this.configService.get<string>('ADMIN_JWT_REFRESH_EXPIRES_IN') || '7d',
      }),
    ]);

    await this.persistRefreshToken(userId, refreshToken);
    return { accessToken, refreshToken };
  }

  // ==========================================================================
  // REFRESH TOKEN PERSISTENCE & ROTATION (GAP-009 — artık auth akışına bağlı)
  // ==========================================================================
  // Refresh token'lar refresh_tokens tablosunda hash'li saklanır; logout iptal eder,
  // refresh eskiyi iptal edip yenisini üretir (rotation). Böylece çalınan ya da
  // logout sonrası bir refresh token, JWT süresi dolmadan da geçersiz kılınabilir.

  /** Refresh token'ın deterministik SHA-256 özeti (tabloda @unique tokenHash). */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /** Üretilen refresh token'ı hash'leyip DB'ye yazar. Tracking tablosu auth akışını
   *  bloke etmemeli → hata yutulur (token yine de geçerli; en kötü ihtimalle bir
   *  sonraki refresh'te "legacy" muamelesi görür). */
  private async persistRefreshToken(userId: string, refreshToken: string): Promise<void> {
    try {
      const decoded = this.jwtService.decode(refreshToken) as { exp?: number } | null;
      const expiresAt = decoded?.exp
        ? new Date(decoded.exp * 1000)
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await this.prisma.refreshToken.create({
        data: { userId, tokenHash: this.hashToken(refreshToken), expiresAt },
      });
    } catch (error) {
      // Aynı saniyede aynı payload → birebir aynı JWT → tokenHash unique ihlali
      // olabilir; ya da geçici DB hatası. Auth'u düşürmeyelim, sadece logla.
      this.logger.warn(
        `Refresh token persist edilemedi: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Sunulan refresh token'ı persist edilmiş duruma karşı doğrular ve rotasyon için
   *  iptal eder. Bilinen (kayıtlı) token revoked/expired ya da başka kullanıcıya aitse
   *  reddeder. Kaydı olmayan "legacy" token (persistans öncesi üretilmiş) tek seferlik
   *  kabul edilir; tekrar kullanımı engellensin diye anında revoked işaretlenir
   *  (adopt-and-retire). Geçersizse UnauthorizedException fırlatır. */
  private async assertAndRotateRefreshToken(userId: string, refreshToken: string): Promise<void> {
    if (!refreshToken) {
      throw new UnauthorizedException('Geçersiz refresh token');
    }
    const tokenHash = this.hashToken(refreshToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (existing) {
      if (existing.revokedAt) {
        throw new UnauthorizedException('Refresh token iptal edilmiş');
      }
      if (existing.expiresAt < new Date()) {
        throw new UnauthorizedException('Refresh token süresi dolmuş');
      }
      if (existing.userId !== userId) {
        throw new UnauthorizedException('Geçersiz refresh token');
      }
      // Geçerli → rotasyon: eskiyi iptal et (tekrar kullanılırsa yukarıda reddedilir).
      await this.prisma.refreshToken.update({
        where: { tokenHash },
        data: { revokedAt: new Date() },
      });
      return;
    }

    // Kaydı yok → persistans öncesi üretilmiş legacy token (deploy geçiş penceresi).
    // Mevcut tüm oturumları topluca düşürmemek için tek seferlik kabul et; ama hemen
    // "revoked" satır oluştur ki aynı legacy token ikinci kez kullanılamasın.
    const decoded = this.jwtService.decode(refreshToken) as { exp?: number } | null;
    const expiresAt = decoded?.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.prisma.refreshToken
      .create({ data: { userId, tokenHash, expiresAt, revokedAt: new Date() } })
      .catch(() => {
        /* yarış/duplicate → yok say; rotasyon yine de bir kez ilerler */
      });
  }

  /**
   * Invalidate guest cache when user logs in
   * This ensures clean state transition from guest to authenticated
   */
  private async invalidateGuestCacheOnLogin(userId: string): Promise<void> {
    try {
      // Clear any guest-related cache that might exist
      // Clear user-specific caches - NOT global guest caches
      // Note: We only clear the logged-in user's cache, not all guest sessions
      await Promise.all([
        // Clear any stale user cache and refresh
        this.cacheService.del(this.cacheService.userKey(userId)),
        // Clear user's membership limits cache to refresh on login
        this.cacheService.del(this.cacheService.membershipLimitsKey(userId)),
        // Clear user's cart cache if exists
        this.cacheService.del(`cart:${userId}`),
        // Clear user's recently viewed cache if exists
        this.cacheService.del(`recently_viewed:${userId}`),
      ]);

      this.logger.debug(`Cache invalidated for user login: ${userId}`);
    } catch (error) {
      // Log but don't fail login if cache invalidation fails
      this.logger.warn(`Cache invalidation error on login: ${error}`);
    }
  }

  /**
   * Request password reset
   * POST /auth/forgot-password
   */
  async requestPasswordReset(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    // Don't reveal if user exists for security
    if (!user) {
      return { message: 'Eğer bu email kayıtlıysa, şifre sıfırlama linki gönderildi' };
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour

    // Delete existing tokens for this user
    await this.prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

    // Create new token
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: hashedToken,
        expiresAt,
      },
    });

    // Send email with reset link using NotificationService
    await this.notificationService.sendPasswordResetEmail(user.id, resetToken);

    return { message: 'Eğer bu email kayıtlıysa, şifre sıfırlama linki gönderildi' };
  }

  /**
   * Reset password with token
   * POST /auth/reset-password
   */
  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    // Hash the token to compare
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find token
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token: hashedToken },
      include: { user: true },
    });

    if (!resetToken) {
      throw new BadRequestException('Geçersiz veya süresi dolmuş token');
    }

    if (resetToken.usedAt) {
      throw new BadRequestException('Bu token daha önce kullanılmış');
    }

    if (resetToken.expiresAt < new Date()) {
      throw new BadRequestException('Token süresi dolmuş');
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update user password
    await this.prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash },
    });

    // Mark token as used
    await this.prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    });

    return { message: 'Şifre başarıyla sıfırlandı' };
  }

  /**
   * Verilen userId için AuthResponseDto üretir (login response ile aynı şekil).
   */
  private async buildUserAuthResponse(userId: string): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { membership: { include: { tier: true } } },
    });
    if (!user) {
      throw new UnauthorizedException('Kullanıcı bulunamadı');
    }
    // Silinmiş/banlı satıra token verme: aksi halde login "başarılı" olur ama
    // ilk korumalı istekte guard reddeder → kafa karıştırıcı "askıya alındı" ekranı.
    if (user.deletedAt) {
      throw new UnauthorizedException('Hesap silinmiş');
    }
    if (user.isBanned) {
      throw new UnauthorizedException('Hesabınız askıya alınmış');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.isSeller);

    let membershipData = undefined;
    if (user.membership && user.membership.tier) {
      const tier = user.membership.tier;
      if (tier?.type && tier?.name) {
        membershipData = {
          tier: { type: String(tier.type), name: String(tier.name) },
          expiresAt: user.membership.currentPeriodEnd
            ? new Date(user.membership.currentPeriodEnd).toISOString()
            : undefined,
        };
      }
    }

    const resolvedAvatarUrl = await this.resolveAvatarUrl(user.avatarUrl);

    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone ?? undefined,
        displayName: user.displayName,
        avatarUrl: resolvedAvatarUrl,
        isVerified: user.isVerified,
        isPhoneVerified: user.isPhoneVerified,
        isSeller: user.isSeller,
        sellerType: user.sellerType ?? undefined,
        createdAt: user.createdAt,
        membership: membershipData,
      },
      tokens,
    };
  }

  /**
   * Google id_token ile giriş: doğrula → OAuthAccount bul → email ile oto-bağla
   * → yoksa yeni kullanıcı. Mevcut JWT akışını kullanır.
   */
  async loginWithGoogle(idToken: string): Promise<AuthResponseDto> {
    const profile = await this.googleAuthService.verifyIdToken(idToken);

    // 1) Mevcut OAuthAccount?
    const existing = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerUserId: { provider: 'google', providerUserId: profile.sub } },
    });
    if (existing) {
      return this.buildUserAuthResponse(existing.userId);
    }

    // 2) Aynı e-postalı kullanıcı? → oto-bağla
    //    Silinmiş (anonimleştirilmiş) satıra ASLA bağlanma; o satırın email'i zaten
    //    deleted_<id>@deleted.local'a çevrildiği için normalde eşleşmez, ama eski
    //    bozuk silme kalıntılarına karşı deletedAt:null ile savunma yapıyoruz.
    const byEmail = await this.prisma.user.findFirst({
      where: { email: profile.email, deletedAt: null },
    });
    if (byEmail) {
      await this.prisma.oAuthAccount.create({
        data: { provider: 'google', providerUserId: profile.sub, email: profile.email, userId: byEmail.id },
      });
      return this.buildUserAuthResponse(byEmail.id);
    }

    // 3) Yeni kullanıcı
    const displayName = profile.name?.trim() || profile.email.split('@')[0];
    const created = await this.prisma.user.create({
      data: {
        email: profile.email,
        passwordHash: null,
        displayName,
        avatarUrl: profile.picture ?? null,
        isEmailVerified: true,
        isSeller: false,
      },
    });
    await this.prisma.oAuthAccount.create({
      data: { provider: 'google', providerUserId: profile.sub, email: profile.email, userId: created.id },
    });
    return this.buildUserAuthResponse(created.id);
  }

  /**
   * Apple identity token ile giriş: doğrula → OAuthAccount bul → email ile oto-bağla
   * → yoksa yeni kullanıcı. Relay email olduğu gibi kaydedilir; kimlik anahtarı sub.
   * fullName yalnız ilk yetkilendirmede (yeni kullanıcı) gelir.
   */
  async loginWithApple(identityToken: string, fullName?: string): Promise<AuthResponseDto> {
    const profile = await this.appleAuthService.verifyIdentityToken(identityToken);

    // 1) Mevcut OAuthAccount?
    const existing = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerUserId: { provider: 'apple', providerUserId: profile.sub } },
    });
    if (existing) {
      return this.buildUserAuthResponse(existing.userId);
    }

    // 2) Aynı e-postalı (silinmemiş) kullanıcı? → oto-bağla.
    const byEmail = await this.prisma.user.findFirst({
      where: { email: profile.email, deletedAt: null },
    });
    if (byEmail) {
      await this.prisma.oAuthAccount.create({
        data: { provider: 'apple', providerUserId: profile.sub, email: profile.email, userId: byEmail.id },
      });
      return this.buildUserAuthResponse(byEmail.id);
    }

    // 3) Yeni kullanıcı
    const displayName = fullName?.trim() || profile.email.split('@')[0];
    const created = await this.prisma.user.create({
      data: {
        email: profile.email,
        passwordHash: null,
        displayName,
        isEmailVerified: true,
        isSeller: false,
      },
    });
    await this.prisma.oAuthAccount.create({
      data: { provider: 'apple', providerUserId: profile.sub, email: profile.email, userId: created.id },
    });
    return this.buildUserAuthResponse(created.id);
  }

  /**
   * Log security events for monitoring and compliance
   */
  private async logSecurityEvent(
    eventType: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    details: Record<string, any>,
  ): Promise<void> {
    try {
      await this.prisma.securityLog.create({
        data: {
          eventType,
          severity,
          userId: details.userId || null,
          email: details.email || null,
          ipAddress: details.ipAddress || null,
          userAgent: details.userAgent || null,
          details,
        },
      });
    } catch (error) {
      // Don't let logging failures affect the main flow
      this.logger.warn(`Failed to log security event: ${error.message}`);
    }
  }
}
