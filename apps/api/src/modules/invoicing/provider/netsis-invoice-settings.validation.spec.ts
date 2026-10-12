import {
  NETSIS_FEE_INVOICE_TYPES,
  NETSIS_INVOICE_SETTING_DEFINITIONS,
  NETSIS_INVOICE_SETTING_KEYS,
  netsisItemSettingKey,
} from "./netsis-invoice-settings";
import {
  NETSIS_ACCOUNTING_SETTING_DEFINITIONS,
  NETSIS_ACCOUNTING_SETTING_KEYS,
} from "../accounting/netsis-accounting-settings";
import {
  NETSIS_SETTING_DEFINITIONS,
  checkNetsisSettingValue,
  describeNetsisSettings,
  netsisSettingGroup,
} from "./netsis-invoice-settings.validation";

const K = NETSIS_INVOICE_SETTING_KEYS;
const A = NETSIS_ACCOUNTING_SETTING_KEYS;

function completeStored(): Map<string, string> {
  const stored = new Map<string, string>([
    [K.retailCariCode, "120.01.001"],
    [K.earchiveSerial, "EAR"],
    [K.einvoiceSerial, "EFT"],
    [K.productSaleItem, "URUN"],
  ]);
  for (const type of NETSIS_FEE_INVOICE_TYPES) {
    stored.set(netsisItemSettingKey(type), `HZM-${type}`.slice(0, 35));
  }
  return stored;
}

describe("checkNetsisSettingValue", () => {
  it("bilinmeyen anahtarı reddeder", () => {
    expect(checkNetsisSettingValue("netsis.nope", "x")).toEqual({
      ok: false,
      reason: "unknown",
    });
  });

  it("seri: 3 karakter A-Z0-9, küçük harf büyütülür, kırpılır", () => {
    expect(checkNetsisSettingValue(K.earchiveSerial, " ear ")).toEqual({
      ok: true,
      value: "EAR",
    });
    for (const bad of ["EA", "EARX", "E-R", "ÇAR"]) {
      expect(checkNetsisSettingValue(K.earchiveSerial, bad)).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
  });

  it("cari kodu: kırpılır, 15 karakteri aşan reddedilir", () => {
    expect(checkNetsisSettingValue(K.retailCariCode, "  120.01 ")).toEqual({
      ok: true,
      value: "120.01",
    });
    expect(checkNetsisSettingValue(K.retailCariCode, "x".repeat(16))).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("hizmet kartı: 35 karakter sınırı, büyük/küçük harf korunur", () => {
    const key = netsisItemSettingKey("membership");
    expect(checkNetsisSettingValue(key, "Uyelik-1")).toEqual({
      ok: true,
      value: "Uyelik-1",
    });
    expect(checkNetsisSettingValue(key, "x".repeat(36))).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("boş metin geçerlidir (ayarı temizler)", () => {
    expect(checkNetsisSettingValue(K.einvoiceSerial, "   ")).toEqual({
      ok: true,
      value: "",
    });
  });

  it("metin alanına metin dışı değer tip hatasıdır", () => {
    expect(checkNetsisSettingValue(K.retailCariCode, 5)).toEqual({
      ok: false,
      reason: "type",
    });
  });

  it("mantıksal ayar: boolean ve 'true'/'false' metni kabul, diğeri tip hatası", () => {
    const key = K.autoCreateCorporateCari;
    expect(checkNetsisSettingValue(key, false)).toEqual({
      ok: true,
      value: "false",
    });
    expect(checkNetsisSettingValue(key, " TRUE ")).toEqual({
      ok: true,
      value: "true",
    });
    expect(checkNetsisSettingValue(key, "yes")).toEqual({
      ok: false,
      reason: "type",
    });
    expect(checkNetsisSettingValue(key, 1)).toEqual({
      ok: false,
      reason: "type",
    });
  });
});

describe("netsisSettingGroup", () => {
  it("anahtar önekinden kartı seçer", () => {
    expect(netsisSettingGroup(K.retailCariCode)).toBe("cari");
    expect(netsisSettingGroup(K.autoCreateCorporateCari)).toBe("cari");
    expect(netsisSettingGroup(K.earchiveSerial)).toBe("serial");
    expect(netsisSettingGroup(K.productSaleItem)).toBe("item");
    expect(netsisSettingGroup(netsisItemSettingKey("boost"))).toBe("item");
  });

  it("muhasebe senkronu anahtarları kendi kartında (account)", () => {
    expect(netsisSettingGroup(A.enabled)).toBe("account");
    expect(netsisSettingGroup(A.paytrClearing)).toBe("account");
    expect(netsisSettingGroup(A.mainBank)).toBe("account");
    expect(netsisSettingGroup(A.pspFeeExpense)).toBe("account");
  });
});

describe("describeNetsisSettings", () => {
  it("her tanımlı ayar için bir satır döner; boş harita her zorunluyu eksik sayar", () => {
    const { settings, readiness } = describeNetsisSettings(new Map());
    // Önce fatura ayarları, sonra muhasebe senkronu ayarları — tek liste.
    expect(settings.map((row) => row.key)).toEqual([
      ...NETSIS_INVOICE_SETTING_DEFINITIONS.map((row) => row.key),
      ...NETSIS_ACCOUNTING_SETTING_DEFINITIONS.map((row) => row.key),
    ]);
    expect(NETSIS_SETTING_DEFINITIONS.map((row) => row.key)).toEqual(
      settings.map((row) => row.key),
    );
    expect(readiness.ready).toBe(false);
    expect(readiness.invalid).toEqual([]);
    expect(readiness.missing).toEqual(
      expect.arrayContaining([
        K.retailCariCode,
        K.earchiveSerial,
        K.einvoiceSerial,
        K.productSaleItem,
        ...NETSIS_FEE_INVOICE_TYPES.map(netsisItemSettingKey),
      ]),
    );
    expect(readiness.missing).not.toContain(K.autoCreateCorporateCari);
  });

  it("mantıksal ayar zorunlu değildir ve varsayılanı döner", () => {
    const row = describeNetsisSettings(new Map()).settings.find(
      (r) => r.key === K.autoCreateCorporateCari,
    );
    expect(row).toMatchObject({
      value: "true",
      default: "true",
      required: false,
      type: "boolean",
      valid: true,
      group: "cari",
    });
  });

  it("hepsi dolu ve geçerliyse hazırdır", () => {
    const { readiness } = describeNetsisSettings(completeStored());
    expect(readiness).toEqual({ ready: true, missing: [], invalid: [] });
  });

  it("dolu ama geçersiz değer 'invalid' olur, 'missing' olmaz", () => {
    const stored = completeStored();
    stored.set(K.earchiveSerial, "TOOLONG");
    const { settings, readiness } = describeNetsisSettings(stored);
    expect(readiness.ready).toBe(false);
    expect(readiness.invalid).toEqual([K.earchiveSerial]);
    expect(readiness.missing).toEqual([]);
    expect(settings.find((r) => r.key === K.earchiveSerial)?.valid).toBe(false);
  });
});

describe("muhasebe senkronu ayarları (account kartı)", () => {
  it("PUT: hesap kodu kırpılır, 30 karakteri aşan reddedilir, boş temizler", () => {
    expect(checkNetsisSettingValue(A.mainBank, "  102.01.001 ")).toEqual({
      ok: true,
      value: "102.01.001",
    });
    expect(checkNetsisSettingValue(A.mainBank, "x".repeat(31))).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(checkNetsisSettingValue(A.pspFeeExpense, " ")).toEqual({
      ok: true,
      value: "",
    });
  });

  it("PUT: ana anahtar mantıksaldır", () => {
    expect(checkNetsisSettingValue(A.enabled, true)).toEqual({
      ok: true,
      value: "true",
    });
    expect(checkNetsisSettingValue(A.enabled, "evet")).toEqual({
      ok: false,
      reason: "type",
    });
  });

  it("kapalıyken muhasebe hazırdır ve hiçbir hesap zorunlu değildir", () => {
    const { settings, accountingReadiness } = describeNetsisSettings(new Map());
    expect(accountingReadiness).toEqual({
      ready: true,
      missing: [],
      invalid: [],
    });
    const accountRows = settings.filter((row) => row.group === "account");
    expect(accountRows.map((row) => row.key)).toEqual(
      NETSIS_ACCOUNTING_SETTING_DEFINITIONS.map((row) => row.key),
    );
    expect(accountRows.every((row) => !row.required)).toBe(true);
    expect(accountRows.find((row) => row.key === A.enabled)).toMatchObject({
      value: "false",
      type: "boolean",
    });
  });

  it("açıkken ara hesap ve banka zorunlu; gider hesabı opsiyonel", () => {
    const { settings, accountingReadiness } = describeNetsisSettings(
      new Map([[A.enabled, "true"]]),
    );
    expect(accountingReadiness.ready).toBe(false);
    expect(accountingReadiness.missing).toEqual([
      A.paytrClearing,
      A.mainBank,
    ]);
    expect(settings.find((r) => r.key === A.pspFeeExpense)?.required).toBe(
      false,
    );
  });

  it("muhasebe eksiği belge kesim hazırlığını BOZMAZ", () => {
    const stored = completeStored();
    stored.set(A.enabled, "true");
    const { readiness, accountingReadiness } = describeNetsisSettings(stored);
    expect(readiness).toEqual({ ready: true, missing: [], invalid: [] });
    expect(accountingReadiness.ready).toBe(false);
  });

  it("geçersiz kayıtlı hesap kodu 'invalid' görünür", () => {
    const { accountingReadiness } = describeNetsisSettings(
      new Map([
        [A.enabled, "true"],
        [A.paytrClearing, "P".repeat(31)],
        [A.mainBank, "102.01"],
      ]),
    );
    expect(accountingReadiness).toEqual({
      ready: false,
      missing: [],
      invalid: [A.paytrClearing],
    });
  });

  it("hepsi doluysa muhasebe hazır", () => {
    const { accountingReadiness } = describeNetsisSettings(
      new Map([
        [A.enabled, "true"],
        [A.paytrClearing, "102.99"],
        [A.mainBank, "102.01"],
      ]),
    );
    expect(accountingReadiness).toEqual({
      ready: true,
      missing: [],
      invalid: [],
    });
  });
});
