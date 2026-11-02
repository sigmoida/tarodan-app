import { Logger } from "@nestjs/common";
import { GuestOrderClaimRequestService } from "./guest-order-claim-request.service";
import { OUTBOX_GUEST_ORDER_CLAIM } from "../../outbox/outbox.types";

describe("GuestOrderClaimRequestService", () => {
  const setup = () => {
    const prisma = { marker: "prisma" };
    const outbox = {
      enqueue: jest.fn().mockResolvedValue(undefined),
      runPendingInline: jest.fn().mockResolvedValue({ ran: true }),
    };
    const service = new GuestOrderClaimRequestService(
      prisma as never,
      outbox as never,
    );
    return { service, prisma, outbox };
  };

  afterEach(() => jest.restoreAllMocks());

  it("enqueues the claim in the caller's transaction with the user id only", async () => {
    const { service, outbox } = setup();
    const tx = { marker: "tx" };

    const key = await service.request(tx as never, "user-1");

    expect(outbox.enqueue).toHaveBeenCalledWith(tx, {
      type: OUTBOX_GUEST_ORDER_CLAIM,
      payload: { userId: "user-1" },
      dedupeKey: key,
    });
    expect(key).toMatch(
      /^guest_order\.claim:user-1:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("uses a new key per request, so a later claim is never a no-op", async () => {
    const { service } = setup();

    const first = await service.request({} as never, "user-1");
    const second = await service.request({} as never, "user-1");

    expect(first).not.toBe(second);
  });

  it("lets an enqueue failure fail the caller's transaction", async () => {
    const { service, outbox } = setup();
    outbox.enqueue.mockRejectedValueOnce(new Error("db down"));

    await expect(service.request({} as never, "user-1")).rejects.toThrow(
      "db down",
    );
  });

  it("flush runs the pending row inline outside the transaction", async () => {
    const { service, outbox, prisma } = setup();

    await service.flush("guest_order.claim:user-1:n");

    expect(outbox.runPendingInline).toHaveBeenCalledWith(
      prisma,
      "guest_order.claim:user-1:n",
    );
  });

  it("a failed flush is a warning that does not fail the caller", async () => {
    const { service, outbox } = setup();
    const warn = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    outbox.runPendingInline.mockRejectedValueOnce(new Error("claim failed"));

    await expect(
      service.flush("guest_order.claim:user-1:n"),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("deferred to the outbox"),
    );
    expect(String(warn.mock.calls[0][0])).toContain("user-1");
  });
});
