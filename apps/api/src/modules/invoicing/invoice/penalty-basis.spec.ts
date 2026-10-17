import { buildPenaltyBasis, type PenaltyBasisInput } from "./penalty-basis";

/**
 * Ceza faturasının matrahı.
 *
 * Buradaki risk MÜKERRER FATURALAMADIR: kusurlu tarafa kargo payı teslimatta
 * zaten faturalanmış olabilir. Kural bu yüzden "yükleme" değil "fark"tır —
 * ceza yalnız ona henüz faturalanmamış tutarı kapsar.
 */

const input = (over: Partial<PenaltyBasisInput> = {}): PenaltyBasisInput => ({
  faultParty: "seller",
  components: [],
  invoicedSellerShipping: 0,
  vatRate: 20,
  ...over,
});

const component = (
  componentCode: string,
  treatment: string,
  netAmount: number,
) => ({ componentCode, treatment, netAmount });

describe("buildPenaltyBasis", () => {
  it("satıcı kusurunda yalnız FARKI faturalar", () => {
    // Gidiş kargonun tamamı (120) satıcıya yüklenir ama kendi payı (60) zaten
    // `seller_shipping` belgesiyle kesilmişti → fark 60, üstüne iade kargosu 120.
    const basis = buildPenaltyBasis(
      input({
        faultParty: "seller",
        invoicedSellerShipping: 60,
        components: [
          component("outbound_shipping", "seller_charge", 120),
          component("return_shipping", "seller_charge", 120),
        ],
      }),
    );

    expect(basis).toMatchObject({ side: "seller", net: 180 });
    expect(basis!.line).toMatchObject({
      name: "Ceza bedeli (kargo)",
      quantity: 1,
      net: 180,
      unitPrice: 180,
      vatRate: 20,
      taxAmount: 36,
    });
  });

  it("alıcı kusurunda tamamını faturalar — alıcıya hiç kesilmemişti", () => {
    const basis = buildPenaltyBasis(
      input({
        faultParty: "buyer",
        // Satıcıya kesilmiş kargo alıcı tarafını İLGİLENDİRMEZ.
        invoicedSellerShipping: 60,
        components: [
          component("outbound_shipping", "buyer_charge", 60),
          component("return_shipping", "buyer_charge", 120),
        ],
      }),
    );

    expect(basis).toMatchObject({ side: "buyer", net: 180 });
  });

  it("kusur kargoda/platformdaysa ceza kesilmez", () => {
    for (const faultParty of ["carrier", "platform", null] as const) {
      expect(
        buildPenaltyBasis(
          input({
            faultParty,
            components: [component("return_shipping", "platform_absorb", 120)],
          }),
        ),
      ).toBeNull();
    }
  });

  it("karşı tarafın yüklemelerini saymaz", () => {
    // Satıcı kusuru: alıcıya yazılmış bir charge cezaya girmemeli.
    expect(
      buildPenaltyBasis(
        input({
          faultParty: "seller",
          components: [
            component("outbound_shipping", "buyer_charge", 60),
            component("outbound_shipping", "platform_retain", 60),
          ],
        }),
      ),
    ).toBeNull();
  });

  it("fark sıfıra inerse yalnız iade kargosu kalır", () => {
    const basis = buildPenaltyBasis(
      input({
        faultParty: "seller",
        // Gidişin tamamı zaten satıcıya faturalanmıştı.
        invoicedSellerShipping: 120,
        components: [
          component("outbound_shipping", "seller_charge", 120),
          component("return_shipping", "seller_charge", 90),
        ],
      }),
    );
    expect(basis).toMatchObject({ net: 90 });
  });

  it("hiç yükleme yoksa belge doğmaz", () => {
    expect(buildPenaltyBasis(input({ faultParty: "seller" }))).toBeNull();
  });

  it("KDV iki hizmet için ayrı yuvarlanır", () => {
    // 12,53 × %20 = 2,506 → 2,51 ve 8,53 × %20 = 1,706 → 1,71 ⇒ 4,22.
    const basis = buildPenaltyBasis(
      input({
        faultParty: "buyer",
        components: [
          component("outbound_shipping", "buyer_charge", 12.53),
          component("return_shipping", "buyer_charge", 8.53),
        ],
      }),
    );
    expect(basis).toMatchObject({ net: 21.06 });
    expect(basis!.line.taxAmount).toBe(4.22);
  });

  it("KDV kapalıyken vergisiz kesilir", () => {
    const basis = buildPenaltyBasis(
      input({
        faultParty: "buyer",
        vatRate: 0,
        components: [component("return_shipping", "buyer_charge", 100)],
      }),
    );
    expect(basis!.line).toMatchObject({ vatRate: 0, taxAmount: 0 });
  });
});
