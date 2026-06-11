import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../../prisma';

/**
 * Guard to prevent banned users from accessing API endpoints
 * Allows access to:
 * - Logout endpoint
 * - Support ticket creation
 * - Public endpoints
 */
@Injectable()
export class BannedUserGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // If no user (public route), allow
    if (!user || !user.id) {
      return true;
    }

    // Check if user is banned
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { isBanned: true, bannedReason: true },
    });

    if (!dbUser) {
      return true; // User not found, let other guards handle it
    }

    if (dbUser.isBanned) {
      // Allow logout and support ticket flow
      const path = request.url;
      const method = request.method;

      // Allow POST /auth/logout
      if (path.includes('/auth/logout') && method === 'POST') {
        return true;
      }

      // Allow the whole support ticket flow (create, list own, view, reply)
      // so banned users can reach the support team. SupportController prefix: /support
      if (path.includes('/support/tickets') || path.includes('/support/contact')) {
        return true;
      }

      // Block all other requests. errorCode lets clients distinguish a ban
      // from other 403s and route the user to the dedicated banned screen.
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Hesabınız banlanmış. Destek ekibiyle iletişime geçin.',
        errorCode: 'USER_BANNED',
        bannedReason: dbUser.bannedReason ?? null,
      });
    }

    return true;
  }
}
