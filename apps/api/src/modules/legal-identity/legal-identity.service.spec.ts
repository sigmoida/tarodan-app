import { Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { LegalIdentityService } from "./legal-identity.service";
import { LegalIdentityController } from "./legal-identity.controller";
import { LEGAL_IDENTITY_SUBMIT_LIMITS } from "./helpers/legal-identity-status";
import { EXPOSES_LEGAL_IDENTITY_KEY } from "../../common/interceptors/strip-sensitive-fields.interceptor";
import { clientIpThrottleTracker } from "../../common/helpers/client-ip";
import * as requestContext from "../../common/context/request-context";

const TCKN = "10000000146";

type Row = {
  id: string;
  legalFirstName: string | null;
  legalLastName: string | null;
  nationalId: string | null;
  isTestAccount: boolean;
  adminUser: { id: string } | null;
  bankAccount: { tcKimlikNo: string | null } | null;
};

/**
 * Kimlik kapısının sunucu tarafı: üye yalnız eksik alanları doldurur, dolu
 * alanı değiştiremez; TCKN tekildir ve çakışma yanıtı diğer hesabı ele vermez;
 * uç bir "numara kayıtlı mı" kahini olduğu için üye ve IP başına sınırlıdır.
 */
describe("LegalIdentityService", () => {
  const makeService = (opts: {
    self?: Partial<Row>;
    holder?: { id: string } | null;
    rate?: { allowed: boolean; resetAt?: Date };
  }) => {
    const self: Row = {
      id: "u1",
      legalFirstName: null,
      legalLastName: null,
      nationalId: null,
      isTestAccount: false,
      adminUser: null,
      bankAccount: null,
      ...opts.self,
    };
    const prisma = {
      user: {
        findUnique: jest.fn(
          async (args: { where: { id?: string; nationalId?: string } }) => {
            if (args.where.nationalId !== undefined) return opts.holder ?? null;
            return self;
          },
        ),
        update: jest.fn(
          async (args: { data: Partial<Row> }) => (
            Object.assign(self, args.data),
            { id: self.id }
          ),
        ),
      },
    };
    const cache = {
      checkRateLimit: jest.fn().mockResolvedValue({
        allowed: opts.rate?.allowed ?? true,
        remaining: 0,
        resetAt: opts.rate?.resetAt ?? new Date(Date.now() + 30 * 60000),
      }),
    };
    const service = new LegalIdentityService(prisma as never, cache as never);
    return { service, prisma, cache, self };
  };

  beforeEach(() => {
    jest
      .spyOn(requestContext, "getRequestClientInfo")
      .mockReturnValue({ ipAddress: "203.0.113.7", userAgent: null });
  });

  afterEach(() => jest.restoreAllMocks());

  const full = {
    legalFirstName: "Ayşe",
    legalLastName: "Yılmaz",
    nationalId: TCKN,
  };

  describe("getStatus", () => {
    it("eksik üye için alanları ve banka TCKN'si ön doldurmasını döner", async () => {
      const { service } = makeService({
        self: { bankAccount: { tcKimlikNo: TCKN } },
      });
      await expect(service.getStatus("u1")).resolves.toMatchObject({
        required: true,
        missing: ["legalFirstName", "legalLastName", "nationalId"],
        suggestedNationalId: TCKN,
      });
    });

    it("personel ve test hesabı için kapı açılmaz", async () => {
      const staff = makeService({ self: { adminUser: { id: "a1" } } });
      const test = makeService({ self: { isTestAccount: true } });
      await expect(staff.service.getStatus("u1")).resolves.toMatchObject({
        required: false,
        missing: [],
      });
      await expect(test.service.getStatus("u1")).resolves.toMatchObject({
        required: false,
        missing: [],
      });
    });
  });

  describe("submit", () => {
    it("eksik alanları yazar ve kapıyı kapatır", async () => {
      const { service, prisma } = makeService({});

      const status = await service.submit("u1", full);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u1" },
        data: full,
        select: { id: true },
      });
      expect(status.missing).toEqual([]);
      expect(status.nationalIdMasked).toBe("•••••••••46");
    });

    it("kayıtlı kimliği DEĞİŞTİREMEZ (düzeltme yalnız admin)", async () => {
      const { service, prisma } = makeService({ self: full });

      await expect(
        service.submit("u1", { legalLastName: "Demir" }),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.identity.locked" },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("başka hesaptaki TCKN'yi o hesap hakkında hiçbir şey söylemeden reddeder", async () => {
      const { service, prisma } = makeService({ holder: { id: "other-user" } });

      const error = await service.submit("u1", full).catch((e: unknown) => e);

      expect(error).toMatchObject({
        status: 409,
        response: { i18nKey: "server.identity.nationalIdUnavailable" },
      });
      // Yanıtta diğer hesabın hiçbir izi yok (id, e-posta, ad).
      const body = JSON.stringify(
        (error as { getResponse(): unknown }).getResponse(),
      );
      expect(body).not.toContain("other-user");
      expect(body).not.toContain(TCKN);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("DB yarışında (P2002) ön-kontrolle aynı yanıtı verir", async () => {
      const { service, prisma } = makeService({});
      prisma.user.update.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("unique", {
          code: "P2002",
          clientVersion: "test",
          meta: { target: ["national_id"] },
        }),
      );

      await expect(service.submit("u1", full)).rejects.toMatchObject({
        status: 409,
        response: { i18nKey: "server.identity.nationalIdUnavailable" },
      });
    });

    it("TCKN tekillik sorgusundan ÖNCE üye ve IP bütçesini harcar", async () => {
      const { service, cache, prisma } = makeService({});

      await service.submit("u1", full);

      expect(cache.checkRateLimit).toHaveBeenCalledWith(
        "legal-identity:submit:user:u1",
        LEGAL_IDENTITY_SUBMIT_LIMITS.perUser.max,
        LEGAL_IDENTITY_SUBMIT_LIMITS.perUser.windowSeconds,
      );
      expect(cache.checkRateLimit).toHaveBeenCalledWith(
        "legal-identity:submit:ip:203.0.113.7",
        LEGAL_IDENTITY_SUBMIT_LIMITS.perIp.max,
        LEGAL_IDENTITY_SUBMIT_LIMITS.perIp.windowSeconds,
      );
      const budgetOrder = cache.checkRateLimit.mock.invocationCallOrder[0];
      const lookupOrder = prisma.user.findUnique.mock.calls.findIndex(
        ([args]) => args.where.nationalId !== undefined,
      );
      expect(lookupOrder).toBeGreaterThan(-1);
      expect(budgetOrder).toBeLessThan(
        prisma.user.findUnique.mock.invocationCallOrder[lookupOrder],
      );
      // Kova anahtarlarında numara yok.
      for (const [key] of cache.checkRateLimit.mock.calls) {
        expect(key).not.toContain(TCKN);
      }
    });

    it("bütçe aşılınca 429 döner, numarayı sorgulamaz", async () => {
      const { service, prisma } = makeService({ rate: { allowed: false } });

      await expect(service.submit("u1", full)).rejects.toMatchObject({
        status: 429,
        response: { i18nKey: "server.identity.tooManyAttempts" },
      });
      expect(
        prisma.user.findUnique.mock.calls.some(
          ([args]) => args.where.nationalId !== undefined,
        ),
      ).toBe(false);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("TCKN'yi hiçbir log çağrısına yazmaz", async () => {
      const spies = (["log", "warn", "error", "debug", "verbose"] as const).map(
        (level) => jest.spyOn(Logger.prototype, level),
      );
      const { service } = makeService({ holder: { id: "other" } });

      await service.submit("u1", full).catch(() => undefined);

      for (const spy of spies) {
        for (const args of spy.mock.calls) {
          expect(JSON.stringify(args)).not.toContain(TCKN);
        }
      }
    });
  });

  describe("applyCorrection (admin)", () => {
    it("dolu alanı düzeltir; tekillik kendi satırını çakışma saymaz", async () => {
      const { service, prisma } = makeService({
        self: full,
        holder: { id: "u1" },
      });

      const change = await service.applyCorrection(
        "u1",
        { legalLastName: "Demir", nationalId: TCKN },
        prisma as never,
      );

      expect(change.changed).toEqual(["legalLastName"]);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u1" },
        data: { legalLastName: "Demir" },
        select: { id: true },
      });
    });

    it("admin de başka hesaptaki TCKN'yi yazamaz", async () => {
      const { service, prisma } = makeService({
        self: full,
        holder: { id: "u2" },
      });

      await expect(
        service.applyCorrection(
          "u1",
          { nationalId: "12345678950" },
          prisma as never,
        ),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.identity.nationalIdUnavailable" },
      });
    });
  });
});

describe("LegalIdentityController", () => {
  const proto = LegalIdentityController.prototype as unknown as Record<
    string,
    object
  >;

  it("gönderim ucu istemci IP'si başına kısılır (5/dk)", () => {
    const handler = proto.submit;
    expect(Reflect.getMetadata("THROTTLER:LIMITdefault", handler)).toBe(5);
    expect(Reflect.getMetadata("THROTTLER:TTLdefault", handler)).toBe(60000);
    expect(Reflect.getMetadata("THROTTLER:TRACKERdefault", handler)).toBe(
      clientIpThrottleTracker,
    );
  });

  it("iki uç da sahibine kendi kimliğini döndürmek için açıkça işaretli", () => {
    expect(Reflect.getMetadata(EXPOSES_LEGAL_IDENTITY_KEY, proto.status)).toBe(
      true,
    );
    expect(Reflect.getMetadata(EXPOSES_LEGAL_IDENTITY_KEY, proto.submit)).toBe(
      true,
    );
  });
});
