import { Logger } from "@nestjs/common";
import type { Queue } from "bull";
import { registerRepeatableCron } from "./bull-cron.helper";

/**
 * Cron kayıt sözleşmesi. Kritik olan zaman dilimi: konteynerlerde TZ set
 * edilmiyor (UTC), `tz` verilmeyen repeatable ifadeler UTC yorumlanır ve
 * "09:00 üyelik hatırlatması" TR 12:00'de, "gece bakımı" sabah trafiğinde
 * koşardı. Tüm cron'lar bu TEK helper'dan geçtiği için sözleşme burada
 * sabitlenir.
 */
describe("registerRepeatableCron", () => {
  const logger = new Logger("test");
  const makeQueue = (existing: Array<{ name: string; key: string }> = []) =>
    ({
      getRepeatableJobs: jest.fn().mockResolvedValue(existing),
      removeRepeatableByKey: jest.fn().mockResolvedValue(undefined),
      add: jest.fn().mockResolvedValue(undefined),
    }) as unknown as Queue;

  it("cron'u Europe/Istanbul zaman dilimiyle ve sınırlı geçmişle kaydeder", async () => {
    const queue = makeQueue();

    await registerRepeatableCron(queue, "ornek-is", "15 4 * * *", logger);

    expect(queue.add).toHaveBeenCalledWith(
      "ornek-is",
      {},
      {
        repeat: { cron: "15 4 * * *", tz: "Europe/Istanbul" },
        attempts: 3,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    );
  });

  it("aynı isimli eski kayıtları silip yeniden kaydeder (restart'ta çoğalmaz)", async () => {
    const queue = makeQueue([
      { name: "ornek-is", key: "eski-anahtar" },
      { name: "baska-is", key: "dokunma" },
    ]);

    await registerRepeatableCron(queue, "ornek-is", "*/5 * * * *", logger);

    expect(queue.removeRepeatableByKey).toHaveBeenCalledTimes(1);
    expect(queue.removeRepeatableByKey).toHaveBeenCalledWith("eski-anahtar");
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it("kayıt hatasını yükseltir — cron'suz instance hazır başlamaz", async () => {
    const queue = makeQueue();
    (queue.add as jest.Mock).mockRejectedValue(new Error("redis down"));

    await expect(
      registerRepeatableCron(queue, "ornek-is", "0 * * * *", logger),
    ).rejects.toThrow("redis down");
  });
});
