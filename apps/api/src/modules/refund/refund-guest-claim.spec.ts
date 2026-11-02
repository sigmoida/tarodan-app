import { RefundService } from "./refund.service";

// Guest order claim: refund requests opened "for the buyer" while the order
// was on the system guest move to the account; nothing else does.
describe("RefundService.reassignGuestRequests", () => {
  const none = undefined as never;
  const service = new RefundService(none, none, none, none, none, none);
  const input = { guestUserId: "guest", userId: "buyer", orderIds: ["o-1"] };

  const makeTx = () => ({
    refundRequest: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([{ id: "rr-1" }, { id: "rr-2" }]),
    },
  });

  it("moves only the requests of the orders whose requester is still the guest", async () => {
    const tx = makeTx();

    await expect(
      service.reassignGuestRequests(tx as never, input),
    ).resolves.toEqual({ moved: 1, requestIds: ["rr-1", "rr-2"] });
    expect(tx.refundRequest.updateMany).toHaveBeenCalledWith({
      where: { orderId: { in: ["o-1"] }, requesterId: "guest" },
      data: { requesterId: "buyer" },
    });
    expect(tx.refundRequest.findMany).toHaveBeenCalledWith({
      where: { orderId: { in: ["o-1"] } },
      select: { id: true },
      orderBy: { id: "asc" },
    });
  });

  it("does nothing without orders", async () => {
    const tx = makeTx();

    await expect(
      service.reassignGuestRequests(tx as never, { ...input, orderIds: [] }),
    ).resolves.toEqual({ moved: 0, requestIds: [] });
    expect(tx.refundRequest.updateMany).not.toHaveBeenCalled();
  });
});
