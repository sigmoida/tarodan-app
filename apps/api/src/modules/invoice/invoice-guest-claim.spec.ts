import { InvoiceService } from "./invoice.service";

// Guest order claim: the order summary of a claimed guest order moves from
// the system guest to the account, guarded on the buyer still being the guest.
describe("InvoiceService.reassignGuestBuyer", () => {
  const none = undefined as never;
  const service = new InvoiceService(none, none, none, none);
  const input = { guestUserId: "guest", userId: "buyer", orderIds: ["o-1"] };

  it("moves the summaries of the orders that are still on the guest", async () => {
    const tx = {
      invoice: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };

    await expect(service.reassignGuestBuyer(tx as never, input)).resolves.toBe(
      1,
    );
    expect(tx.invoice.updateMany).toHaveBeenCalledWith({
      where: { orderId: { in: ["o-1"] }, buyerId: "guest" },
      data: { buyerId: "buyer" },
    });
  });

  it("does nothing without orders", async () => {
    const tx = { invoice: { updateMany: jest.fn() } };

    await expect(
      service.reassignGuestBuyer(tx as never, { ...input, orderIds: [] }),
    ).resolves.toBe(0);
    expect(tx.invoice.updateMany).not.toHaveBeenCalled();
  });
});
