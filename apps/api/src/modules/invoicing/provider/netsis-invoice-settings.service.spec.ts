import { BadRequestException } from "@nestjs/common";
import { NETSIS_ACCOUNTING_SETTING_KEYS } from "../accounting/netsis-accounting-settings";
import { NETSIS_INVOICE_SETTING_KEYS } from "./netsis-invoice-settings";
import { NetsisInvoiceSettingsService } from "./netsis-invoice-settings.service";

const K = NETSIS_INVOICE_SETTING_KEYS;
const A = NETSIS_ACCOUNTING_SETTING_KEYS;

describe("NetsisInvoiceSettingsService", () => {
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
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    return { service: new NetsisInvoiceSettingsService(prisma as any), prisma, tx };
  };

  it("state: kayıtlı satırları okuyup özetler", async () => {
    const { service } = makeService([
      { settingKey: K.earchiveSerial, settingValue: "EAR" },
    ]);
    const state = await service.state();
    expect(state.settings.find((r) => r.key === K.earchiveSerial)?.value).toBe(
      "EAR",
    );
    expect(state.readiness.ready).toBe(false);
  });

  it("apply: değerleri normalize edip tek işlemde upsert eder, önce/sonra döner", async () => {
    const { service, prisma, tx } = makeService([
      { settingKey: K.earchiveSerial, settingValue: "OLD" },
    ]);
    const afterWrite = jest.fn().mockResolvedValue(undefined);

    const change = await service.apply(
      {
        [K.earchiveSerial]: " new ",
        [K.retailCariCode]: " 120.01 ",
        [K.autoCreateCorporateCari]: false,
      },
      "admin-1",
      afterWrite,
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.platformSetting.upsert).toHaveBeenCalledTimes(3);
    expect(tx.platformSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { settingKey: K.earchiveSerial },
        update: { settingValue: "NEW", updatedBy: "admin-1" },
      }),
    );
    expect(tx.platformSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { settingKey: K.autoCreateCorporateCari },
        create: expect.objectContaining({
          settingValue: "false",
          settingType: "boolean",
        }),
      }),
    );
    expect(change.before).toEqual({
      [K.earchiveSerial]: "OLD",
      [K.retailCariCode]: "",
      [K.autoCreateCorporateCari]: "true",
    });
    expect(change.after).toEqual({
      [K.earchiveSerial]: "NEW",
      [K.retailCariCode]: "120.01",
      [K.autoCreateCorporateCari]: "false",
    });
    // Denetim yazım işleminin istemcisiyle çağrılır.
    expect(afterWrite).toHaveBeenCalledWith(tx, change);
  });

  it("apply: değişmeyen değeri yazmaz, hiç değişiklik yoksa denetim çağrılmaz", async () => {
    const { service, tx } = makeService([
      { settingKey: K.earchiveSerial, settingValue: "EAR" },
    ]);
    const afterWrite = jest.fn();

    const change = await service.apply(
      { [K.earchiveSerial]: "ear" },
      "admin-1",
      afterWrite,
    );

    expect(tx.platformSetting.upsert).not.toHaveBeenCalled();
    expect(afterWrite).not.toHaveBeenCalled();
    expect(change).toEqual({ before: {}, after: {} });
  });

  it("apply: denetim fırlatırsa hata yükselir (işlem geri alınır)", async () => {
    const { service } = makeService();
    await expect(
      service.apply({ [K.einvoiceSerial]: "EFT" }, "admin-1", async () => {
        throw new Error("audit down");
      }),
    ).rejects.toThrow("audit down");
  });

  it("apply: bilinmeyen anahtar 400 ve hiçbir şey yazılmaz", async () => {
    const { service, prisma } = makeService();
    await expect(
      service.apply(
        { [K.einvoiceSerial]: "EFT", "netsis.unknown": "x" },
        "admin-1",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("apply: geçersiz değer ve tip hatası 400", async () => {
    const { service, prisma } = makeService();
    await expect(
      service.apply({ [K.earchiveSerial]: "TOOLONG" }, "admin-1"),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.apply({ [K.autoCreateCorporateCari]: "maybe" }, "admin-1"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("apply: boş gövde 400", async () => {
    const { service } = makeService();
    await expect(service.apply({}, "admin-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("state: muhasebe senkronu hazırlığını ayrı döner", async () => {
    const { service } = makeService([
      { settingKey: A.enabled, settingValue: "true" },
    ]);
    const state = await service.state();
    expect(state.accountingReadiness).toEqual({
      ready: false,
      missing: [A.paytrClearing, A.mainBank],
      invalid: [],
    });
    expect(state.settings.some((row) => row.key === A.mainBank)).toBe(true);
  });

  it("apply: muhasebe anahtarlarını da aynı işlemde yazar", async () => {
    const { service, tx } = makeService();
    const change = await service.apply(
      { [A.enabled]: true, [A.mainBank]: " 102.01 " },
      "admin-1",
    );
    expect(tx.platformSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { settingKey: A.enabled },
        create: expect.objectContaining({
          settingValue: "true",
          settingType: "boolean",
        }),
      }),
    );
    expect(change.after).toEqual({
      [A.enabled]: "true",
      [A.mainBank]: "102.01",
    });
    expect(change.before).toEqual({ [A.enabled]: "false", [A.mainBank]: "" });
  });
});
