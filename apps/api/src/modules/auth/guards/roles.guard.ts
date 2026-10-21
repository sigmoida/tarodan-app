import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { ROLES_KEY } from "../decorators/roles.decorator";
import {
  ALL_PERMISSIONS_KEY,
  PERMISSION_KEY,
} from "../decorators/require-permission.decorator";
import { BYPASS_PERMISSION_MATRIX_KEY } from "../decorators/bypass-permission-matrix.decorator";
import { RequestUser } from "../interfaces";
import { PrismaService } from "../../../prisma";
import {
  DEFAULT_ROLE_PERMISSIONS,
  migrateLegacyPermissions,
} from "../../admin/dto/role-permissions.dto";
import { i18nMessage } from "../../i18n";
import { isTest } from "../../../config/environment";

// ── URL -> permission key map ──────────────────────────────────────────────
//
// The request URL's first admin segment is used: /api/admin/<segment>/...
// GET and write requests need the same permission (page access model).
// @RequirePermission and @RequireAllPermissions replace this map (see
// declaredPermissions).
//
export const PERMISSION_MAP: Record<string, string[]> = {
  dashboard: ["dashboard"],
  analytics: ["analytics"],
  reports: ["analytics"],
  orders: ["orders"],
  // Teklifler /operations/orders sekmesinde yaşar → sipariş izniyle görünür.
  offers: ["orders"],
  trades: ["trades"],
  "trade-shipments": ["trades"],
  "refund-requests": ["refund_requests"],
  // İptal & İade ekranının İptaller sekmesi: iade talepleriyle aynı ekran,
  // aynı izin.
  cancellations: ["refund_requests"],
  payments: ["payments"],
  // /finance/overview + /finance/psp/* ve ödeme ekranının mutabakat sekmesi —
  // hepsi menüde "payments" izniyle görünür.
  finance: ["payments"],
  "refund-attempts": ["payments"],
  products: ["products"],
  categories: ["categories"],
  brands: ["brands"],
  manufacturers: ["manufacturers"],
  "car-models": ["car_models"],
  collections: ["collections"],
  "attribute-groups": ["attributes"],
  attributes: ["attributes"],
  discounts: ["discounts"],
  // `/admin/ads/upload` (banner görseli) da bu segmentte: yalnız reklam izni
  // olan rol ürün yüklemesine (`media` → products) erişmeden banner yükler.
  ads: ["ads"],
  // Reklam paketleri + boost satın alımları: menüde /marketing/ad-packages ve
  // /marketing/boost-purchases sayfaları "ads" izniyle gösterilir.
  "ad-packages": ["ads"],
  // Vitrin hero'su (slider + auth görseli, `/admin/hero-slides/upload` dahil)
  // ve ana sayfa güven rozetleri: pazarlama içeriği, reklamla aynı izin.
  "hero-slides": ["ads"],
  "trust-badges": ["ads"],
  notifications: ["notifications"],
  "email-templates": ["email_templates"],
  pages: ["pages"],
  users: ["users", "seller_performance"],
  // Silinen hesapların kimlik arşivi Kullanıcılar ekranının bir parçası; ayrı
  // bir anahtar gerçek bir sınır kurmazdı (aynı izinle kullanıcı detayında
  // TCKN/IBAN zaten görülüyor) ama rol matrisi göçü gerektirirdi.
  "deleted-identities": ["users"],
  // Onay Kayıtları (KVKK / sözleşme / çerez / pazarlama ispatı) kullanıcı
  // verisinin parçası; kullanıcı detayındaki onaylar bölümü de aynı uçları okur.
  consents: ["users"],
  "seller-applications": ["seller_applications", "seller_performance"],
  "user-ratings": ["reviews"],
  reviews: ["reviews"],
  messages: ["messages"],
  "support-tickets": ["support"],
  "commission-rules": ["commission"],
  "commission-rule-sets": ["commission"],
  commission: ["commission"],
  payouts: ["payouts"],
  tax: ["tax"],
  // GİB ilan/satıcı raporu: toplu TCKN/vergi no taşır, Finans menüsünde Vergi
  // Ayarları ile birlikte durur → aynı `tax` izni (varsayılan yalnız
  // super_admin). `finance` segmenti `payments`e bağlı olduğu için kardeş
  // literal segment kullanılır; `@Roles` moderator'ü ayrıca dışarıda tutar.
  "gib-report": ["tax"],
  shipping: ["shipping"],
  settings: ["settings", "payment_settings"],
  // Süreler ve Kurallar ayar ekranının parçası: aynı izinle görünür; yazma
  // ayrıca @Roles(super_admin) ile korunur.
  "timing-rules": ["settings"],
  // Mail Yönlendirme (gönderici kutuları + personel bildirimleri) da Sistem
  // ayarlarının parçası; bütün uçlar ayrıca @Roles(super_admin).
  "mail-routing": ["settings"],
  "site-access-pins": ["settings"],
  logs: ["logs"],
  "audit-logs": ["audit_logs"],
  moderation: ["ai_moderation"],
  "membership-tiers": ["membership_tiers"],
  staff: ["staff"],
  // Genel admin yükleme ucu (üretici logosu + geriye dönük banner). Reklam
  // banner'ı için `ads` izniyle açılan uç `/admin/ads/upload`'dur.
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
  // Hakediş dökümü faturanın dayanağıdır ve fatura uçlarıyla aynı @Roles
  // listesini taşır; ayrı bir izin anahtarı tanıtmak matrisi de guard'ı da
  // ikiye bölerdi.
  "settlement-report",
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

/**
 * What the permission matrix must grant: `any` of the keys (the URL map, or
 * the one `@RequirePermission` key) or `all` of them (`@RequireAllPermissions`
 * plus a `@RequirePermission` declared next to it, so no declared key is
 * dropped). A declared requirement replaces the URL map.
 */
export interface PermissionRequirement {
  keys: string[];
  match: "any" | "all";
}

/** The requirement the decorators declare; null when they declare none. */
export function declaredPermissions(declared: {
  one?: string;
  all?: string[];
}): PermissionRequirement | null {
  if (declared.all && declared.all.length > 0) {
    const keys = declared.one ? [...declared.all, declared.one] : declared.all;
    return { keys: [...new Set(keys)], match: "all" };
  }
  return declared.one ? { keys: [declared.one], match: "any" } : null;
}

/** The URL segment's entry in `PERMISSION_MAP`; null when unmapped. */
function urlPermissions(url: string): PermissionRequirement | null {
  const seg = extractSegment(url);
  const keys = seg ? PERMISSION_MAP[seg] : undefined;
  return keys && keys.length > 0 ? { keys, match: "any" } : null;
}

/** The required keys the role lacks; empty when the requirement is met. */
function missingPermissions(
  requirement: PermissionRequirement,
  rolePerms: string[],
): string[] {
  const missing = requirement.keys.filter((k) => !rolePerms.includes(k));
  if (requirement.match === "all") return missing;
  return missing.length === requirement.keys.length ? missing : [];
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

    // @RequirePermission / @RequireAllPermissions: explicit override
    const explicitPermission = this.reflector.getAllAndOverride<string>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    const allPermissions = this.reflector.getAllAndOverride<string[]>(
      ALL_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // @BypassPermissionMatrix: the role check is enough, no matrix lookup.
    const bypassMatrix = this.reflector.getAllAndOverride<boolean>(
      BYPASS_PERMISSION_MATRIX_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Resolved once: the bypass and early-return decisions read the same rule
    // the matrix check enforces.
    const declared = declaredPermissions({
      one: explicitPermission,
      all: allPermissions,
    });
    const declaresAll = declared?.match === "all";

    // Neither a role nor a declared permission: pass (treated as public).
    if ((!requiredRoles || requiredRoles.length === 0) && !declared) {
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

    // ── 2b. @BypassPermissionMatrix: the role check is enough ──────────────
    // An explicit all-of requirement is never bypassed silently.
    if (bypassMatrix && !declaresAll) return true;

    // ── 3. Permission matrix check ─────────────────────────────────────────
    const url = req.originalUrl ?? req.url ?? "";
    const requirement = declared ?? urlPermissions(url);
    if (!requirement) {
      // Fail closed: a canonical /api/admin/<segment> route whose segment is
      // not in PERMISSION_MAP (and not a known role-only exception) is
      // refused. Otherwise a new admin route someone forgot to map would fall
      // back to the role check alone and roles such as moderator would skip
      // the matrix. Non-canonical (/module/admin/...) and known role-only
      // admin routes stay open to the role check.
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
      return true; // Unknown route: the role is enough
    }

    const perms = await this.loadPermissions();
    const rolePerms = perms[user.role] ?? [];

    const missing = missingPermissions(requirement, rolePerms);
    if (missing.length > 0) {
      // For `all` only the first missing key is named: the message reads
      // "one of [...]", which is exact for a single key.
      const named = requirement.match === "all" ? missing.slice(0, 1) : missing;
      throw new ForbiddenException(
        i18nMessage("server.auth.permissionRequired", {
          perms: named.join(", "),
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
    const ttl = isTest() ? 0 : CACHE_TTL_MS;
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
