import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { IS_ADMIN_ROUTE_KEY } from '../decorators/admin-route.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Check if route is marked as admin route (will be handled by AdminJwtAuthGuard)
    const isAdminRoute = this.reflector.getAllAndOverride<boolean>(IS_ADMIN_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isAdminRoute) {
      return true; // Skip global guard, let AdminJwtAuthGuard handle it
    }

    // For public routes, mark request as public so handleRequest knows to allow optional auth
    if (isPublic) {
      const request = context.switchToHttp().getRequest();
      request.isPublicRoute = true;
      // Still try to authenticate if token is present (optional auth)
      return super.canActivate(context) as Promise<boolean> | boolean;
    }

    return super.canActivate(context);
  }

  handleRequest<TUser = any>(err: any, user: any, info: any, context?: ExecutionContext): TUser {
    // Try to get isPublicRoute from the request if context is available
    let isPublic = false;
    if (context) {
      try {
        const request = context.switchToHttp().getRequest();
        isPublic = request.isPublicRoute === true;
      } catch (e) {
        // If we can't access context, assume it's not public
      }
    }

    // For public routes, allow access even if authentication fails
    // But still set user if authentication succeeds
    if (isPublic) {
      if (err || !user) {
        // Return null/undefined for public routes when auth fails
        // This allows the route to be accessed, but req.user will be undefined
        return null as any;
      }
      return user;
    }

    // For protected routes, require authentication
    if (err || !user) {
      throw err || new UnauthorizedException('Oturum açmanız gerekiyor');
    }
    return user;
  }
}
