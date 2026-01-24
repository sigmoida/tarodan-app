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
      select: { isBanned: true },
    });

    if (!dbUser) {
      return true; // User not found, let other guards handle it
    }

    if (dbUser.isBanned) {
      // Allow logout and support ticket creation
      const path = request.url;
      const method = request.method;

      // Allow POST /auth/logout
      if (path.includes('/auth/logout') && method === 'POST') {
        return true;
      }

      // Allow POST /support-tickets (create support ticket)
      if (path.includes('/support-tickets') && method === 'POST') {
        return true;
      }

      // Allow GET /support-tickets/:id (view own tickets)
      if (path.includes('/support-tickets') && method === 'GET' && path.match(/\/support-tickets\/[^\/]+$/)) {
        return true;
      }

      // Block all other requests
      throw new ForbiddenException('Hesabınız banlanmış. Destek ekibiyle iletişime geçin.');
    }

    return true;
  }
}
