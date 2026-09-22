import { ElogoDeliveryService } from "./elogo-delivery.service";
import { accountLaneServiceStub } from "../account-lane/account-lane.testing";

/**
 * Test şeridi alıcısına e-belge kesilmez: GİB'e gerçek fatura gider ve seri
 * numarası tükenirdi. Kayıt da açılmaz — retry kuyruğuna hiç girmez.
 */
describe("ElogoDeliveryService.cut — test lane", () => {
  const build = (lanes: ReturnType<typeof accountLaneServiceStub>) => {
    const prisma = {
      elogoInvoice: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(),
    };
    const elogo = { isEnabled: jest.fn(() => false) };
    const service = new ElogoDeliveryService(
      prisma as never,
      elogo as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      lanes as never,
    );
    return { service, prisma, elogo };
  };

  it("skips a test-lane recipient before touching the invoice table", async () => {
    const { service, prisma, elogo } = build(
      accountLaneServiceStub({ tester: "test" }),
    );
    await service.cut("commission", "pkg-1", "tester", 100);
    expect(prisma.elogoInvoice.findUnique).not.toHaveBeenCalled();
    expect(elogo.isEnabled).not.toHaveBeenCalled();
  });

  it("proceeds for a live recipient", async () => {
    const { service, elogo } = build(accountLaneServiceStub({}));
    await service.cut("commission", "pkg-1", "buyer", 100).catch(() => {});
    expect(elogo.isEnabled).toHaveBeenCalled();
  });
});
