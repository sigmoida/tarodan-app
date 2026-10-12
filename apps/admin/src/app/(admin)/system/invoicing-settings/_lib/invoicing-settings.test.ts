import { describe, expect, it } from "vitest";
import type { useTranslations } from "next-intl";
import type {
  InvoicingFeeType,
  InvoicingSettingRow,
  InvoicingSettingsState,
} from "@/lib/api/invoicing-settings.types";
import {
  changedSettings,
  fieldName,
  invoicingSettingsSchema,
  normalizeValue,
  readInvoicingSettings,
  readinessItems,
  rowsInGroup,
  settingLabelKey,
  toFormValues,
  violationOf,
} from "./invoicing-settings";

type T = ReturnType<typeof useTranslations<never>>;

/** Anahtarı (ve varsa parametreleri) geri döndüren sahte t. */
const t = ((key: string, params?: Record<string, unknown>) =>
  params && Object.keys(params).length > 0
    ? `${key}:${JSON.stringify(params)}`
    : key) as unknown as T;

const row = (
  patch: Partial<InvoicingSettingRow> & Pick<InvoicingSettingRow, "key">,
): InvoicingSettingRow => ({
  value: "",
  default: "",
  valid: true,
  required: true,
  type: "string",
  group: "item",
  ...patch,
});

const RETAIL = row({ key: "netsis.cari.retailCode", group: "cari" });
const AUTO = row({
  key: "netsis.cari.autoCreateCorporate",
  group: "cari",
  type: "boolean",
  required: false,
  value: "true",
  default: "true",
});
const EARCHIVE = row({ key: "netsis.serial.earchive", group: "serial" });
const MEMBERSHIP = row({ key: "netsis.item.membership" });
const ROWS = [RETAIL, AUTO, EARCHIVE, MEMBERSHIP];

const FEES: InvoicingFeeType[] = [
  {
    type: "membership",
    settingKey: "netsis.item.membership",
    labelKey: "admin.finance.invoices.types.membership",
  },
];

describe("fieldName", () => {
  it("noktaları değiştirir ki react-hook-form iç içe yol saymasın", () => {
    expect(fieldName("netsis.serial.earchive")).toBe("netsis__serial__earchive");
  });
});

describe("readInvoicingSettings", () => {
  const state = { settings: ROWS } as unknown as InvoicingSettingsState;
  it("düz ve zarflı yanıtı açar, bozuk şekilde null döner", () => {
    expect(readInvoicingSettings(state)).toBe(state);
    expect(readInvoicingSettings({ data: state })).toBe(state);
    expect(readInvoicingSettings(undefined)).toBeNull();
    expect(readInvoicingSettings({ data: {} })).toBeNull();
  });
});

describe("toFormValues", () => {
  it("mantıksal ayar boolean, kalanı metin olur", () => {
    expect(toFormValues(ROWS)).toEqual({
      netsis__cari__retailCode: "",
      netsis__cari__autoCreateCorporate: true,
      netsis__serial__earchive: "",
      netsis__item__membership: "",
    });
  });
});

describe("normalizeValue / violationOf", () => {
  it("metni kırpar, seriyi büyütür", () => {
    expect(normalizeValue(EARCHIVE, " ear ")).toBe("EAR");
    expect(normalizeValue(RETAIL, " 120.01 ")).toBe("120.01");
    expect(normalizeValue(AUTO, "true")).toBe(true);
    expect(normalizeValue(AUTO, false)).toBe(false);
  });

  it("seri: tam 3 karakter A-Z0-9", () => {
    expect(violationOf(EARCHIVE, "EAR")).toBeNull();
    expect(violationOf(EARCHIVE, "EA")).toBe("serial");
    expect(violationOf(EARCHIVE, "EARX")).toBe("serial");
    expect(violationOf(EARCHIVE, "E-R")).toBe("serial");
  });

  it("cari en çok 15, hizmet kartı en çok 35 karakter", () => {
    expect(violationOf(RETAIL, "x".repeat(15))).toBeNull();
    expect(violationOf(RETAIL, "x".repeat(16))).toBe("cariMax");
    expect(violationOf(MEMBERSHIP, "x".repeat(35))).toBeNull();
    expect(violationOf(MEMBERSHIP, "x".repeat(36))).toBe("itemMax");
  });

  it("boş değer ve mantıksal ayar ihlal sayılmaz", () => {
    expect(violationOf(EARCHIVE, "")).toBeNull();
    expect(violationOf(AUTO, true)).toBeNull();
  });
});

describe("invoicingSettingsSchema", () => {
  const issues = (values: Record<string, string | boolean>) => {
    const result = invoicingSettingsSchema(t, ROWS).safeParse(values);
    return result.success
      ? {}
      : Object.fromEntries(
          result.error.issues.map((issue) => [issue.path[0], issue.message]),
        );
  };

  it("geçerli değerlerde hata yok (seri küçük harfle de geçer)", () => {
    expect(
      issues({
        ...toFormValues(ROWS),
        [fieldName(EARCHIVE.key)]: "ear",
        [fieldName(RETAIL.key)]: "120.01.001",
      }),
    ).toEqual({});
  });

  it("hata, ihlal eden alanın adı altında raporlanır", () => {
    expect(
      issues({
        ...toFormValues(ROWS),
        [fieldName(EARCHIVE.key)]: "TOOLONG",
        [fieldName(RETAIL.key)]: "x".repeat(16),
        [fieldName(MEMBERSHIP.key)]: "y".repeat(36),
      }),
    ).toEqual({
      netsis__serial__earchive: "admin.invoicingSettings.validation.serial",
      netsis__cari__retailCode:
        'admin.invoicingSettings.validation.cariMax:{"max":15}',
      netsis__item__membership:
        'admin.invoicingSettings.validation.itemMax:{"max":35}',
    });
  });
});

describe("changedSettings", () => {
  it("yalnız değişenleri normalize edilmiş halde gönderir", () => {
    const values = {
      ...toFormValues(ROWS),
      [fieldName(EARCHIVE.key)]: " ear ",
      [fieldName(AUTO.key)]: false,
    };
    expect(changedSettings(values, ROWS)).toEqual({
      "netsis.serial.earchive": "EAR",
      "netsis.cari.autoCreateCorporate": false,
    });
  });

  it("dokunulmamış form boş payload üretir", () => {
    expect(changedSettings(toFormValues(ROWS), ROWS)).toEqual({});
  });

  it("değeri temizlemek boş metin olarak gönderilir", () => {
    const filled = [{ ...RETAIL, value: "120.01" }];
    expect(
      changedSettings({ [fieldName(RETAIL.key)]: "  " }, filled),
    ).toEqual({ "netsis.cari.retailCode": "" });
  });
});

describe("kart yardımcıları", () => {
  it("rowsInGroup gruba göre süzer", () => {
    expect(rowsInGroup(ROWS, "cari")).toEqual([RETAIL, AUTO]);
    expect(rowsInGroup(ROWS, "serial")).toEqual([EARCHIVE]);
    expect(rowsInGroup(ROWS, "item")).toEqual([MEMBERSHIP]);
  });

  it("hizmet kartı etiketi fatura türü anahtarından, cari/seri kendi anahtarından gelir", () => {
    expect(settingLabelKey(MEMBERSHIP, FEES)).toBe(
      "admin.finance.invoices.types.membership",
    );
    expect(settingLabelKey(EARCHIVE, FEES)).toBe(
      "admin.invoicingSettings.fields.earchive.label",
    );
    expect(settingLabelKey(RETAIL, FEES)).toBe(
      "admin.invoicingSettings.fields.retailCode.label",
    );
  });

  it("readinessItems önce geçersizleri sonra eksikleri etiketleriyle listeler", () => {
    const items = readinessItems({
      settings: ROWS,
      feeTypes: FEES,
      readiness: {
        ready: false,
        missing: ["netsis.item.membership"],
        invalid: ["netsis.serial.earchive"],
      },
    });
    expect(items).toEqual([
      {
        key: "netsis.serial.earchive",
        status: "invalid",
        labelKey: "admin.invoicingSettings.fields.earchive.label",
      },
      {
        key: "netsis.item.membership",
        status: "missing",
        labelKey: "admin.finance.invoices.types.membership",
      },
    ]);
  });
});
