import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { lastValueFrom, of } from "rxjs";
import { LEGAL_IDENTITY_FIELDS } from "@tarodan/types";
import { StripSensitiveFieldsInterceptor } from "./strip-sensitive-fields.interceptor";
import {
  PUBLIC_IDENTITY_SELECT,
  PUBLIC_NAME_SELECT,
  toPublicIdentity,
} from "../helpers/public-identity";
import { redactSensitive } from "../security/redact-sensitive";
import { apiAppRoot } from "../helpers/app-root";
import { UserController } from "../../modules/user/user.controller";
import { ProductController } from "../../modules/product/product.controller";
import { OrderController } from "../../modules/order/order.controller";
import { LegalIdentityController } from "../../modules/legal-identity/legal-identity.controller";
import { AdminUserController } from "../../modules/admin/users/admin-user.controller";

/**
 * SÖZLEŞME: yasal ad, soyad ve TCKN hiçbir herkese açık ya da karşı tarafa
 * giden yüke, loga veya Sentry olayına girmez. Üç savunma hattı birlikte
 * sabitlenir:
 *   1. Herkese açık seçimler (`PUBLIC_IDENTITY_SELECT`) bu alanları seçmez,
 *      `toPublicIdentity` satır taşısa bile düşürür.
 *   2. Yanıt süzgeci GERÇEK uçlarda (herkese açık profil, ilan detayı/satıcı
 *      kartı, sipariş detayı/karşı taraf) bu anahtarları siler; yalnız admin
 *      rotaları ve üyenin kendi kimlik ucu açıkça işaretlidir.
 *   3. Kaynak taraması: `users`tan bu alanları SEÇEN dosyalar bilinen listede.
 */

const TCKN = "10000000146";
const LEAKY_USER = {
  id: "u1",
  username: "ayse",
  displayName: "Ayşe",
  companyName: null,
  legalFirstName: "Ayşe Nur",
  legalLastName: "Yılmaz",
  nationalId: TCKN,
};

const contextFor = (
  controller: new (...args: never[]) => unknown,
  method: string,
): ExecutionContext =>
  ({
    getHandler: () =>
      (controller.prototype as Record<string, unknown>)[method] as () => void,
    getClass: () => controller,
  }) as unknown as ExecutionContext;

const respond = async (ctx: ExecutionContext, payload: unknown) =>
  lastValueFrom(
    new StripSensitiveFieldsInterceptor(new Reflector()).intercept(ctx, {
      handle: () => of(payload),
    }),
  );

const carriesIdentity = (payload: unknown): boolean => {
  const text = JSON.stringify(payload);
  return (
    text.includes(TCKN) ||
    text.includes("Yılmaz") ||
    LEGAL_IDENTITY_FIELDS.some((field) => text.includes(`"${field}"`))
  );
};

describe("yasal kimlik gizliliği", () => {
  describe("herkese açık kimlik seçimi", () => {
    it("PUBLIC_IDENTITY_SELECT ve PUBLIC_NAME_SELECT yasal alanları seçmez", () => {
      for (const field of LEGAL_IDENTITY_FIELDS) {
        expect(PUBLIC_IDENTITY_SELECT).not.toHaveProperty(field);
        expect(PUBLIC_NAME_SELECT).not.toHaveProperty(field);
      }
    });

    it("toPublicIdentity satır yasal alanları taşısa bile düşürür", () => {
      expect(carriesIdentity(toPublicIdentity(LEAKY_USER))).toBe(false);
    });
  });

  describe("yanıt süzgeci — gerçek uçlar", () => {
    it("herkese açık profil yasal kimliği taşımaz", async () => {
      const out = await respond(contextFor(UserController, "getUserProfile"), {
        ...LEAKY_USER,
        stats: { listings: 3 },
      });
      expect(carriesIdentity(out)).toBe(false);
    });

    it("ilan detayındaki satıcı kartı yasal kimliği taşımaz", async () => {
      const out = await respond(contextFor(ProductController, "findOne"), {
        id: "p1",
        title: "1:18 Ferrari",
        seller: { ...LEAKY_USER },
      });
      expect(carriesIdentity(out)).toBe(false);
    });

    it("sipariş detayındaki karşı taraf (alıcı/satıcı) yasal kimliği taşımaz", async () => {
      const out = await respond(contextFor(OrderController, "findOne"), {
        id: "o1",
        buyer: { ...LEAKY_USER },
        seller: { ...LEAKY_USER, id: "u2" },
        items: [{ product: { seller: { ...LEAKY_USER } } }],
      });
      expect(carriesIdentity(out)).toBe(false);
    });

    it("işaretsiz bağlam (handler bilgisi yok) varsayılan olarak siler", async () => {
      const out = await lastValueFrom(
        new StripSensitiveFieldsInterceptor().intercept(
          {} as ExecutionContext,
          { handle: () => of({ ...LEAKY_USER }) },
        ),
      );
      expect(carriesIdentity(out)).toBe(false);
    });

    it("üyenin KENDİ kimlik ucu adını görür (TCKN zaten maskeli döner)", async () => {
      const out = (await respond(
        contextFor(LegalIdentityController, "status"),
        {
          legalFirstName: "Ayşe Nur",
          legalLastName: "Yılmaz",
          nationalIdMasked: "•••••••••46",
        },
      )) as Record<string, unknown>;
      expect(out.legalFirstName).toBe("Ayşe Nur");
      expect(out.legalLastName).toBe("Yılmaz");
    });

    it("admin kullanıcı detayı kimliği görür (yönetici işi)", async () => {
      const out = (await respond(
        contextFor(AdminUserController, "getUserById"),
        { ...LEAKY_USER },
      )) as Record<string, unknown>;
      expect(out.nationalId).toBe(TCKN);
      expect(out.legalLastName).toBe("Yılmaz");
    });
  });

  describe("log / Sentry redaksiyonu", () => {
    it("istek gövdesindeki yasal kimlik ve banka TCKN'si değer olarak yazılmaz", () => {
      const redacted = redactSensitive({
        body: {
          legalFirstName: "Ayşe Nur",
          legalLastName: "Yılmaz",
          nationalId: TCKN,
          tcKimlikNo: TCKN,
        },
      });
      expect(JSON.stringify(redacted)).not.toContain(TCKN);
      expect(JSON.stringify(redacted)).not.toContain("Yılmaz");
    });
  });

  describe("kaynak taraması", () => {
    /**
     * `users`tan yasal alanları SEÇEN (`legalFirstName: true` …) dosyalar.
     * Yeni bir dosya buraya giriyorsa: o yanıt kimin? Başka bir üyeye ya da
     * herkese gidiyorsa seçim yanlıştır; admin/sahip yüzeyiyse listeye ekleyin.
     */
    const ALLOWED = [
      "src/modules/legal-identity/",
      // Admin rotaları kimliği görür (detay, liste filtresi, GİB, arşiv).
      "src/modules/admin/",
      // Hesap silme: arşive kopyalar, sonra NULL'lar.
      "src/modules/user/profile/user-profile.service.ts",
      // Banka TCKN'si üyenin kendi numarasıyla karşılaştırılır (yanıta girmez).
      "src/modules/user/seller/user-bank.service.ts",
    ];
    const SELECTS = /\b(legalFirstName|legalLastName|nationalId)\s*:\s*true\b/;

    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return walk(path);
        return path.endsWith(".ts") && !path.endsWith(".spec.ts") ? [path] : [];
      });

    it("yasal kimlik yalnız bilinen dosyalarda seçilir", () => {
      const root = apiAppRoot();
      const offenders = walk(join(root, "src"))
        .map((path) => relative(root, path).split("\\").join("/"))
        .filter((path) => !ALLOWED.some((allowed) => path.startsWith(allowed)))
        .filter((path) => SELECTS.test(readFileSync(join(root, path), "utf8")));
      expect(offenders).toEqual([]);
    });
  });
});
