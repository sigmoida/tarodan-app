import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { AddCollectionItemDto } from "./collection.dto";

/**
 * Multipart gövde alanları metin gelir. Global boru (`main.ts`) örtük dönüşümle
 * çalıştığı için çıplak `boolean` "false"u `true`ya çevirirdi; `isFeatured`
 * ham değerden okunur (`FormBoolean`). Seçenekler `main.ts`dekiyle aynıdır.
 */
describe("AddCollectionItemDto.isFeatured (multipart gövde, gerçek ValidationPipe)", () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  const bind = (body: Record<string, unknown>) =>
    pipe.transform(body, {
      type: "body",
      metatype: AddCollectionItemDto,
    }) as Promise<AddCollectionItemDto>;

  it.each([
    ["true", true],
    ["TRUE", true],
    ["1", true],
    ["false", false],
    ["False", false],
    ["0", false],
    [true, true],
    [false, false],
  ])("%p -> %p", async (input, expected) => {
    const dto = await bind({ productId: undefined, isFeatured: input });
    expect(dto.isFeatured).toBe(expected);
  });

  it('"false" artık true OLMAZ (örtük dönüşüm regresyonu)', async () => {
    const dto = await bind({ isFeatured: "false" });
    expect(dto.isFeatured).toBe(false);
  });

  it("alan gönderilmemişse ya da boş metinse undefined kalır", async () => {
    expect((await bind({})).isFeatured).toBeUndefined();
    expect((await bind({ isFeatured: "" })).isFeatured).toBeUndefined();
    expect((await bind({ isFeatured: "  " })).isFeatured).toBeUndefined();
  });

  it("tanınmayan değeri sessizce true yapmaz, 400 döner", async () => {
    await expect(bind({ isFeatured: "maybe" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
