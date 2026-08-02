import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { SetAiConfigDto } from "./ai-config.dto";

/**
 * Eşikler 0..1 ORANIDIR. Aralık dışına çıkan bir değer moderasyonu sessizce
 * anlamsızlaştırır: ilgililik eşiği 0 her görseli otomatik kabul eder, NSFW
 * eşiği > 1 hiçbir görseli engellemez. Uçta doğrulama olmadığı sürece bunu
 * yalnız paneldeki sürgü sınırlıyordu.
 */
describe("SetAiConfigDto", () => {
  const check = (payload: Record<string, unknown>) =>
    validate(plainToInstance(SetAiConfigDto, payload));

  it("0..1 aralığındaki oranları kabul eder", async () => {
    expect(
      await check({ relevanceThreshold: 0.2, nsfwThreshold: 0.7 }),
    ).toHaveLength(0);
    expect(
      await check({ relevanceThreshold: 0, nsfwThreshold: 1 }),
    ).toHaveLength(0);
  });

  it("1'den büyük eşiği reddeder (hiçbir şey engellenmez olurdu)", async () => {
    const errors = await check({ nsfwThreshold: 1.5 });
    expect(errors.some((e) => e.property === "nsfwThreshold")).toBe(true);
  });

  it("negatif eşiği reddeder", async () => {
    const errors = await check({ relevanceThreshold: -0.1 });
    expect(errors.some((e) => e.property === "relevanceThreshold")).toBe(true);
  });

  it("yüzde formatında (0-100) gönderimi reddeder", async () => {
    const errors = await check({ relevanceThreshold: 70 });
    expect(errors.some((e) => e.property === "relevanceThreshold")).toBe(true);
  });

  it("tek alanlı kısmi güncellemeye izin verir", async () => {
    expect(await check({ nsfwThreshold: 0.9 })).toHaveLength(0);
  });
});
