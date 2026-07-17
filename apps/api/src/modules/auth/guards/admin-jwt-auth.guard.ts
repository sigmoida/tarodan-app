import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { i18nMessage } from '../../i18n';

@Injectable()
export class AdminJwtAuthGuard extends AuthGuard('admin-jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest<TUser = any>(err: any, user: any, info: any): TUser {
    if (err || !user) {
      throw err || new UnauthorizedException(i18nMessage('server.auth.adminAuthRequired'));
    }

    // Check if user has admin privileges (isAdmin is set by AdminJwtStrategy)
    if (!user.isAdmin) {
      throw new UnauthorizedException(i18nMessage('server.auth.adminPrivilegeRequired'));
    }

    return user;
  }
}
