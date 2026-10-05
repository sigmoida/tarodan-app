import { AdminUserService } from "./admin-user.service";
import { legalIdentityIncompleteWhere } from "../../legal-identity/helpers/legal-identity-status";

/**
 * Admin kullanıcı ekranında yasal kimlik: detay tam değeri döndürür (ekran
 * MaskedValue ile gizler) ve eksik alanları kimlik kapısıyla AYNI kuralla
 * hesaplar; liste "kimlik eksik" filtresi aynı kuralın Prisma karşılığıdır.
 */
const detailRow = (over: Record<string, unknown> = {}) => ({
  id: "u1",
  email: "u@example.com",
  phone: null,
  displayName: "Kullanıcı",
  avatarUrl: null,
  bio: null,
  isVerified: false,
  isEmailVerified: true,
  isPhoneVerified: false,
  isSeller: false,
  isTestAccount: false,
  sellerType: null,
  taxId: null,
  companyName: null,
  legalFirstName: "Ayşe",
  legalLastName: null,
  nationalId: "10000000146",
  adminUser: null,
  createdAt: new Date("2026-01-01"),
  bannedAt: null,
  bannedReason: null,
  isBanned: false,
  deletedAt: null,
  lastLoginAt: null,
  lastActivityAt: null,
  addresses: [],
  products: [],
  buyerOrders: [],
  sellerOrders: [],
  initiatedTrades: [],
  receivedTrades: [],
  givenRatings: [],
  receivedRatings: [],
  membership: null,
  bankAccount: null,
  blocksGiven: [],
  blocksReceived: [],
  _count: {
    products: 0,
    buyerOrders: 0,
    sellerOrders: 0,
    givenRatings: 0,
    receivedRatings: 0,
    initiatedTrades: 0,
    receivedTrades: 0,
    sentMessages: 0,
    receivedMessages: 0,
    blocksGiven: 0,
    blocksReceived: 0,
  },
  ...over,
});

const makeService = (user: Record<string, unknown> = detailRow()) => {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    order: { groupBy: jest.fn().mockResolvedValue([]) },
  };
  const service = new AdminUserService(
    prisma as never,
    { createAuditLog: jest.fn() } as never,
    undefined as never,
  );
  return { service, prisma };
};

describe("AdminUserService.getUserById — yasal kimlik", () => {
  it("yasal alanları seçer ve tam değeriyle döndürür", async () => {
    const { service, prisma } = makeService();

    const result: Record<string, unknown> = await service.getUserById("u1");

    const { select } = prisma.user.findUnique.mock.calls[0][0];
    expect(select).toMatchObject({
      legalFirstName: true,
      legalLastName: true,
      nationalId: true,
    });
    expect(result).toMatchObject({
      legalFirstName: "Ayşe",
      legalLastName: null,
      nationalId: "10000000146",
      legalIdentityMissing: ["legalLastName"],
    });
  });

  it("personel ve test hesabında eksik alan raporlanmaz", async () => {
    const staff = makeService(
      detailRow({ adminUser: { role: "admin", isActive: true } }),
    );
    const test = makeService(detailRow({ isTestAccount: true }));

    expect(await staff.service.getUserById("u1")).toMatchObject({
      legalIdentityMissing: [],
    });
    expect(await test.service.getUserById("u1")).toMatchObject({
      legalIdentityMissing: [],
    });
  });
});

describe("AdminUserService.getUsers — kimlik eksik filtresi", () => {
  it("identityIncomplete=true kapı kuralını AND ile ekler (test filtresini ezmez)", async () => {
    const { service, prisma } = makeService();

    await service.getUsers({
      identityIncomplete: true,
      isTestAccount: false,
    } as never);

    const [{ where }] = prisma.user.findMany.mock.calls[0];
    expect(where.AND).toEqual([legalIdentityIncompleteWhere()]);
    expect(where.isTestAccount).toBe(false);
    // Personel hâlâ listenin dışında.
    expect(where.adminUser).toBeNull();
  });

  it("filtre verilmezse kimlik koşulu eklenmez", async () => {
    const { service, prisma } = makeService();

    await service.getUsers({} as never);

    const [{ where }] = prisma.user.findMany.mock.calls[0];
    expect(where).not.toHaveProperty("AND");
  });
});
