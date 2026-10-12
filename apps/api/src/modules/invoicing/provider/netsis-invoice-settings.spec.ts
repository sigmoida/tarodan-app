import { FiscalInvoiceType } from "@prisma/client";
import {
  NETSIS_FEE_INVOICE_TYPES,
  NETSIS_INVOICE_SETTING_DEFINITIONS,
  NETSIS_INVOICE_SETTING_KEYS,
  loadNetsisInvoiceSettings,
  netsisInvoiceSettingsReadiness,
  netsisItemSettingKey,
  parseNetsisInvoiceSettings,
} from "./netsis-invoice-settings";

const K = NETSIS_INVOICE_SETTING_KEYS;

/** Tüm zorunlu ayarları dolduran harita. */
function completeValues(): Map<string, string> {
  const values = new Map<string, string>([
    [K.retailCariCode, "120.01.001"],
    [K.earchiveSerial, "EAR"],
    [K.einvoiceSerial, "EFT"],
    [K.productSaleItem, "URUN-SATIS"],
  ]);
  for (const type of NETSIS_FEE_INVOICE_TYPES) {
    values.set(netsisItemSettingKey(type), `HZM-${type}`.slice(0, 35));
  }
  return values;
}

describe("netsis-invoice-settings", () => {
  it("ücret türleri enum'dan türer: ürün satışı ve iade faturası hariç her tür", () => {
    const all = Object.values(FiscalInvoiceType);
    expect(NETSIS_FEE_INVOICE_TYPES).toHaveLength(all.length - 2);
    expect(NETSIS_FEE_INVOICE_TYPES).not.toContain("platform_sale");
    expect(NETSIS_FEE_INVOICE_TYPES).not.toContain("return_invoice");
    expect(NETSIS_FEE_INVOICE_TYPES).toEqual(
      expect.arrayContaining([
        "seller_commission",
        "buyer_service_fee",
        "seller_platform_fee",
        "buyer_shipping",
        "membership",
        "boost",
        "penalty",
        "trade_service_fee",
        "trade_shipping",
      ]),
    );
  });

  it("her ücret türünün kendi anahtarı, ürün satışının tek kartı var", () => {
    expect(netsisItemSettingKey("membership")).toBe("netsis.item.membership");
    expect(netsisItemSettingKey("platform_sale")).toBe(
      "netsis.item.productSale",
    );
    const keys = NETSIS_INVOICE_SETTING_DEFINITIONS.map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const type of NETSIS_FEE_INVOICE_TYPES) {
      expect(keys).toContain(netsisItemSettingKey(type));
    }
  });

  it("varsayılanlar: kodlar boş (yapılandırılmamış), otomatik cari açma açık", () => {
    const settings = parseNetsisInvoiceSettings(new Map());
    expect(settings.retailCariCode).toBe("");
    expect(settings.autoCreateCorporateCari).toBe(true);
    expect(settings.serials).toEqual({ EARCHIVE: "", EINVOICE: "" });
    expect(Object.values(settings.itemCodes).every((v) => v === "")).toBe(
      true,
    );
    const defaults = Object.fromEntries(
      NETSIS_INVOICE_SETTING_DEFINITIONS.map((row) => [row.key, row.value]),
    );
    expect(defaults[K.autoCreateCorporateCari]).toBe("true");
    expect(defaults[K.retailCariCode]).toBe("");
  });

  it("kodları kırpar; azami uzunluğu aşan kod yok sayılır", () => {
    const settings = parseNetsisInvoiceSettings(
      new Map([
        [K.retailCariCode, "  120.01.001  "],
        [K.productSaleItem, "X".repeat(36)],
        [netsisItemSettingKey("boost"), " BOOST "],
      ]),
    );
    expect(settings.retailCariCode).toBe("120.01.001");
    expect(settings.itemCodes.platform_sale).toBe("");
    expect(settings.itemCodes.boost).toBe("BOOST");
    expect(
      parseNetsisInvoiceSettings(new Map([[K.retailCariCode, "C".repeat(16)]]))
        .retailCariCode,
    ).toBe("");
  });

  it("seri 3 karakter olmalı; küçük harf büyütülür, bozuk seri boş sayılır", () => {
    const settings = parseNetsisInvoiceSettings(
      new Map([
        [K.earchiveSerial, " ear "],
        [K.einvoiceSerial, "EFAT"],
      ]),
    );
    expect(settings.serials).toEqual({ EARCHIVE: "EAR", EINVOICE: "" });
  });

  it.each([
    ["false", false],
    ["0", false],
    ["TRUE", true],
    ["bozuk", true],
  ])("otomatik cari açma '%s' → %s", (raw, expected) => {
    expect(
      parseNetsisInvoiceSettings(new Map([[K.autoCreateCorporateCari, raw]]))
        .autoCreateCorporateCari,
    ).toBe(expected);
  });

  describe("netsisInvoiceSettingsReadiness", () => {
    it("hepsi doluysa eksik yok", () => {
      expect(
        netsisInvoiceSettingsReadiness(
          parseNetsisInvoiceSettings(completeValues()),
        ),
      ).toEqual([]);
    });

    it("eksik ve geçersiz anahtarları listeler", () => {
      const values = completeValues();
      values.delete(K.retailCariCode);
      values.set(K.einvoiceSerial, "TOO-LONG");
      values.set(netsisItemSettingKey("penalty"), "   ");
      expect(
        netsisInvoiceSettingsReadiness(parseNetsisInvoiceSettings(values)),
      ).toEqual([
        K.retailCariCode,
        K.einvoiceSerial,
        netsisItemSettingKey("penalty"),
      ]);
    });

    it("hiç ayar yoksa otomatik cari açma DIŞINDA her anahtar eksik", () => {
      const missing = netsisInvoiceSettingsReadiness(
        parseNetsisInvoiceSettings(new Map()),
      );
      expect(missing).toHaveLength(
        NETSIS_INVOICE_SETTING_DEFINITIONS.length - 1,
      );
      expect(missing).not.toContain(K.autoCreateCorporateCari);
    });
  });

  it("ayarları tek sorguda yalnız bilinen anahtarlarla okur", async () => {
    const findMany = jest.fn(async () => [
      { settingKey: K.retailCariCode, settingValue: "PERAKENDE" },
    ]);
    const settings = await loadNetsisInvoiceSettings({
      platformSetting: { findMany },
    } as unknown as Parameters<typeof loadNetsisInvoiceSettings>[0]);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        settingKey: {
          in: NETSIS_INVOICE_SETTING_DEFINITIONS.map((row) => row.key),
        },
      },
      select: { settingKey: true, settingValue: true },
    });
    expect(settings.retailCariCode).toBe("PERAKENDE");
  });
});
