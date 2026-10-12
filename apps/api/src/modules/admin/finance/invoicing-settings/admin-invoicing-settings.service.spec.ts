import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AdminRole } from "@prisma/client";
import { ROLES_KEY } from "../../../auth/decorators/roles.decorator";
import { PERMISSION_MAP } from "../../../auth/guards/roles.guard";
import { i18nMessage } from "../../../i18n/localized-message";
import { NETSIS_INVOICE_SETTING_KEYS } from "../../../invoicing/provider/netsis-invoice-settings";
import { NetsisInvoiceSettingsService } from "../../../invoicing/provider/netsis-invoice-settings.service";
import { NetsisRequestException } from "../../../netsis/http/netsis-error";
import { AdminInvoicingSettingsController } from "./admin-invoicing-settings.controller";
import { AdminInvoicingSettingsService } from "./admin-invoicing-settings.service";

const K = NETSIS_INVOICE_SETTING_KEYS;

describe("AdminInvoicingSettingsService", () => {
  const TX = { tag: "settings-transaction" };

  const makeService = (
    rows: Array<{ settingKey: string; settingValue: string }> = [],
  ) => {
    const tx = {
      platformSetting: {
        findMany: jest.fn().mockResolvedValue(rows),
        upsert: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      platformSetting: { findMany: jest.fn().mockResolvedValue(rows) },
      $transaction: jest.fn(async (fn: (t: unknown) => unknown) =>
        fn({ ...tx, ...TX }),
      ),
    };
    const netsis = { ping: jest.fn() };
    const audit = { createRequiredAuditLog: jest.fn().mockResolvedValue(undefined) };
    const domain = new NetsisInvoiceSettingsService(prisma as any);
    return {
      service: new AdminInvoicingSettingsService(
        domain,
        netsis as any,
        audit as any,
      ),
      netsis,
      audit,
      tx,
    };
  };

  it("get: ortam bilgisi, ayar satırları, hazırlık durumu ve ücret türleri", async () => {
    const { service } = makeService();
    const result = await service.get();

    expect(["elogo", "netsis"]).toContain(result.provider);
    expect(typeof result.netsisEnabled).toBe("boolean");
    expect(["stub", "live"]).toContain(result.netsisMode);
    expect(result.settings.map((r) => r.key)).toContain(K.retailCariCode);
    expect(result.readiness.ready).toBe(false);
    expect(result.readiness.missing).toContain(K.productSaleItem);

    // Her hizmet kartı ayarının ekranda bir etiketi var.
    const itemKeys = result.settings
      .filter((r) => r.group === "item")
      .map((r) => r.key);
    expect(result.feeTypes.map((f) => f.settingKey).sort()).toEqual(
      [...itemKeys].sort(),
    );
    expect(result.feeTypes).toContainEqual({
      type: "seller_commission",
      settingKey: "netsis.item.seller_commission",
      labelKey: "admin.finance.invoices.types.sellerCommission",
    });
    expect(result.feeTypes[0]).toMatchObject({
      type: "platform_sale",
      labelKey: "admin.finance.invoices.types.platformSale",
    });
    // Muhasebe senkronu aynı yanıtta, kendi kartı ve kendi hazırlığıyla.
    expect(
      result.settings.filter((r) => r.group === "account").map((r) => r.key),
    ).toEqual([
      "netsis.accounting.enabled",
      "netsis.account.paytrClearing",
      "netsis.account.mainBank",
      "netsis.account.pspFeeExpense",
    ]);
    expect(result.accountingReadiness).toEqual({
      ready: true,
      missing: [],
      invalid: [],
    });
  });

  it("update: ZORUNLU denetimi ayar işleminin içinde, önce/sonra ile yazar", async () => {
    const { service, audit } = makeService();

    await service.update("admin-1", { [K.einvoiceSerial]: "eft" });

    expect(audit.createRequiredAuditLog).toHaveBeenCalledWith(
      "admin-1",
      "netsis_invoice_settings_update",
      "NetsisInvoiceSettings",
      "netsis",
      { [K.einvoiceSerial]: "" },
      { [K.einvoiceSerial]: "EFT" },
      expect.objectContaining(TX),
    );
  });

  it("update: denetim yazılamazsa hata yükselir", async () => {
    const { service, audit } = makeService();
    audit.createRequiredAuditLog.mockRejectedValue(new Error("audit down"));
    await expect(
      service.update("admin-1", { [K.einvoiceSerial]: "EFT" }),
    ).rejects.toThrow("audit down");
  });

  it("update: bilinmeyen anahtar 400 ve denetim yazılmaz", async () => {
    const { service, audit } = makeService();
    await expect(
      service.update("admin-1", { "netsis.unknown": "x" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(audit.createRequiredAuditLog).not.toHaveBeenCalled();
  });

  describe("ping", () => {
    it("başarılı sonucu olduğu gibi döner", async () => {
      const { service, netsis } = makeService();
      netsis.ping.mockResolvedValue({
        mode: "stub",
        version: "1.0",
        authenticated: true,
      });
      await expect(service.ping("tr")).resolves.toEqual({
        ok: true,
        mode: "stub",
        version: "1.0",
        authenticated: true,
      });
    });

    it("kapalı entegrasyon (503) ok:false + istek dilinde mesaj olur", async () => {
      const { service, netsis } = makeService();
      netsis.ping.mockRejectedValue(
        new ServiceUnavailableException(i18nMessage("server.netsis.disabled")),
      );
      const result = await service.ping("en");
      expect(result.ok).toBe(false);
      expect(result.error).toBe("The Netsis integration is disabled");
    });

    it("sınıflanmış Netsis hatası mesajını yerelleştirir", async () => {
      const { service, netsis } = makeService();
      netsis.ping.mockRejectedValue(
        new NetsisRequestException("auth", 401, "invalid_grant"),
      );
      const result = await service.ping("tr");
      expect(result).toMatchObject({
        ok: false,
        error: "Netsis kimlik bilgilerini ya da oturumu reddetti",
      });
    });

    it("ham taşıma hatası sızmaz: sınıflanıp yerelleştirilir", async () => {
      const { service, netsis } = makeService();
      netsis.ping.mockRejectedValue(
        Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:7070"), {
          code: "ECONNREFUSED",
        }),
      );
      const result = await service.ping("tr");
      expect(result.ok).toBe(false);
      expect(result.error).toBe("Netsis sunucusuna ulaşılamadı");
      expect(JSON.stringify(result)).not.toContain("10.0.0.5");
    });
  });
});

describe("AdminInvoicingSettingsController — yetki", () => {
  const rolesOf = (method: keyof AdminInvoicingSettingsController) =>
    new Reflector().get<string[]>(
      ROLES_KEY,
      AdminInvoicingSettingsController.prototype[method],
    );

  it("üç uç da super_admin + admin", () => {
    for (const method of ["get", "update", "ping"] as const) {
      expect(rolesOf(method)).toEqual([AdminRole.super_admin, AdminRole.admin]);
    }
  });

  it("segment izin matrisinde settings iznine bağlı", () => {
    expect(PERMISSION_MAP.invoicing).toEqual(["settings"]);
  });

  it("ping ve yazma uçları kendi @Throttle sınırını taşır", () => {
    const proto = AdminInvoicingSettingsController.prototype;
    for (const method of ["update", "ping"] as const) {
      const keys = Reflect.getMetadataKeys(proto[method]);
      expect(keys.some((k) => String(k).includes("THROTTLER"))).toBe(true);
    }
  });
});
