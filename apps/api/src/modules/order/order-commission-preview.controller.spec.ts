import { BadRequestException } from "@nestjs/common";
import { OrderController } from "./order.controller";

/**
 * GET /orders/commission-preview without a category is a client mistake (the
 * live iOS 1.0.5 listing form sends it before a category is picked): it is a
 * 400 with its own i18n key, never a 5xx and never reaches the pricing code.
 */
describe("OrderController commission preview category", () => {
  const orderService = {
    getCommissionPreview: jest.fn(),
    getCommissionPreviewBatch: jest.fn(),
  };
  const controller = new OrderController(orderService as any);

  beforeEach(() => jest.clearAllMocks());

  it.each([undefined, ""])(
    "rejects categoryId=%p with 400 server.commission.categoryRequired",
    async (categoryId) => {
      const call = controller.getCommissionPreview(
        "100",
        categoryId as any,
        undefined,
        "seller-1",
      );
      await expect(call).rejects.toBeInstanceOf(BadRequestException);
      await expect(call).rejects.toMatchObject({
        response: { i18nKey: "server.commission.categoryRequired" },
      });
      expect(orderService.getCommissionPreview).not.toHaveBeenCalled();
    },
  );

  it("still validates the amount first", async () => {
    await expect(
      controller.getCommissionPreview("abc", undefined, undefined, "seller-1"),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.order.invalidAmount" },
    });
  });

  it("passes a request with a category through", async () => {
    orderService.getCommissionPreview.mockResolvedValue({ ok: true });
    await controller.getCommissionPreview(
      "100",
      "cat-1",
      undefined,
      "seller-1",
    );
    expect(orderService.getCommissionPreview).toHaveBeenCalledWith(
      100,
      "seller-1",
      "cat-1",
      expect.any(Number),
    );
  });
});
