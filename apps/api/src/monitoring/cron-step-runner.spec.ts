import {
  CronStepFailuresError,
  createCronStepRunner,
} from "./cron-step-runner";

/**
 * HIGH: cron `run*` metodları her hatayı yutup `{summary: "Hata: ..."}` döndürüyordu.
 * `runTrackedJob` yalnız fn THROW ederse Bull job'ını "failed" işaretler ve Sentry
 * Cron check-in'ini "error" yapar — dolayısıyla her PayTR çağrısının patladığı bir
 * payout turu bile BAŞARILI görünüyordu: attempts/backoff hiç devreye girmiyor,
 * otomatik alarm yok, tek iz log satırları.
 *
 * Doğru davranış: adımlar birbirini BLOKLAMAZ (izolasyon korunur) ama tur sonunda
 * en az bir adım başarısızsa iş başarısız sayılır.
 */
describe("createCronStepRunner", () => {
  const makeRunner = () => {
    const logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
    const logs: string[] = [];
    const runner = createCronStepRunner({
      logger: logger as any,
      log: (msg) => logs.push(msg),
    });
    return { runner, logger, logs };
  };

  it("hata veren adım diğerlerini engellemez", async () => {
    const { runner } = makeRunner();
    const second = jest.fn().mockResolvedValue(undefined);

    await runner.step("first", async () => {
      throw new Error("boom");
    });
    await runner.step("second", second);

    expect(second).toHaveBeenCalled();
  });

  it("başarısız adım sonrası assert THROW eder (Bull retry + Sentry alarmı devreye girsin)", async () => {
    const { runner } = makeRunner();

    await runner.step("first", async () => {
      throw new Error("boom");
    });

    expect(() => runner.assertAllStepsSucceeded()).toThrow(
      CronStepFailuresError,
    );
  });

  it("hata mesajı hangi adımların patladığını söyler", async () => {
    const { runner } = makeRunner();

    await runner.step("alpha", async () => {
      throw new Error("boom-a");
    });
    await runner.step("beta", async () => {
      throw new Error("boom-b");
    });

    try {
      runner.assertAllStepsSucceeded();
      throw new Error("assert should have thrown");
    } catch (error: any) {
      expect(error).toBeInstanceOf(CronStepFailuresError);
      expect(error.message).toContain("alpha");
      expect(error.message).toContain("beta");
      expect(error.failedSteps).toEqual(["alpha", "beta"]);
    }
  });

  it("tüm adımlar başarılıysa assert sessiz geçer", async () => {
    const { runner } = makeRunner();

    await runner.step("ok", async () => undefined);

    expect(() => runner.assertAllStepsSucceeded()).not.toThrow();
    expect(runner.failedSteps).toHaveLength(0);
  });

  it("her adım hem logger'a hem iş log'una yazar", async () => {
    const { runner, logger, logs } = makeRunner();

    await runner.step("ok", async () => undefined);
    await runner.step("bad", async () => {
      throw new Error("boom");
    });

    expect(logs.some((l) => l.includes("ok"))).toBe(true);
    expect(logs.some((l) => l.includes("bad"))).toBe(true);
    expect(logger.error).toHaveBeenCalled();
  });

  it("adım dönüş değeri çağırana geçirilir (sayaç toplamak için)", async () => {
    const { runner } = makeRunner();

    const value = await runner.step("counting", async () => 42);

    expect(value).toBe(42);
  });

  it("hata veren adım undefined döndürür", async () => {
    const { runner } = makeRunner();

    const value = await runner.step("bad", async () => {
      throw new Error("boom");
    });

    expect(value).toBeUndefined();
  });
});
