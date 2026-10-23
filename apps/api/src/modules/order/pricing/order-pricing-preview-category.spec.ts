import { ServiceUnavailableException } from "@nestjs/common";
import { OrderPricingService } from "./order-pricing.service";

/**
 * Preview paths tolerate a missing category; checkout pricing does not.
 * `calculateCommission` stays fail-closed (503 + error log) because a wrong
 * or guessed commission would be charged for real.
 */
describe("OrderPricingService commission category handling", () => {
  const prisma = {
    commissionRuleSet: {
      findFirst: jest.fn().mockResolvedValue({ id: "set-1", version: 1 }),
    },
  };
  const service = new OrderPricingService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  const loggerError = jest.spyOn((service as any).logger, "error");

  beforeEach(() => {
    jest.clearAllMocks();
    loggerError.mockImplementation(() => undefined);
  });

  describe("getCommissionPreviewBatch", () => {
    it("returns null for an item without a category and computes the rest", async () => {
      const preview = jest
        .spyOn(service, "getCommissionPreview")
        .mockResolvedValue({
          sellerFeeAmount: 5,
          sellerNetAmount: 95,
        } as any);

      const { results } = await service.getCommissionPreviewBatch("seller-1", [
        { amount: 100, categoryId: "cat-1" },
        { amount: 100, categoryId: null },
        { amount: 100 },
        { amount: 100, categoryId: "cat-2" },
      ]);

      expect(results).toEqual([
        { sellerFeeAmount: 5, sellerNetAmount: 95 },
        null,
        null,
        { sellerFeeAmount: 5, sellerNetAmount: 95 },
      ]);
      expect(preview).toHaveBeenCalledTimes(2);
      expect(loggerError).not.toHaveBeenCalled();
      preview.mockRestore();
    });
  });

  describe("calculateCommission (checkout and quote path)", () => {
    it.each([undefined, null, ""])(
      "stays fail-closed with 503 and an error log for categoryId=%p",
      async (categoryId) => {
        await expect(
          service.calculateCommission(100, "seller-1", categoryId),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
        expect(loggerError).toHaveBeenCalledTimes(1);
      },
    );
  });
});
