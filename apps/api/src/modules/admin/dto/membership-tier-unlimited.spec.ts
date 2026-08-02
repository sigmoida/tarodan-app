import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { UpdateMembershipTierDto } from "./admin-membership.dto";

/**
 * `-1` = SINIRSIZ toplam ilan. Bu sözleşme üç yerde birden yaşıyor: admin UI
 * bunu sunuyor ("-1 = sınırsız" yardım metni, kartta "Sınırsız" rozeti), web
 * üyelik sayfası böyle gösteriyor ve servis bunu bilinçli olarak kabul ediyor
 * (`maxTotalListings !== -1 && < 1` → red). Ama DTO `@Min(0)` diyordu; istek
 * servise HİÇ ulaşmadan 400 oluyordu.
 *
 * Yan etki daha da ağırdı: form her kaydetmede tüm alanları gönderdiği için,
 * `maxTotalListings` zaten -1 olan bir tarifede sadece adı değiştirmek bile
 * 400 alıyordu — yani sınırsız tarifeler hiç düzenlenemiyordu.
 */
describe("UpdateMembershipTierDto — sınırsız (-1) ilan limiti", () => {
  const validateDto = (payload: Record<string, unknown>) =>
    validate(plainToInstance(UpdateMembershipTierDto, payload));

  it("maxTotalListings -1 (sınırsız) kabul edilir", async () => {
    const errors = await validateDto({ maxTotalListings: -1 });
    expect(errors).toHaveLength(0);
  });

  it("sınırsız tarifede başka bir alanı güncellemek engellenmez", async () => {
    // Form tüm alanları gönderir; -1 reddedilirse ad değişikliği de imkânsızlaşır.
    const errors = await validateDto({
      name: "Business",
      maxTotalListings: -1,
      maxFreeListings: 5,
      monthlyPrice: 199,
    });
    expect(errors).toHaveLength(0);
  });

  it("-1 dışındaki negatif değerler hâlâ reddedilir", async () => {
    const errors = await validateDto({ maxTotalListings: -2 });
    expect(errors.some((e) => e.property === "maxTotalListings")).toBe(true);
  });

  it("maxFreeListings için -1 YOKTUR (ücretsiz sınırsız üyelik yok)", async () => {
    const errors = await validateDto({ maxFreeListings: -1 });
    expect(errors.some((e) => e.property === "maxFreeListings")).toBe(true);
  });

  it("pozitif limitler değişmeden geçer", async () => {
    const errors = await validateDto({
      maxTotalListings: 50,
      maxFreeListings: 3,
      maxImagesPerListing: 10,
    });
    expect(errors).toHaveLength(0);
  });
});
