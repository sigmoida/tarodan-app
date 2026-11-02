/**
 * Guest order claim on a verified e-mail (2026-11-02 guest claim plan, GC1).
 *
 * Regression: "buyer group list is empty after a guest order claim". Guest
 * checkout writes the checkout group, the package and the orders on the
 * shared system guest user. The old registration claim moved only
 * `order.buyerId`, and social sign-up claimed nothing, so
 * `GET /orders/groups` (which lists by `CheckoutGroup.buyerId`) stayed empty
 * and the buyer could not open the order or start a return.
 *
 * - ORD-245 (variant 2, e-mail registration): nothing moves at registration;
 *   verifying the e-mail claims the orders with their group and package.
 * - ORD-246 (variant 1, the reported case): a Google sign-up whose verified
 *   e-mail is the guest e-mail claims them in the sign-up, before the first
 *   session. Only Google's token check is stubbed (it cannot run here);
 *   `POST /api/auth/google` and everything behind it are real.
 *
 * Synthetic data only.
 */
import * as request from "supertest";
import * as crypto from "crypto";
import { randomUUID } from "crypto";
import { createE2ETestApp, E2ETestApp } from "../test-utils/create-app";
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from "../test-utils/db";
import { createUser, authHeader } from "../factories/user.factory";
import { createProduct } from "../factories/product.factory";
import { scenario } from "../test-utils/scenario";
import { getLastEmailTo, extractCode, clearMailbox } from "../test-utils/mail";
import { GoogleAuthService } from "../../src/modules/auth/social/google-auth.service";

const SYSTEM_GUEST_EMAIL = "guest@tarodan.system";

describe("Guest order claim on a verified e-mail (E2E)", () => {
  let ctx: E2ETestApp;
  let baseline: { categoryId: string };
  const server = () => ctx.app.getHttpServer();
  const prisma = getPrisma();

  beforeAll(async () => {
    ctx = await createE2ETestApp();
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await ctx.close();
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await truncateAll();
    baseline = await seedBaseline();
    ctx.paytr.reset();
    ctx.surat.reset();
    await clearMailbox();
  });

  /** A cart checkout as a guest with an OTP-verified e-mail. */
  async function guestCheckout(email: string): Promise<string> {
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 250,
    });
    await request(server())
      .post("/api/orders/guest/send-verification-code")
      .send({ email })
      .expect(200);
    const code = extractCode((await getLastEmailTo(email)).body, 6);
    const tariff = await prisma.shippingTariff.findFirst({
      where: { provider: "surat", status: "active" },
      select: { version: true },
    });
    const rules = await prisma.commissionRuleSet.findFirstOrThrow({
      where: { status: "ACTIVE" },
      select: { id: true, version: true },
    });
    const res = await request(server())
      .post("/api/orders/checkout/guest")
      .send({
        items: [{ productId: product.id }],
        idempotencyKey: randomUUID(),
        email,
        emailVerificationCode: code,
        phone: "+905551234567",
        guestName: "Guest Buyer",
        expectedShippingTariffVersion: tariff?.version ?? 1,
        expectedCommissionRuleSetId: rules.id,
        expectedCommissionRuleSetVersion: rules.version,
        shippingAddress: {
          fullName: "Guest Buyer",
          phone: "+905551234567",
          city: "Istanbul",
          district: "Kadikoy",
          address: "Example Street 1",
        },
      })
      .expect(201);
    return res.body.checkoutGroupId as string;
  }

  /** Owners of the group, its packages and its orders. */
  async function owners(groupId: string) {
    const group = await prisma.checkoutGroup.findUniqueOrThrow({
      where: { id: groupId },
      select: {
        buyerId: true,
        isGuest: true,
        packages: { select: { buyerId: true } },
        orders: { select: { buyerId: true, shippingAddress: true } },
      },
    });
    return {
      group: group.buyerId,
      isGuest: group.isGuest,
      packages: [...new Set(group.packages.map((p) => p.buyerId))],
      orders: [...new Set(group.orders.map((o) => o.buyerId))],
      guestEmails: group.orders.map(
        (o) => (o.shippingAddress as { guestEmail?: string }).guestEmail,
      ),
    };
  }

  async function systemGuestId(): Promise<string> {
    const guest = await prisma.user.findUniqueOrThrow({
      where: { email: SYSTEM_GUEST_EMAIL },
      select: { id: true },
    });
    return guest.id;
  }

  /** The buyer sees the group in the list and opens it as the buyer. */
  async function expectBuyerSeesGroup(
    accessToken: string,
    groupId: string,
  ): Promise<void> {
    const list = await request(server())
      .get("/api/orders/groups")
      .set(authHeader({ accessToken }))
      .expect(200);
    expect(list.body.data.map((g: { id: string }) => g.id)).toContain(groupId);

    const detail = await request(server())
      .get(`/api/orders/groups/${groupId}`)
      .set(authHeader({ accessToken }))
      .expect(200);
    expect(detail.body.viewerRole).toBe("buyer");
  }

  async function expectOtherUserRefused(groupId: string): Promise<void> {
    const other = await createUser(ctx.module);
    await request(server())
      .get(`/api/orders/groups/${groupId}`)
      .set(authHeader(other))
      .expect(403);
    const list = await request(server())
      .get("/api/orders/groups")
      .set(authHeader(other))
      .expect(200);
    expect(list.body.data).toEqual([]);
  }

  scenario("ORD-245", async () => {
    const email = `claim-register-${Date.now()}@example.test`;
    const groupId = await guestCheckout(email);
    const guestId = await systemGuestId();

    await request(server())
      .post("/api/auth/register")
      .send({
        username: `claimer${Date.now() % 100000}`,
        // Another spelling of the same address: the match ignores case.
        email: email.toUpperCase(),
        password: "SecurePass123!",
        displayName: "Claiming Buyer",
      })
      .expect(201);
    const user = await prisma.user.findFirstOrThrow({
      where: { email: email.toUpperCase() },
      select: { id: true, isEmailVerified: true },
    });
    expect(user.isEmailVerified).toBe(false);

    // Before verification nothing moves (an unproven registrant holds nothing).
    expect(await owners(groupId)).toMatchObject({
      group: guestId,
      packages: [guestId],
      orders: [guestId],
    });

    // Verify through the link (token stored as its sha256, as the service does).
    const raw = crypto.randomBytes(32).toString("hex");
    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        token: crypto.createHash("sha256").update(raw).digest("hex"),
        email: email.toUpperCase(),
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    await request(server())
      .post("/api/auth/verify-email")
      .send({ token: raw })
      .expect(200);

    // The claim ran right after the verification committed.
    expect(await owners(groupId)).toEqual({
      group: user.id,
      isGuest: true,
      packages: [user.id],
      orders: [user.id],
      guestEmails: expect.arrayContaining([email]),
    });

    const login = await request(server())
      .post("/api/auth/login")
      .send({ email: email.toUpperCase(), password: "SecurePass123!" })
      .expect(200);
    await expectBuyerSeesGroup(login.body.tokens.accessToken, groupId);
    await expectOtherUserRefused(groupId);

    // A second verification attempt with the spent link changes nothing.
    await request(server())
      .post("/api/auth/verify-email")
      .send({ token: raw })
      .expect(200);
    expect((await owners(groupId)).group).toBe(user.id);
  });

  scenario("ORD-246", async () => {
    const email = `claim-social-${Date.now()}@example.test`;
    const groupId = await guestCheckout(email);
    const guestId = await systemGuestId();
    expect((await owners(groupId)).group).toBe(guestId);

    // Google verified the address; only its token check is stubbed.
    jest
      .spyOn(ctx.app.get(GoogleAuthService), "verifyIdToken")
      .mockResolvedValue({
        sub: `google-sub-${Date.now()}`,
        email,
        name: "Social Buyer",
      } as never);
    const signIn = await request(server())
      .post("/api/auth/google")
      .send({ idToken: "stubbed-google-id-token" })
      .expect(200);
    const userId: string = signIn.body.user.id;
    const accessToken: string = signIn.body.tokens.accessToken;

    // Claimed inside the sign-up, before the first session was returned.
    expect(await owners(groupId)).toMatchObject({
      group: userId,
      packages: [userId],
      orders: [userId],
    });
    await expectBuyerSeesGroup(accessToken, groupId);
    await expectOtherUserRefused(groupId);

    // The claim request is a completed outbox row (ran inline).
    const rows = await prisma.outboxEvent.findMany({
      where: { type: "guest_order.claim" },
      select: { status: true, payload: true },
    });
    expect(rows).toEqual([{ status: "completed", payload: { userId } }]);
  });
});
