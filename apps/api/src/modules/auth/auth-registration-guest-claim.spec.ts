import * as crypto from "crypto";
import { AuthRegistrationService } from "./auth-registration.service";

/**
 * Guest order claim (2026-11-02 plan, D1/D2): the claim is requested in the
 * transaction that verifies the e-mail and runs after commit; registration
 * itself claims nothing, because an unproven registrant must not hold
 * another person's orders. Synthetic data only.
 */
describe("AuthRegistrationService guest order claim triggers", () => {
  const CLAIM_KEY = "guest_order.claim:user-1:nonce";

  const makeService = () => {
    const events: string[] = [];
    const tx = {
      marker: "tx",
      user: {
        create: jest.fn().mockResolvedValue({
          id: "user-1",
          adminCode: "B10001",
          username: "member",
          usernameClaimedAt: new Date(),
          email: "member@example.test",
          phone: null,
          displayName: "Member",
          isVerified: false,
          isSeller: false,
          sellerType: null,
          createdAt: new Date(),
        }),
        update: jest.fn().mockResolvedValue({ isEmailVerified: true }),
      },
      emailVerificationToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      corporateApplication: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      order: { findMany: jest.fn(), updateMany: jest.fn() },
      emailVerificationToken: { findUnique: jest.fn() },
      corporateApplication: { findUnique: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([{ code: "B10001" }]),
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
    const service = new AuthRegistrationService(
      prisma as never,
      { sendWelcomeEmail: jest.fn() } as never,
      { syncUserConsent: jest.fn() } as never,
      { add: jest.fn() } as never,
      {
        recordAccountConsents: jest.fn().mockResolvedValue(0),
        recordMarketingChange: jest.fn(),
      } as never,
      {
        consumeLookupBudget: jest.fn(),
        assertNationalIdAvailable: jest.fn(),
      } as never,
      guestOrderClaims as never,
    );
    jest
      .spyOn(service, "sendEmailVerification")
      .mockResolvedValue({ success: true });
    return { service, prisma, tx, guestOrderClaims, events };
  };

  describe("register", () => {
    it("claims nothing: no guest order is read or moved, no claim is requested", async () => {
      const { service, prisma, guestOrderClaims } = makeService();

      await service.register({
        username: "member",
        email: "member@example.test",
        password: "Secret123",
        displayName: "Member",
      });

      expect(prisma.order.findMany).not.toHaveBeenCalled();
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
      expect(guestOrderClaims.request).not.toHaveBeenCalled();
      expect(guestOrderClaims.flush).not.toHaveBeenCalled();
    });
  });

  describe("verifyEmail", () => {
    const raw = "a".repeat(64);
    const token = (overrides: Record<string, unknown> = {}) => ({
      id: "evt-1",
      userId: "user-1",
      token: crypto.createHash("sha256").update(raw).digest("hex"),
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { isEmailVerified: false },
      ...overrides,
    });

    it("spends the link, verifies the e-mail and requests the claim in one transaction, then runs it", async () => {
      const { service, prisma, tx, events } = makeService();
      prisma.emailVerificationToken.findUnique.mockResolvedValue(token());

      await expect(service.verifyEmail(raw)).resolves.toEqual({
        alreadyVerified: false,
      });

      expect(tx.emailVerificationToken.updateMany).toHaveBeenCalledWith({
        where: { id: "evt-1", usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { isEmailVerified: true },
      });
      expect(events).toEqual([
        "request:user-1:in-tx",
        "commit",
        `flush:${CLAIM_KEY}`,
      ]);
    });

    it("a concurrent use of the same link verifies once and answers already verified", async () => {
      const { service, prisma, tx, guestOrderClaims } = makeService();
      prisma.emailVerificationToken.findUnique.mockResolvedValue(token());
      // The other request spent the link between the read and the write.
      tx.emailVerificationToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.verifyEmail(raw)).resolves.toEqual({
        alreadyVerified: true,
      });
      expect(tx.user.update).not.toHaveBeenCalled();
      expect(guestOrderClaims.request).not.toHaveBeenCalled();
      expect(guestOrderClaims.flush).not.toHaveBeenCalled();
    });

    it("a used link of a verified account requests nothing", async () => {
      const { service, prisma, guestOrderClaims } = makeService();
      prisma.emailVerificationToken.findUnique.mockResolvedValue(
        token({ usedAt: new Date(), user: { isEmailVerified: true } }),
      );

      await expect(service.verifyEmail(raw)).resolves.toEqual({
        alreadyVerified: true,
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(guestOrderClaims.request).not.toHaveBeenCalled();
    });

    it("an expired link verifies nothing and requests nothing", async () => {
      const { service, prisma, guestOrderClaims } = makeService();
      prisma.emailVerificationToken.findUnique.mockResolvedValue(
        token({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.verifyEmail(raw)).rejects.toMatchObject({
        response: { i18nKey: "server.auth.emailVerificationLinkExpired" },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(guestOrderClaims.request).not.toHaveBeenCalled();
    });
  });

  describe("markEmailVerifiedByAdmin", () => {
    it("verifies, spends open links and requests the claim in one transaction, then runs it", async () => {
      const { service, tx, events } = makeService();

      await expect(service.markEmailVerifiedByAdmin("user-1")).resolves.toEqual(
        { isEmailVerified: true },
      );

      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { isEmailVerified: true },
        select: { isEmailVerified: true },
      });
      expect(tx.emailVerificationToken.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1", usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
      expect(events).toEqual([
        "request:user-1:in-tx",
        "commit",
        `flush:${CLAIM_KEY}`,
      ]);
    });
  });

  describe("activateCorporateInvitation", () => {
    it("requests the claim in the account's transaction and runs it after commit", async () => {
      const { service, prisma, events } = makeService();
      prisma.corporateApplication.findUnique.mockResolvedValue({
        id: "app-1",
        status: "invited",
        invitationExpiresAt: new Date(Date.now() + 60_000),
        companyEmail: "company@example.test",
        phone: "+905550000001",
        companyTitle: "Example Ltd",
        companyLegalName: "Example Ltd",
        companyType: null,
        companyCity: null,
        companyDistrict: null,
        taxId: null,
      });

      await service.activateCorporateInvitation({
        token: "invite-token",
        username: "examplecorp",
        password: "Secret123",
      } as never);

      expect(events).toEqual([
        "request:user-1:in-tx",
        "commit",
        `flush:${CLAIM_KEY}`,
      ]);
    });
  });
});
