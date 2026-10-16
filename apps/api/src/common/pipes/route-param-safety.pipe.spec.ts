import { BadRequestException } from "@nestjs/common";
import { RouteParamSafetyPipe } from "./route-param-safety.pipe";
import { uuidParamPipe } from "./uuid-param.decorator";

/**
 * `%00` gibi kontrol karakterleri Postgres'te "invalid byte sequence" ile
 * patlayıp 500 dönüyordu; artık her uçta 400. Meşru UUID-dışı id'ler
 * (seed'li vergi kuralı, slug, depo anahtarı) etkilenmez.
 */
describe("RouteParamSafetyPipe", () => {
  const pipe = new RouteParamSafetyPipe();
  const param = { type: "param" as const, data: "id" };

  it.each([
    "0b0f6c3e-8a2d-4c1b-9f51-3a7e2d9c4b10",
    "tax-rule-tr-default",
    "my-collection-slug",
    "dev/products/product-images/abc-card.webp",
  ])("meşru değer geçer: %s", (value) => {
    expect(pipe.transform(value, param)).toBe(value);
  });

  it.each([
    ["NUL", "abc\u0000"],
    ["yeni satır", "abc\ndef"],
    ["DEL", "abc\u007f"],
    ["aşırı uzun", "a".repeat(1025)],
  ])("%s → 400", (_label, value) => {
    expect(() => pipe.transform(value, param)).toThrow(BadRequestException);
  });

  it("@Param() ile gelen tüm parametre nesnesini de denetler", () => {
    expect(() =>
      pipe.transform({ id: "ok", "0": "x\u0000" }, { type: "param" }),
    ).toThrow(BadRequestException);
  });

  it("gövde ve sorgu değerlerine dokunmaz", () => {
    expect(pipe.transform("a\u0000", { type: "body" })).toBe("a\u0000");
    expect(pipe.transform("a\u0000", { type: "query" })).toBe("a\u0000");
  });
});

describe("uuidParamPipe (UuidParam)", () => {
  const meta = { type: "param" as const, data: "id" };

  it("her UUID sürümünü kabul eder (seed id'leri v4 olmayabilir)", async () => {
    await expect(
      uuidParamPipe().transform("6f1e2d3c-4b5a-4c6d-8e7f-0a1b2c3d4e01", meta),
    ).resolves.toBe("6f1e2d3c-4b5a-4c6d-8e7f-0a1b2c3d4e01");
  });

  it("biçimsiz id → katalog anahtarlı 400", async () => {
    await expect(
      uuidParamPipe().transform("123; DROP", meta),
    ).rejects.toMatchObject({
      status: 400,
      response: { i18nKey: "server.common.invalidId" },
    });
  });
});
