import * as crypto from "crypto";
import { Prisma } from "@prisma/client";
import { EmailChangeService } from "./email-change.service";

/**
 * Confirming an e-mail change proves the new inbox: the code is spent, the
 * address changes and is verified, and the guest order claim is requested,
 * in one transaction; the claim runs after commit. Synthetic data only.
 */
describe("EmailChangeService.verify", () => {
  const CODE = "123456";
  const CLAIM_KEY = "guest_order.claim:user-1:nonce";

  const makeService = () => {
    const events: string[] = [];
    const tx = {
      emailChangeToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      emailChangeToken: {
        findFirst: jest.fn().mockResolvedValue({
          id: "ect-1",
          userId: "user-1",
          newEmail: "new.address@example.test",
          codeHash: crypto.createHash("sha256").update(CODE).digest("hex"),
          attempts: 0,
          expiresAt: new Date(Date.now() + 60_000),
          usedAt: null,
        }),
        update: jest.fn(),
      },
      user: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => {
        const result = await fn(tx);
        events.push("commit");
        return result;
      }),
    };
    const guestOrderClaims = {
      request: jest.fn(async (t: unknown, userId: string) => {
        events.push(`request:${userId}:${t === tx ? "in-tx" : "outside"}`);
        return CLAIM_KEY;
      }),
      flush: jest.fn(async (key: string) => {
        events.push(`flush:${key}`);
      }),
    };
    const service = new EmailChangeService(
      prisma as never,
      {} as never,
      guestOrderClaims as never,
    );
    return { service, prisma, tx, guestOrderClaims, events };
  };

  it("spends the code, sets and verifies the address and requests the claim in one transaction", async () => {
    const { service, prisma, tx, events } = makeService();

    await expect(service.verify("user-1", CODE)).resolves.toEqual({
      email: "new.address@example.test",
    });

    expect(tx.emailChangeToken.updateMany).toHaveBeenCalledWith({
      where: { id: "ect-1", usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { email: "new.address@example.test", isEmailVerified: true },
    });
    // No write outside the transaction.
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.emailChangeToken.update).not.toHaveBeenCalled();
    expect(events).toEqual([
      "request:user-1:in-tx",
      "commit",
      `flush:${CLAIM_KEY}`,
    ]);
  });

  it("a concurrent confirmation that already spent the code changes nothing", async () => {
    const { service, tx, guestOrderClaims } = makeService();
    tx.emailChangeToken.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.verify("user-1", CODE)).rejects.toMatchObject({
      response: { i18nKey: "server.auth.noActiveVerificationCode" },
    });
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(guestOrderClaims.request).not.toHaveBeenCalled();
    expect(guestOrderClaims.flush).not.toHaveBeenCalled();
  });

  it("maps a lost race for the address to 409 and requests no claim", async () => {
    const { service, tx, guestOrderClaims } = makeService();
    tx.user.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    await expect(service.verify("user-1", CODE)).rejects.toMatchObject({
      response: { i18nKey: "server.auth.emailAlreadyRegistered" },
    });
    expect(guestOrderClaims.flush).not.toHaveBeenCalled();
  });

  it("a wrong code spends nothing and requests nothing", async () => {
    const { service, prisma, guestOrderClaims } = makeService();

    await expect(service.verify("user-1", "000000")).rejects.toMatchObject({
      response: { i18nKey: "server.auth.wrongVerificationCode" },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(guestOrderClaims.request).not.toHaveBeenCalled();
  });
});
