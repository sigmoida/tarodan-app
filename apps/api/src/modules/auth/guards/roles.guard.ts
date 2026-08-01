import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { PERMISSION_KEY } from "../decorators/require-permission.decorator";
import { BYPASS_PERMISSION_MATRIX_KEY } from "../decorators/bypass-permission-matrix.decorator";
import { RequestUser } from "../interfaces";
import { PrismaService } from "../../../prisma";
import {
  DEFAULT_ROLE_PERMISSIONS,
  migrateLegacyPermissions,
} from "../../admin/dto/role-permissions.dto";
import { i18nMessage } from "../../i18n";

// ── URL → izin anahtarı eşleşmesi ──────────────────────────────────────────
//
// İstek URL'inin ilk path segmenti kullanılır: /api/admin/<segment>/...
// GET ve yazma isteklerinin ikisi de aynı izni gerektirir — sayfa erişim modeli.
// @RequirePermission decorator varsa bu tabloyu override eder.
//
export const PERMISSION_MAP: Record<string, string[]> = {
  dashboard: ["dashboard"],
  analytics: ["analytics"],
  reports: ["analytics"],
  orders: ["orders"],
  trades: ["trades"],
  "trade-shipments": ["trades"],
  "refund-requests": ["refund_requests"],
  refunds: ["refund_history", "refund_requests"],
  payments: ["payments"],
  // /finance/overview + /finance/psp/* ve ödeme ekranının mutabakat sekmesi —
  // hepsi menüde "payments" izniyle görünür.
  finance: ["payments"],
  "refund-attempts": ["payments"],
  products: ["products"],
  "products-export": ["products"],
  categories: ["categories"],
  brands: ["brands"],
  manufacturers: ["manufacturers"],
  "car-models": ["car_models"],
  collections: ["collections"],
  "attribute-groups": ["attributes"],
  attributes: ["attributes"],
  discounts: ["discounts"],
  ads: ["ads"],
  // Reklam paketleri + boost satın alımları: menüde /marketing/ad-packages ve
  // /marketing/boost-purchases sayfaları "ads" izniyle gösterilir.
  "ad-packages": ["ads"],
  notifications: ["notifications"],
  "email-templates": ["email_templates"],
  pages: ["pages"],
  users: ["users", "seller_performance"],
  "seller-applications": ["seller_applications", "seller_performance"],
  "user-ratings": ["reviews"],
  reviews: ["reviews"],
  messages: ["messages"],
  "support-tickets": ["support"],
  "commission-rules": ["commission"],
  commission: ["commission"],
  payouts: ["payouts"],
  tax: ["tax"],
  shipping: ["shipping"],
  settings: ["settings", "payment_settings"],
  "site-access-pins": ["settings"],
  logs: ["logs"],
  "audit-logs": ["audit_logs"],
  moderation: ["ai_moderation"],
  "membership-tiers": ["membership_tiers"],
  staff: ["staff"],
  media: ["products"],
};

/**
 * URL yol parçaları — TEK ayrıştırma noktası. Küçük harfe çevirir: Express
 * varsayılan olarak harfe DUYARSIZ yönlendirir (`case sensitive routing`
 * açılmadı), yani /api/ADMIN/payouts aynı handler'a düşer. Harfe duyarlı
 * ayrıştırma "admin"i bulamaz, izin anahtarı çözülemez ve istek yalnız rol
 * kontrolüne düşerdi — matrisin tamamı atlanırdı.
 */
function urlParts(url: string): string[] {
  const clean = url.split("?")[0].toLowerCase();
  return clean.split("/").filter(Boolean);
}

/** URL'den ilk admin path segmentini çıkar: /api/admin/orders/123 → "orders" */
function extractSegment(url: string): string {
  const parts = urlParts(url);
  // İLK "admin" işaretçisi kullanılır: lastIndexOf, "admin" adlı bir path
  // parametresinde (örn. /api/admin/email-templates/admin) işaretçiyi sona
  // kaydırıp segmenti boşaltıyor ve matrisi atlatıyordu.
  const adminIdx = parts.indexOf("admin");
  return adminIdx === -1 ? "" : (parts[adminIdx + 1] ?? "");
}

// Kanonik admin route'ları (@Controller('admin')) içinde segmenti PERMISSION_MAP'e
// KASITLI olarak eklenmemiş, yalnızca rol ile korunan mevcut route'lar. Bunlar
// fail-open bırakılır ki mevcut (moderator dahil) erişimleri korunsun. Bu kümenin
// DIŞINDAKİ, eşlenmemiş yeni bir admin segmenti fail-closed olur (aşağıya bakın).
export const ROLE_ONLY_ADMIN_SEGMENTS = new Set<string>([
  "invoices",
  "seller-invoices",
  "trade-commission-rate",
]);

/**
 * URL kanonik bir admin route'u mu: /api/admin/<segment>/... yani "admin" ilk
 * path segmenti. Modül içine gömülü /api/support/admin/tickets gibi route'lar
 * kanonik DEĞİLDİR ve fail-closed kapsamına alınmaz (mevcut davranış korunur).
 */
function isCanonicalAdminUrl(url: string): boolean {
  const parts = urlParts(url);
  const p = parts[0] === "api" ? parts.slice(1) : parts;
  return p[0] === "admin";
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
const SETTING_KEY = "admin_role_permissions";

@Injectable()
export class RolesGuard implements CanActivate {
  private cache: PermsCache | null = null;

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // @RequirePermission decorator'dan gelen explicit override
    const explicitPermission = this.reflector.getAllAndOverride<string>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    // @BypassPermissionMatrix — izin matrisi sorgulanmaz; rol kontrolü yeterli.
    const bypassMatrix = this.reflector.getAllAndOverride<boolean>(
      BYPASS_PERMISSION_MATRIX_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Ne rol ne izin tanımlanmışsa — geçir (public gibi davran).
    if ((!requiredRoles || requiredRoles.length === 0) && !explicitPermission) {
      return true;
    }

    const req = context
      .switchToHttp()
      .getRequest<Request & { user: RequestUser }>();
    const { user } = req;

    if (!user || !user.isAdmin || !user.role) {
      throw new ForbiddenException(i18nMessage("server.auth.noPermission"));
    }

    // ── 1. Rol kontrolü (mevcut davranış, değişmedi) ──────────────────────
    if (requiredRoles && requiredRoles.length > 0) {
      const hasRole = requiredRoles.some((r) => user.role === r);
      if (!hasRole) {
        throw new ForbiddenException(
          i18nMessage("server.auth.roleRequired", {
            roles: requiredRoles.join(" veya "),
          }),
        );
      }
    }

    // ── 2. super_admin her zaman geçer ────────────────────────────────────
    if (user.role === "super_admin") return true;

    // ── 2b. @BypassPermissionMatrix — rol kontrolü yeterli, matris sorgulanmaz ──
    if (bypassMatrix) return true;

    // ── 3. İzin matrisi kontrolü ──────────────────────────────────────────
    const url = req.originalUrl ?? req.url ?? "";
    const permKeys: string[] | null = explicitPermission
      ? [explicitPermission]
      : resolveUrlPermissions(req.method, url);

    if (!permKeys || permKeys.length === 0) {
      // Fail-closed: kanonik bir /api/admin/<segment> route'u PERMISSION_MAP'te
      // eşlenmemişse (ve bilinen rol-only istisnalardan biri değilse) erişimi
      // reddet. Aksi halde yeni eklenen ve izin haritasına yazılması unutulan
      // bir admin route'u sessizce sadece-rol kontrolüne düşer ve moderator gibi
      // roller izin matrisini atlayarak erişebilir. Kanonik olmayan
      // (/module/admin/...) ve bilinen rol-only admin route'ları fail-open kalır.
      const seg = extractSegment(url);
      if (
        seg &&
        isCanonicalAdminUrl(url) &&
        !ROLE_ONLY_ADMIN_SEGMENTS.has(seg)
      ) {
        throw new ForbiddenException(
          i18nMessage("server.auth.noPermissionDefined"),
        );
      }
      return true; // Bilinmeyen route — sadece rol yeterli
    }

    const perms = await this.loadPermissions();
    const rolePerms = perms[user.role] ?? [];

    if (!permKeys.some((k) => rolePerms.includes(k))) {
      throw new ForbiddenException(
        i18nMessage("server.auth.permissionRequired", {
          perms: permKeys.join(", "),
          role: user.role,
        }),
      );
    }

    return true;
  }

  /** Permission matrisini DB'den yükle; 60s cache'le. */
  private async loadPermissions(): Promise<Record<string, string[]>> {
    const now = Date.now();
    // Testte cache'i devre dışı bırak: e2e suite'lerinde izin matrisi test-içi
    // değiştirilir (grantAdminPermissions) ve 60s cache testler arası sızarak
    // yük altında bayat kalabiliyor → deterministik davranış için her çağrıda taze oku.
    const ttl = process.env.NODE_ENV === "test" ? 0 : CACHE_TTL_MS;
    if (this.cache && now - this.cache.at < ttl) {
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
      // A stale/default matrix must never restore financial or policy access
      // while the permission store is unavailable or contains invalid JSON.
      throw new ForbiddenException(i18nMessage("server.auth.noPermission"));
    }
  }

  /** İzin matrisi güncellendikten sonra cache'i temizle. */
  invalidateCache(): void {
    this.cache = null;
  }
}
