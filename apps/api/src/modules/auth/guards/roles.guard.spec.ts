import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { BYPASS_PERMISSION_MATRIX_KEY } from '../decorators/bypass-permission-matrix.decorator';

/**
 * retry-refund gibi gerçek-para iadesi tetikleyen endpoint @RequirePermission('refund_requests')
 * ile korunmalı: moderator (refund izni yok) engellenmeli, admin/super_admin geçmeli.
 * Bu, URL segmenti "trades" olduğu için iadenin yanlışlıkla 'trades' iznine düşmesini
 * (moderator'ın iadeyi retry edebilmesini) engelleyen düzeltmenin regresyon testi.
 */
describe('RolesGuard — refund_requests izin kapısı (retry-refund money-path)', () => {
  const makeGuard = () => {
    // platformSetting yok → DEFAULT_ROLE_PERMISSIONS kullanılır
    const prisma = {
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    } as any;
    const reflector = new Reflector();
    return new RolesGuard(reflector, prisma);
  };

  const makeContext = (role: string): ExecutionContext => {
    const req = {
      user: { isAdmin: true, role },
      method: 'POST',
      originalUrl: '/api/admin/trades/abc/retry-refund',
    };
    // @Roles(super_admin, admin, moderator) + @RequirePermission('refund_requests')
    const handler = () => undefined;
    (handler as any)[ROLES_KEY] = ['super_admin', 'admin', 'moderator'];
    (handler as any)[PERMISSION_KEY] = 'refund_requests';
    return {
      getHandler: () => handler,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => req }),
    } as any;
  };

  // Reflector.getAllAndOverride'ı handler metadata'sından okuyacak şekilde stub'la
  const stubReflector = (guard: RolesGuard) => {
    const r: Reflector = (guard as any).reflector;
    jest
      .spyOn(r, 'getAllAndOverride')
      .mockImplementation((key: any, targets: any[]) => {
        const h = targets[0];
        if (key === ROLES_KEY) return h?.[ROLES_KEY];
        if (key === PERMISSION_KEY) return h?.[PERMISSION_KEY];
        if (key === BYPASS_PERMISSION_MATRIX_KEY) return undefined;
        return undefined;
      });
  };

  it('moderator → iadeyi retry EDEMEZ (refund_requests izni yok)', async () => {
    const guard = makeGuard();
    stubReflector(guard);
    await expect(guard.canActivate(makeContext('moderator'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('admin → iadeyi retry edebilir (refund_requests izni var)', async () => {
    const guard = makeGuard();
    stubReflector(guard);
    await expect(guard.canActivate(makeContext('admin'))).resolves.toBe(true);
  });

  it('super_admin → her zaman geçer', async () => {
    const guard = makeGuard();
    stubReflector(guard);
    await expect(guard.canActivate(makeContext('super_admin'))).resolves.toBe(true);
  });
});
