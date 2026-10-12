import { describe, expect, it } from "vitest";
import type { useTranslations } from "next-intl";
import {
  NETSIS_ACCOUNT_CODE_MAX,
  NETSIS_CARI_CODE_MAX,
  NETSIS_ITEM_CODE_MAX,
} from "@tarodan/types";
import type {
  InvoicingFeeType,
  InvoicingSettingRow,
  InvoicingSettingsState,
} from "@/lib/api/invoicing-settings.types";
import {
  SETTING_GROUPS,
  SYNC_STATUS_VARIANT,
  canRetrySync,
  truncateSyncError,
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
const ACC_ENABLED = row({
  key: "netsis.accounting.enabled",
  group: "account",
  type: "boolean",
  required: false,
  value: "false",
  default: "false",
});
const CLEARING = row({ key: "netsis.account.paytrClearing", group: "account" });
const ROWS = [RETAIL, AUTO, EARCHIVE, MEMBERSHIP, ACC_ENABLED, CLEARING];

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
      netsis__accounting__enabled: false,
      netsis__account__paytrClearing: "",
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

  it("cari ve hizmet kartı kodu ortak sınırlarla (@tarodan/types)", () => {
    expect(violationOf(RETAIL, "x".repeat(NETSIS_CARI_CODE_MAX))).toBeNull();
    expect(violationOf(RETAIL, "x".repeat(NETSIS_CARI_CODE_MAX + 1))).toBe(
      "cariMax",
    );
    expect(
      violationOf(MEMBERSHIP, "x".repeat(NETSIS_ITEM_CODE_MAX)),
    ).toBeNull();
    expect(
      violationOf(MEMBERSHIP, "x".repeat(NETSIS_ITEM_CODE_MAX + 1)),
    ).toBe("itemMax");
  });

  it("muhasebe hesap kodu ortak sınırla (@tarodan/types)", () => {
    expect(
      violationOf(CLEARING, "x".repeat(NETSIS_ACCOUNT_CODE_MAX)),
    ).toBeNull();
    expect(
      violationOf(CLEARING, "x".repeat(NETSIS_ACCOUNT_CODE_MAX + 1)),
    ).toBe("accountMax");
  });

  it("boş değer ve mantıksal ayar ihlal sayılmaz", () => {
    expect(violationOf(EARCHIVE, "")).toBeNull();
    expect(violationOf(AUTO, true)).toBeNull();
    expect(violationOf(ACC_ENABLED, true)).toBeNull();
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
        [fieldName(RETAIL.key)]: "x".repeat(NETSIS_CARI_CODE_MAX + 1),
        [fieldName(MEMBERSHIP.key)]: "y".repeat(NETSIS_ITEM_CODE_MAX + 1),
        [fieldName(CLEARING.key)]: "z".repeat(NETSIS_ACCOUNT_CODE_MAX + 1),
      }),
    ).toEqual({
      netsis__account__paytrClearing:
        `admin.invoicingSettings.validation.accountMax:{"max":${NETSIS_ACCOUNT_CODE_MAX}}`,
      netsis__serial__earchive: "admin.invoicingSettings.validation.serial",
      netsis__cari__retailCode:
        `admin.invoicingSettings.validation.cariMax:{"max":${NETSIS_CARI_CODE_MAX}}`,
      netsis__item__membership:
        `admin.invoicingSettings.validation.itemMax:{"max":${NETSIS_ITEM_CODE_MAX}}`,
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
    expect(rowsInGroup(ROWS, "account")).toEqual([ACC_ENABLED, CLEARING]);
  });

  it("SETTING_GROUPS hesap grubunu belge grubundan sonra çizer", () => {
    expect(SETTING_GROUPS).toEqual(["cari", "serial", "item", "document", "account"]);
  });

  it("muhasebe ayarının etiketi kendi son segmentinden gelir", () => {
    expect(settingLabelKey(CLEARING, FEES)).toBe(
      "admin.invoicingSettings.fields.paytrClearing.label",
    );
    expect(settingLabelKey(ACC_ENABLED, FEES)).toBe(
      "admin.invoicingSettings.fields.enabled.label",
    );
  });

  it("senkron durum rozetleri: synced başarılı, failed tehlike, kalanı çerçeveli", () => {
    expect(SYNC_STATUS_VARIANT).toEqual({
      synced: "success",
      pending: "outline",
      processing: "outline",
      failed: "danger",
      skipped: "outline",
    });
  });

  it("son hata uzunsa kısaltılır, boşsa null", () => {
    expect(truncateSyncError(null)).toBeNull();
    expect(truncateSyncError("kısa")).toBe("kısa");
    const long = "x".repeat(200);
    const out = truncateSyncError(long) as string;
    expect(out).toHaveLength(80);
    expect(out.endsWith("…")).toBe(true);
  });

  it("yalnız başarısız kayıt yeniden denenir", () => {
    expect(canRetrySync({ status: "failed" })).toBe(true);
    expect(canRetrySync({ status: "synced" })).toBe(false);
    expect(canRetrySync({ status: "skipped" })).toBe(false);
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
    const state = {
      settings: ROWS,
      feeTypes: FEES,
      readiness: {
        ready: false,
        missing: ["netsis.item.membership"],
        invalid: ["netsis.serial.earchive"],
      },
      accountingReadiness: {
        ready: false,
        missing: ["netsis.account.paytrClearing"],
        invalid: [],
      },
    };
    const items = readinessItems(state);
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

  it("readinessItems muhasebe bloğunu kendi listesinden okur", () => {
    expect(
      readinessItems(
        {
          settings: ROWS,
          feeTypes: FEES,
          readiness: { ready: true, missing: [], invalid: [] },
          accountingReadiness: {
            ready: false,
            missing: ["netsis.account.paytrClearing"],
            invalid: [],
          },
        },
        "accounting",
      ),
    ).toEqual([
      {
        key: "netsis.account.paytrClearing",
        status: "missing",
        labelKey: "admin.invoicingSettings.fields.paytrClearing.label",
      },
    ]);
  });
});
