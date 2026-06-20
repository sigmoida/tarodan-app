import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { BYPASS_PERMISSION_MATRIX_KEY } from '../decorators/bypass-permission-matrix.decorator';
import { RequestUser } from '../interfaces';
import { PrismaService } from '../../../prisma';
import { DEFAULT_ROLE_PERMISSIONS, migrateLegacyPermissions } from '../../admin/dto/role-permissions.dto';

// ── URL → izin anahtarı eşleşmesi ──────────────────────────────────────────
//
// İstek URL'inin ilk path segmenti kullanılır: /api/admin/<segment>/...
// GET ve yazma isteklerinin ikisi de aynı izni gerektirir — sayfa erişim modeli.
// @RequirePermission decorator varsa bu tabloyu override eder.
//
const PERMISSION_MAP: Record<string, string[]> = {
  'dashboard': ['dashboard'],
  'analytics': ['analytics'],
  'reports': ['analytics'],
  'orders': ['orders'],
  'trades': ['trades'],
  'trade-shipments': ['trades'],
  'refund-requests': ['refund_requests'],
  'refunds': ['refund_history', 'refund_requests'],
  'payments': ['payments'],
  'products': ['products'],
  'products-export': ['products'],
  'categories': ['categories'],
  'brands': ['brands'],
  'manufacturers': ['manufacturers'],
  'car-models': ['car_models'],
  'collections': ['collections'],
  'attribute-groups': ['attributes'],
  'attributes': ['attributes'],
  'discounts': ['discounts'],
  'ads': ['ads'],
  'notifications': ['notifications'],
  'email-templates': ['email_templates'],
  'pages': ['pages'],
  'users': ['users', 'seller_performance'],
  'seller-applications': ['seller_applications', 'seller_performance'],
  'user-ratings': ['reviews'],
  'reviews': ['reviews'],
  'messages': ['messages'],
  'support-tickets': ['support'],
  'commission-rules': ['commission'],
  'commission': ['commission'],
  'payouts': ['payouts'],
  'tax': ['tax'],
  'shipping': ['shipping'],
  'settings': ['settings', 'payment_settings'],
  'logs': ['logs'],
  'audit-logs': ['audit_logs'],
  'moderation': ['ai_moderation'],
  'membership-tiers': ['membership_tiers'],
  'staff': ['staff'],
  'media': ['products'],
};

/** URL'den ilk admin path segmentini çıkar: /api/admin/orders/123 → "orders" */
function extractSegment(url: string): string {
  // url örn: /api/admin/orders veya /admin/orders/123?foo=bar
  const clean = url.split('?')[0];
  const parts = clean.split('/').filter(Boolean);
  // "api" ve "admin" segmentlerini atla
  const adminIdx = parts.lastIndexOf('admin');
  return parts[adminIdx + 1] ?? '';
}

function resolveUrlPermissions(_method: string, url: string): string[] | null {
  const seg = extractSegment(url);
  if (!seg) return null;
  return PERMISSION_MAP[seg] ?? null;
}

// ── In-memory cache ─────────────────────────────────────────────────────────

interface PermsCache {
  data: Record<string, string[]>;
  at: number;
}

const CACHE_TTL_MS = 60_000; // 60 saniye
const SETTING_KEY = 'admin_role_permissions';

@Injectable()
export class RolesGuard implements CanActivate {
  private cache: PermsCache | null = null;

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // @RequirePermission decorator'dan gelen explicit override
    const explicitPermission = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // @BypassPermissionMatrix — izin matrisi sorgulanmaz; rol kontrolü yeterli.
    const bypassMatrix = this.reflector.getAllAndOverride<boolean>(BYPASS_PERMISSION_MATRIX_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Ne rol ne izin tanımlanmışsa — geçir (public gibi davran).
    if ((!requiredRoles || requiredRoles.length === 0) && !explicitPermission) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request & { user: RequestUser }>();
    const { user } = req;

    if (!user || !user.isAdmin || !user.role) {
      throw new ForbiddenException('Bu işlem için yetkiniz yok');
    }

    // ── 1. Rol kontrolü (mevcut davranış, değişmedi) ──────────────────────
    if (requiredRoles && requiredRoles.length > 0) {
      const hasRole = requiredRoles.some((r) => user.role === r);
      if (!hasRole) {
        throw new ForbiddenException(`Bu işlem için ${requiredRoles.join(' veya ')} rolü gerekiyor`);
      }
    }

    // ── 2. super_admin her zaman geçer ────────────────────────────────────
    if (user.role === 'super_admin') return true;

    // ── 2b. @BypassPermissionMatrix — rol kontrolü yeterli, matris sorgulanmaz ──
    if (bypassMatrix) return true;

    // ── 3. İzin matrisi kontrolü ──────────────────────────────────────────
    const permKeys: string[] | null =
      explicitPermission
        ? [explicitPermission]
        : resolveUrlPermissions(req.method, req.originalUrl ?? req.url ?? '');

    if (!permKeys || permKeys.length === 0) return true; // Bilinmeyen route — sadece rol yeterli

    const perms = await this.loadPermissions();
    const rolePerms = perms[user.role] ?? [];

    if (!permKeys.some((k) => rolePerms.includes(k))) {
      throw new ForbiddenException(
        `Bu işlem için [${permKeys.join(', ')}] izinlerinden biri gerekiyor. Rol: ${user.role}`,
      );
    }

    return true;
  }

  /** Permission matrisini DB'den yükle; 60s cache'le. */
  private async loadPermissions(): Promise<Record<string, string[]>> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < CACHE_TTL_MS) {
      return this.cache.data;
    }
    try {
      const row = await this.prisma.platformSetting.findUnique({
        where: { settingKey: SETTING_KEY },
      });
      const raw: Record<string, string[]> = row
        ? JSON.parse(row.settingValue)
        : DEFAULT_ROLE_PERMISSIONS;
      const data = migrateLegacyPermissions(raw);
      this.cache = { data, at: now };
      return data;
    } catch {
      // DB başarısızsa varsayılanı kullan; cache'leme (bozuk yanıtı cache'leme).
      return DEFAULT_ROLE_PERMISSIONS;
    }
  }

  /** İzin matrisi güncellendikten sonra cache'i temizle. */
  invalidateCache(): void {
    this.cache = null;
  }
}
