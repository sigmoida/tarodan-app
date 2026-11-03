import { BadRequestException } from "@nestjs/common";
import { InstallmentSettingsService } from "./installment-settings.service";

type Row = { settingKey: string; settingValue: string };

function makeDb(rows: Row[] = []) {
  const store = new Map(rows.map((r) => [r.settingKey, r.settingValue]));
  const platformSetting = {
    findMany: jest.fn(async () =>
      [...store.entries()].map(([settingKey, settingValue]) => ({
        settingKey,
        settingValue,
      })),
    ),
    findUnique: jest.fn(async ({ where }: { where: { settingKey: string } }) =>
      store.has(where.settingKey)
        ? { settingValue: store.get(where.settingKey) }
        : null,
    ),
    upsert: jest.fn(
      async (args: {
        where: { settingKey: string };
        create: { settingValue: string };
        update: { settingValue: string };
      }) => {
        const key = args.where.settingKey;
        store.set(
          key,
          store.has(key) ? args.update.settingValue : args.create.settingValue,
        );
        return { id: `id-${key}` };
      },
    ),
  };
  return { platformSetting, store };
}

describe("InstallmentSettingsService", () => {
  it("reads a missing row as the default: off, 500 TL", async () => {
    const db = makeDb();
    const service = new InstallmentSettingsService(db as never);
    const settings = await service.read();
    expect(settings.enabled).toBe(false);
    expect(settings.minAmount.toString()).toBe("500");
  });

  it.each`
    enabled     | min          | expectedEnabled | expectedMin
    ${"true"}   | ${"750.50"}  | ${true}         | ${"750.5"}
    ${" TRUE "} | ${"0"}       | ${true}         | ${"0"}
    ${"yes"}    | ${"-1"}      | ${false}        | ${"500"}
    ${"false"}  | ${"1.234"}   | ${false}        | ${"500"}
    ${""}       | ${"abc"}     | ${false}        | ${"500"}
    ${"true"}   | ${"1000001"} | ${true}         | ${"500"}
  `(
    "reads enabled=$enabled min=$min as $expectedEnabled / $expectedMin",
    async ({ enabled, min, expectedEnabled, expectedMin }) => {
      const db = makeDb([
        { settingKey: "installments_enabled", settingValue: enabled },
        { settingKey: "installment_min_amount", settingValue: min },
      ]);
      const settings = await new InstallmentSettingsService(db as never).read();
      expect(settings.enabled).toBe(expectedEnabled);
      expect(settings.minAmount.toString()).toBe(expectedMin);
    },
  );

  it("writes only the values that change and reports them for the audit", async () => {
    const db = makeDb([
      { settingKey: "installments_enabled", settingValue: "false" },
    ]);
    const service = new InstallmentSettingsService(db as never);
    const changes = await service.update(
      db as never,
      { enabled: true, minAmount: 500 },
      "admin-1",
    );
    // 500 is already the default: nothing to write for it.
    expect(changes).toEqual([
      {
        settingKey: "installments_enabled",
        settingId: "id-installments_enabled",
        before: "false",
        after: "true",
      },
    ]);
    expect(db.platformSetting.upsert).toHaveBeenCalledTimes(1);
    expect(db.platformSetting.upsert.mock.calls[0][0]).toMatchObject({
      update: { settingValue: "true", updatedBy: "admin-1" },
    });

    const second = await service.update(
      db as never,
      { minAmount: 750 },
      "admin-1",
    );
    expect(second).toEqual([
      {
        settingKey: "installment_min_amount",
        settingId: "id-installment_min_amount",
        before: null,
        after: "750.00",
      },
    ]);
  });

  it("writes nothing for an empty patch", async () => {
    const db = makeDb();
    const service = new InstallmentSettingsService(db as never);
    expect(await service.update(db as never, {}, "admin-1")).toEqual([]);
    expect(db.platformSetting.upsert).not.toHaveBeenCalled();
  });

  it.each`
    minAmount       | key
    ${-1}           | ${"server.admin.installments.minAmount.outOfRange"}
    ${1_000_000.01} | ${"server.admin.installments.minAmount.outOfRange"}
    ${10.005}       | ${"server.admin.installments.minAmount.tooManyDecimals"}
    ${Number.NaN}   | ${"server.admin.installments.minAmount.notANumber"}
  `(
    "refuses minAmount $minAmount with $key and writes nothing",
    async ({ minAmount, key }) => {
      const db = makeDb();
      const service = new InstallmentSettingsService(db as never);
      const call = service.update(
        db as never,
        { enabled: true, minAmount },
        "admin-1",
      );
      await expect(call).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.update(db as never, { minAmount }, "admin-1"),
      ).rejects.toMatchObject({ response: { i18nKey: key } });
      expect(db.platformSetting.upsert).not.toHaveBeenCalled();
    },
  );
});
