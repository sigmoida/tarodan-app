import {
  AdminTestToolsService,
  computeTargetDate,
  tradeDeadlineField,
} from "./admin-test-tools.service";
import { CRON_CATALOG } from "../../workers/cron-catalog";

/**
 * Cron tetikleme artık KUYRUK üzerinden: servis doğrudan iş mantığı çağırmaz,
 * `scheduled` kuyruğuna Bull job adıyla fiş atar. Böylece manuel koşum da
 * zamanlanmış koşumla aynı yoldan geçer (worker process'i, runTrackedJob
 * izlemesi, aynı-ad sıralı işleme = çakışma koruması). Liste tek kaynaktan
 * (CRON_CATALOG) türetilir; toplu gönderim yapan işler triggerable=false ile
 * bilinçli olarak dışarıda tutulur.
 */
describe("AdminTestToolsService cron tetikleme (kuyruk üzerinden)", () => {
  const makeService = () => {
    const queue = { add: jest.fn().mockResolvedValue({ id: 42 }) };
    const service = new AdminTestToolsService({} as any, queue as any);
    return { service, queue };
  };

  it("listCrons yalnız triggerable katalog girdilerini döner", () => {
    const { service } = makeService();
    const keys = service.listCrons().map((c) => c.key);
    const expected = CRON_CATALOG.filter((c) => c.triggerable).map(
      (c) => c.key,
    );
    expect(keys).toEqual(expected);
    expect(keys).toContain("payment-expired");
    expect(keys).not.toContain("marketing-weekly");
  });

  it("runCron kuyruğa Bull job adıyla fiş atar (doğrudan servis çağrısı yok)", async () => {
    const { service, queue } = makeService();
    const res = await service.runCron("payment-expired");
    expect(queue.add).toHaveBeenCalledWith(
      "payment-expired",
      {},
      { removeOnComplete: 50, removeOnFail: 50 },
    );
    expect(res).toMatchObject({ key: "payment-expired", jobId: "42" });
  });

  it("bilinmeyen anahtar 400 verir", async () => {
    const { service, queue } = makeService();
    await expect(service.runCron("boyle-bir-is-yok")).rejects.toThrow(
      "Bilinmeyen cron",
    );
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("toplu gönderim yapan (triggerable=false) iş elle TETİKLENEMEZ", async () => {
    // Anahtar gerçek ve işleyicisi var — ama mükerrer e-posta riski yüzünden
    // elle koşturmak bilinçli olarak yasak. Whitelist listCrons ile aynıdır.
    const { service, queue } = makeService();
    await expect(service.runCron("marketing-weekly")).rejects.toThrow();
    expect(queue.add).not.toHaveBeenCalled();
  });

  // ── cron-status: UI "kuyruğa alındı"da kalmasın, fişin akıbetini görsün ────
  const makeStatusService = (job: unknown) => {
    const queue = {
      add: jest.fn(),
      getJob: jest.fn().mockResolvedValue(job),
    };
    const service = new AdminTestToolsService({} as any, queue as any);
    return { service, queue };
  };

  it("cron-status: fiş bulunamazsa not_found döner (removeOnComplete temizlemiş olabilir)", async () => {
    const { service } = makeStatusService(null);
    const res = await service.getCronStatus("42");
    expect(res).toEqual({
      jobId: "42",
      state: "not_found",
      summary: null,
      failedReason: null,
    });
  });

  it("cron-status: tamamlanan fişte runTrackedJob özetini döner", async () => {
    const { service } = makeStatusService({
      getState: jest.fn().mockResolvedValue("completed"),
      returnvalue: { ok: true, summary: "3 hold serbest · 2 payout" },
      failedReason: undefined,
    });
    const res = await service.getCronStatus("42");
    expect(res).toMatchObject({
      state: "completed",
      summary: "3 hold serbest · 2 payout",
      failedReason: null,
    });
  });

  it("cron-status: düşen fişte failedReason döner", async () => {
    const { service } = makeStatusService({
      getState: jest.fn().mockResolvedValue("failed"),
      returnvalue: null,
      failedReason: "PayTR timeout",
    });
    const res = await service.getCronStatus("42");
    expect(res).toMatchObject({
      state: "failed",
      summary: null,
      failedReason: "PayTR timeout",
    });
  });

  it("cron-status: boş jobId 400 verir", async () => {
    const { service } = makeStatusService(null);
    await expect(service.getCronStatus("  ")).rejects.toThrow();
  });
});

/**
 * Zaman makinesi saf mantığı: aksiyon→tarih hesabı ve takas durum→deadline eşlemesi.
 */
describe("AdminTestTools saf mantık", () => {
  const now = 1_750_000_000_000; // sabit referans

  describe("computeTargetDate", () => {
    it("expire_now → now", () => {
      expect(computeTargetDate("expire_now", 0, now).getTime()).toBe(now);
    });
    it("set_minutes → now + N dk", () => {
      expect(computeTargetDate("set_minutes", 5, now).getTime()).toBe(
        now + 5 * 60_000,
      );
    });
    it("backdate_days → now - N gün", () => {
      expect(computeTargetDate("backdate_days", 3, now).getTime()).toBe(
        now - 3 * 86_400_000,
      );
    });
    it("ondalık dakika yuvarlanır", () => {
      expect(computeTargetDate("set_minutes", 1.4, now).getTime()).toBe(
        now + 1 * 60_000,
      );
    });
  });

  describe("tradeDeadlineField", () => {
    it("awaiting_payment → paymentDeadline", () => {
      expect(tradeDeadlineField("awaiting_payment")).toBe("paymentDeadline");
    });
    it("accepted / shipping_to_warehouse → shippingDeadline", () => {
      expect(tradeDeadlineField("accepted")).toBe("shippingDeadline");
      expect(tradeDeadlineField("shipping_to_warehouse")).toBe(
        "shippingDeadline",
      );
    });
    it("pending / bilinmeyen → responseDeadline", () => {
      expect(tradeDeadlineField("pending")).toBe("responseDeadline");
      expect(tradeDeadlineField("whatever")).toBe("responseDeadline");
    });
  });
});
