import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../../prisma';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { IS_ADMIN_ROUTE_KEY } from '../decorators/admin-route.decorator';
import { i18nMessage } from '../../i18n';

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
    // Public route'ları ATLA. Aksi halde: tarayıcıda banlı bir kullanıcının hâlâ
    // geçerli access_token cookie'si dururken, JwtAuthGuard public route'larda
    // (login/register/google) opsiyonel auth ile o banlı kullanıcıyı request.user'a
    // koyuyordu → BAŞKA bir hesapla /auth/login isteği bile USER_BANNED ile
    // reddediliyordu. Yani banlı cookie varken hiçbir hesapla giriş yapılamıyordu.
    // Ban, kimliği doğrulanmış aksiyonları kısıtlamalı; public erişimi/giriş yapmayı değil.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    // Admin route'lar AdminJwtAuthGuard ile ayrı yönetilir; ban kontrolü kullanıcı
    // oturumuna göredir, admin oturumuna karışma.
    const isAdminRoute = this.reflector.getAllAndOverride<boolean>(IS_ADMIN_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isAdminRoute) {
      return true;
    }

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
      // AllExceptionsFilter renders the catalog key in the request locale and
      // preserves the extra structured fields (#224).
      throw new ForbiddenException({
        ...i18nMessage('server.auth.accountBanned'),
        errorCode: 'USER_BANNED',
        bannedReason: dbUser.bannedReason ?? null,
      });
    }

    return true;
  }
}
