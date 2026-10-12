import {
  NETSIS_ACCOUNTING_SETTING_DEFINITIONS,
  NETSIS_ACCOUNTING_SETTING_KEYS,
  NETSIS_ACCOUNT_CODE_MAX_LENGTH,
  isValidNetsisAccountingValue,
  loadNetsisAccountingSettings,
  netsisAccountingActive,
  netsisAccountingSettingsReadiness,
  parseNetsisAccountingSettings,
} from "./netsis-accounting-settings";
import { NETSIS_INVOICE_SETTING_DEFINITIONS } from "../provider/netsis-invoice-settings";

const A = NETSIS_ACCOUNTING_SETTING_KEYS;

describe("netsis-accounting-settings", () => {
  it("varsayılanlar: senkron KAPALI, hesap kodları boş", () => {
    const settings = parseNetsisAccountingSettings(new Map());
    expect(settings).toEqual({
      enabled: false,
      accounts: { paytrClearing: "", mainBank: "", pspFeeExpense: "" },
    });
    const defaults = Object.fromEntries(
      NETSIS_ACCOUNTING_SETTING_DEFINITIONS.map((row) => [row.key, row.value]),
    );
    expect(defaults).toEqual({
      [A.enabled]: "false",
      [A.paytrClearing]: "",
      [A.mainBank]: "",
      [A.pspFeeExpense]: "",
    });
  });

  it("anahtarlar fatura ayarlarıyla çakışmaz (tek ekran, tek PUT)", () => {
    const invoiceKeys = new Set(
      NETSIS_INVOICE_SETTING_DEFINITIONS.map((row) => row.key),
    );
    for (const row of NETSIS_ACCOUNTING_SETTING_DEFINITIONS) {
      expect(invoiceKeys.has(row.key)).toBe(false);
    }
  });

  it("hesap kodlarını kırpar; azami uzunluğu aşan kod yok sayılır", () => {
    const settings = parseNetsisAccountingSettings(
      new Map([
        [A.enabled, " TRUE "],
        [A.paytrClearing, "  102.99.001  "],
        [A.mainBank, "B".repeat(NETSIS_ACCOUNT_CODE_MAX_LENGTH + 1)],
      ]),
    );
    expect(settings.enabled).toBe(true);
    expect(settings.accounts.paytrClearing).toBe("102.99.001");
    expect(settings.accounts.mainBank).toBe("");
  });

  it.each([
    ["false", false],
    ["0", false],
    ["on", true],
    ["bozuk", false],
  ])("ana anahtar '%s' → %s", (raw, expected) => {
    expect(
      parseNetsisAccountingSettings(new Map([[A.enabled, raw]])).enabled,
    ).toBe(expected);
  });

  describe("netsisAccountingSettingsReadiness", () => {
    it("kapalıyken hiçbir şey durdurmaz", () => {
      expect(
        netsisAccountingSettingsReadiness(parseNetsisAccountingSettings(new Map())),
      ).toEqual([]);
    });

    it("açıkken ara hesap ve banka zorunlu, gider hesabı değil", () => {
      expect(
        netsisAccountingSettingsReadiness(
          parseNetsisAccountingSettings(new Map([[A.enabled, "true"]])),
        ),
      ).toEqual([A.paytrClearing, A.mainBank]);
      expect(
        netsisAccountingSettingsReadiness(
          parseNetsisAccountingSettings(
            new Map([
              [A.enabled, "true"],
              [A.paytrClearing, "102.99"],
              [A.mainBank, "102.01"],
            ]),
          ),
        ),
      ).toEqual([]);
    });
  });

  it("senkron yalnız açık VE fatura sağlayıcısı Netsis iken yazar", () => {
    expect(netsisAccountingActive({ enabled: true }, "netsis")).toBe(true);
    expect(netsisAccountingActive({ enabled: true }, "elogo")).toBe(false);
    expect(netsisAccountingActive({ enabled: false }, "netsis")).toBe(false);
  });

  it("isValidNetsisAccountingValue ayrıştırıcının kuralını kullanır", () => {
    expect(isValidNetsisAccountingValue(A.mainBank, "102.01")).toBe(true);
    expect(
      isValidNetsisAccountingValue(
        A.mainBank,
        "x".repeat(NETSIS_ACCOUNT_CODE_MAX_LENGTH + 1),
      ),
    ).toBe(false);
    expect(isValidNetsisAccountingValue(A.enabled, "true")).toBe(true);
  });

  it("loadNetsisAccountingSettings TEK sorguda yalnız kendi anahtarlarını okur", async () => {
    const findMany = jest.fn().mockResolvedValue([
      { settingKey: A.enabled, settingValue: "true" },
      { settingKey: A.mainBank, settingValue: "102.01" },
    ]);
    const settings = await loadNetsisAccountingSettings({
      platformSetting: { findMany },
    } as never);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0].where.settingKey.in).toEqual(
      NETSIS_ACCOUNTING_SETTING_DEFINITIONS.map((row) => row.key),
    );
    expect(settings.enabled).toBe(true);
    expect(settings.accounts.mainBank).toBe("102.01");
  });
});
