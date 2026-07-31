import { Prisma } from "@prisma/client";
import { SiteAccessPinService } from "./site-access-pin.service";

describe("SiteAccessPinService", () => {
  let prisma: any;
  let service: SiteAccessPinService;

  beforeEach(() => {
    prisma = {
      siteAccessPin: { create: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    service = new SiteAccessPinService(prisma);
  });

  describe("generateCode", () => {
    it("produces 8 chars from the unambiguous alphabet", () => {
      for (let i = 0; i < 50; i++) {
        const code = service.generateCode();
        expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
      }
    });
  });

  describe("normalizeCode", () => {
    it("uppercases and strips separators/whitespace", () => {
      expect(service.normalizeCode("abcd-2345 ")).toBe("ABCD2345");
      expect(service.normalizeCode("ab cd.23_45")).toBe("ABCD2345");
    });
  });

  describe("createWithUniqueCode", () => {
    it("retries on unique-code collision then succeeds", async () => {
      const collision = new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "test",
      });
      prisma.siteAccessPin.create
        .mockRejectedValueOnce(collision)
        .mockResolvedValueOnce({ id: "pin-1", code: "ABCD2345" });

      const pin = await service.createWithUniqueCode({ label: "Ayşe" });

      expect(pin.id).toBe("pin-1");
      expect(prisma.siteAccessPin.create).toHaveBeenCalledTimes(2);
    });

    it("rethrows non-collision errors", async () => {
      prisma.siteAccessPin.create.mockRejectedValue(new Error("db down"));
      await expect(
        service.createWithUniqueCode({ label: "Ayşe" }),
      ).rejects.toThrow("db down");
      expect(prisma.siteAccessPin.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("verifyAndConsume", () => {
    it("returns true when the atomic update consumed one row", async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: "pin-1" }]);
      await expect(service.verifyAndConsume("abcd-2345")).resolves.toBe(true);
    });

    it("returns false when no row matched (unknown/revoked/expired/exhausted)", async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      await expect(service.verifyAndConsume("ABCD2345")).resolves.toBe(false);
    });

    it("rejects empty input without touching the database", async () => {
      await expect(service.verifyAndConsume("--- ---")).resolves.toBe(false);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it("passes the normalized code to the query", async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: "pin-1" }]);
      await service.verifyAndConsume("abcd-2345 ");
      // $queryRaw receives a template-strings array + interpolated values.
      const call = prisma.$queryRaw.mock.calls[0];
      expect(call).toContain("ABCD2345");
    });
  });
});
