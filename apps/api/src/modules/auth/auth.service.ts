import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma';
import { RegisterDto, LoginDto, AuthResponseDto, TokensDto } from './dto';
import { JwtPayload } from './interfaces';
import { SellerType } from '@prisma/client';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
  ) {}

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

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        displayName: dto.displayName,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
        isSeller: dto.isSeller ?? false,
        sellerType: dto.isSeller ? SellerType.individual : null,
        isVerified: false, // Email verification required
      },
    });

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
    };
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
        throw new UnauthorizedException('Email veya şifre hatalı');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

      if (!isPasswordValid) {
        throw new UnauthorizedException('Email veya şifre hatalı');
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
          membership: user.membership ? {
            tier: user.membership.tier,
            expiresAt: user.membership.expiresAt?.toISOString(),
          } : undefined,
        },
        tokens,
      };
    } catch (error) {
      // Re-throw known exceptions
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // Log unexpected errors with full details
      console.error('Login error:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      console.error('Error message:', error instanceof Error ? error.message : String(error));
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
    // Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { adminUser: true },
    });

    console.log('Admin login attempt:', { email: dto.email, userFound: !!user, hasAdminUser: !!user?.adminUser });

    if (!user || !user.adminUser) {
      console.log('Admin login failed: User not found or no admin user');
      throw new UnauthorizedException('Email veya şifre hatalı');
    }

    if (!user.adminUser.isActive) {
      console.log('Admin login failed: Admin account is inactive');
      throw new UnauthorizedException('Admin hesabı deaktif edilmiş');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    console.log('Password validation:', { isValid: isPasswordValid });

    if (!isPasswordValid) {
      console.log('Admin login failed: Invalid password');
      throw new UnauthorizedException('Email veya şifre hatalı');
    }

    // Generate admin tokens (using separate secret)
    const tokens = await this.generateAdminTokens(
      user.id,
      user.email,
      user.adminUser.role,
    );

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
   */
  async refreshTokens(userId: string, refreshToken: string): Promise<TokensDto> {
    // Find user
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('Kullanıcı bulunamadı');
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
  async logout(userId: string): Promise<{ message: string }> {
    // In a production system with Redis, we would add the token to a blacklist
    // For now, we just return success and client removes the token
    return { message: 'Çıkış yapıldı' };
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

      return { accessToken, refreshToken };
    } catch (error) {
      console.error('Token generation error:', error);
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
        secret: this.configService.get<string>('ADMIN_JWT_SECRET'),
        expiresIn: this.configService.get<string>('ADMIN_JWT_EXPIRES_IN') || '15m',
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: '1d', // Shorter refresh for admin
      }),
    ]);

    return { accessToken, refreshToken };
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
}
