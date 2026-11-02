import { Logger } from "@nestjs/common";
import { OrderStatus } from "@prisma/client";
import { OrderGuestClaimService } from "./order-guest-claim.service";
import { OutboxHandlerRegistry } from "../../outbox/outbox-handler.registry";
import { PermanentOutboxError } from "../../outbox/outbox-errors";
import { OUTBOX_GUEST_ORDER_CLAIM } from "../../outbox/outbox.types";
import { RefundService } from "../../refund/refund.service";
import { InvoicingService } from "../../invoicing/invoicing.service";
import { InvoiceService } from "../../invoice/invoice.service";
import { SellerInvoiceService } from "../invoice/seller-invoice.service";

// Guest order claim (2026-11-02 guest claim plan, GC1). Runs the real claim
// service and the real reassign methods of the refund, invoicing, order
// summary and seller invoice services over a small in-memory database, so
// the assertions are about the resulting rows. Synthetic data only.

type Row = Record<string, any>;
type Where = Record<string, any>;

const SYSTEM_GUEST_EMAIL = "guest@tarodan.system";
const GUEST = "guest-user";
const BUYER = "buyer-1";
const BUYER_EMAIL = "buyer.one@example.test";
const OTHER = "buyer-2";
const SELLER = "seller-1";

function matches(row: Row, where: Where = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "OR") return (cond as Where[]).some((w) => matches(row, w));
    const value = row[key];
    if (cond !== null && typeof cond === "object" && !(cond instanceof Date)) {
      if ("in" in cond) return (cond.in as unknown[]).includes(value);
      if ("not" in cond) return value !== cond.not;
      if ("startsWith" in cond)
        return typeof value === "string" && value.startsWith(cond.startsWith);
    }
    return value === cond;
  });
}

const pick = (row: Row, select?: Record<string, unknown>): Row =>
  select
    ? Object.fromEntries(
        Object.keys(select)
          .filter((k) => k !== "orders")
          .map((k) => [k, row[k]]),
      )
    : { ...row };

interface State {
  users: Row[];
  orders: Row[];
  packages: Row[];
  groups: Row[];
  refundRequests: Row[];
  fiscalInvoices: Row[];
  orderSummaries: Row[];
  sellerInvoices: Row[];
  payments: Row[];
  ledgerEntries: Row[];
  consentRecords: Row[];
}

function createFakeDb(initial: State) {
  let state = structuredClone(initial);
  const events: string[] = [];
  /** Every model delegate touched, to prove what the claim never reads. */
  const touched = new Set<string>();

  const table = (key: keyof State, umbrellaKey?: string) => ({
    findUnique: jest.fn(
      async ({ where, select }: { where: Where; select?: any }) => {
        const row = state[key].find((r) => matches(r, where));
        return row ? pick(row, select) : null;
      },
    ),
    findFirst: jest.fn(async ({ where, select }: any) => {
      const rows = state[key]
        .filter((r) => matches(r, where))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return rows[0] ? pick(rows[0], select) : null;
    }),
    findMany: jest.fn(async ({ where, select }: any) =>
      state[key]
        .filter((r) => matches(r, where))
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
        .map((r) => {
          const out = pick(r, select);
          if (select?.orders && umbrellaKey) {
            out.orders = state.orders
              .filter(
                (o) =>
                  o[umbrellaKey] === r.id && matches(o, select.orders.where),
              )
              .slice(0, select.orders.take)
              .map((o) => ({ id: o.id }));
          }
          return out;
        }),
    ),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const hit = state[key].filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      if (hit.length > 0) events.push(`write:${key}`);
      return { count: hit.length };
    }),
  });

  const models = {
    user: table("users"),
    order: table("orders"),
    orderPackage: table("packages", "packageId"),
    checkoutGroup: table("groups", "checkoutGroupId"),
    refundRequest: table("refundRequests"),
    fiscalInvoice: table("fiscalInvoices"),
    invoice: table("orderSummaries"),
    sellerUploadedInvoice: table("sellerInvoices"),
    payment: table("payments"),
    ledgerEntry: table("ledgerEntries"),
    consentRecord: table("consentRecords"),
  };

  /** The candidate lock query, evaluated in JS. */
  const queryRaw = jest.fn(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      expect(sql).toContain("FOR UPDATE");
      expect(sql).toContain("ORDER BY id");
      const [guestId, email, userId] = values as string[];
      const norm = (v: unknown) =>
        typeof v === "string" ? v.trim().toLowerCase() : null;
      return state.orders
        .filter((o) => {
          const guestEmail = norm(o.shippingAddress?.guestEmail);
          return (
            (o.buyerId === guestId && guestEmail === norm(email)) ||
            (o.buyerId === userId && !!guestEmail)
          );
        })
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((o) => ({
          id: o.id,
          buyerId: o.buyerId,
          checkoutGroupId: o.checkoutGroupId,
          packageId: o.packageId,
          status: o.status,
        }));
    },
  );

  const tx: any = new Proxy(
    { ...models, $queryRaw: queryRaw },
    {
      get(target: any, prop: string) {
        if (prop in models) touched.add(prop);
        return target[prop];
      },
    },
  );

  const db: any = new Proxy(
    {
      ...models,
      $transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => {
        const snapshot = structuredClone(state);
        try {
          const result = await fn(tx);
          events.push("commit");
          return result;
        } catch (error) {
          state = snapshot; // rollback
          events.push("rollback");
          throw error;
        }
      }),
    },
    {
      get(target: any, prop: string) {
        if (prop in models) touched.add(prop);
        return target[prop];
      },
    },
  );

  return {
    db,
    queryRaw,
    events,
    touched,
    get state() {
      return state;
    },
  };
}

const user = (overrides: Row): Row => ({
  isEmailVerified: true,
  deletedAt: null,
  isTestAccount: false,
  ...overrides,
});

const guestAddress = (guestEmail: string) => ({
  fullName: "Guest Buyer",
  guestEmail,
  isGuestOrder: true,
});

/** One guest checkout: a group, a package and its orders on the guest. */
function baseState(): State {
  return {
    users: [
      user({ id: GUEST, email: SYSTEM_GUEST_EMAIL }),
      user({ id: BUYER, email: BUYER_EMAIL }),
      user({ id: OTHER, email: "buyer.two@example.test" }),
      user({ id: SELLER, email: "seller@example.test" }),
    ],
    orders: [
      {
        id: "o-1",
        buyerId: GUEST,
        sellerId: SELLER,
        checkoutGroupId: "g-1",
        packageId: "p-1",
        status: OrderStatus.delivered,
        shippingAddress: guestAddress(BUYER_EMAIL),
      },
      {
        id: "o-2",
        buyerId: GUEST,
        sellerId: SELLER,
        checkoutGroupId: "g-1",
        packageId: "p-1",
        status: OrderStatus.delivered,
        shippingAddress: guestAddress(BUYER_EMAIL),
      },
    ],
    packages: [{ id: "p-1", buyerId: GUEST, checkoutGroupId: "g-1" }],
    groups: [{ id: "g-1", buyerId: GUEST, isGuest: true }],
    refundRequests: [],
    fiscalInvoices: [],
    orderSummaries: [],
    sellerInvoices: [],
    payments: [],
    ledgerEntries: [{ id: "l-1", buyerId: GUEST, orderId: "o-1" }],
    consentRecords: [
      {
        id: "c-1",
        userId: null,
        guestEmail: BUYER_EMAIL,
        checkoutGroupId: "g-1",
      },
    ],
  };
}

function setup(initial: State = baseState()) {
  const fake = createFakeDb(initial);
  const registry = new OutboxHandlerRegistry();
  const payments = {
    verifyPaymentFromClient: jest.fn(async () => {
      fake.events.push("verify");
      return { completed: false, status: "pending" };
    }),
  };
  const sentry = { addBreadcrumb: jest.fn() };
  const none = undefined as never;
  const service = new OrderGuestClaimService(
    fake.db,
    registry,
    new RefundService(none, none, none, none, none, none),
    new InvoicingService(none, none, none, none),
    new InvoiceService(none, none, none, none),
    new SellerInvoiceService(none, none, none),
    payments as never,
    sentry as never,
  );
  return { service, fake, registry, payments, sentry };
}

/** Lets the fire-and-forget payment check finish. */
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};

const ownerOf = (rows: Row[], id: string) =>
  rows.find((r) => r.id === id)?.buyerId;

describe("OrderGuestClaimService.claimForUser", () => {
  let logs: string[];

  beforeEach(() => {
    logs = [];
    for (const level of ["log", "warn", "error"] as const) {
      jest
        .spyOn(Logger.prototype, level)
        .mockImplementation((...args: unknown[]) => {
          logs.push(args.map(String).join(" "));
        });
    }
  });

  afterEach(() => jest.restoreAllMocks());

  it("moves the orders, their package and their checkout group to the verified buyer (variant 1)", async () => {
    const { service, fake } = setup();

    const result = await service.claimForUser(BUYER);

    expect(result).toMatchObject({
      skipped: null,
      claimedOrderIds: ["o-1", "o-2"],
      packages: 1,
      checkoutGroups: 1,
      skippedPackageIds: [],
      skippedCheckoutGroupIds: [],
    });
    expect(fake.state.orders.map((o) => o.buyerId)).toEqual([BUYER, BUYER]);
    expect(ownerOf(fake.state.packages, "p-1")).toBe(BUYER);
    expect(ownerOf(fake.state.groups, "g-1")).toBe(BUYER);
    // Everything in one transaction.
    expect(fake.db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("moves the guest-era refund requests and the guest links of every invoice kind", async () => {
    const state = baseState();
    state.refundRequests = [
      { id: "rr-1", orderId: "o-1", requesterId: GUEST },
      // Opened by someone else (an admin acting as requester): untouched.
      { id: "rr-2", orderId: "o-2", requesterId: SELLER },
    ];
    state.fiscalInvoices = [
      {
        id: "f-1",
        type: "buyer_service_fee",
        sourceId: "p-1",
        recipientUserId: GUEST,
        buyerUserId: GUEST,
        recipientEmail: BUYER_EMAIL,
      },
      {
        id: "f-2",
        type: "seller_commission",
        sourceId: "p-1",
        recipientUserId: SELLER,
        buyerUserId: GUEST,
      },
      {
        id: "f-3",
        type: "penalty",
        sourceId: "rr-1",
        recipientUserId: GUEST,
        buyerUserId: GUEST,
      },
      {
        id: "f-4",
        type: "return_invoice",
        sourceId: "f-1:attempt-1",
        recipientUserId: GUEST,
        buyerUserId: GUEST,
      },
    ];
    state.orderSummaries = [{ id: "i-1", orderId: "o-1", buyerId: GUEST }];
    state.sellerInvoices = [{ id: "s-1", orderId: "o-2", buyerId: GUEST }];
    const { service, fake } = setup(state);

    const result = await service.claimForUser(BUYER);

    expect(result).toMatchObject({
      refundRequests: 1,
      fiscalInvoiceRecipientLinks: 3,
      fiscalInvoiceBuyerLinks: 4,
      orderSummaries: 1,
      sellerInvoices: 1,
    });
    expect(fake.state.refundRequests).toEqual([
      { id: "rr-1", orderId: "o-1", requesterId: BUYER },
      { id: "rr-2", orderId: "o-2", requesterId: SELLER },
    ]);
    expect(
      fake.state.fiscalInvoices.map((f) => [
        f.id,
        f.recipientUserId,
        f.buyerUserId,
      ]),
    ).toEqual([
      ["f-1", BUYER, BUYER],
      ["f-2", SELLER, BUYER],
      ["f-3", BUYER, BUYER],
      ["f-4", BUYER, BUYER],
    ]);
    // The document snapshot is never rewritten.
    expect(fake.state.fiscalInvoices[0].recipientEmail).toBe(BUYER_EMAIL);
    expect(ownerOf(fake.state.orderSummaries, "i-1")).toBe(BUYER);
    expect(ownerOf(fake.state.sellerInvoices, "s-1")).toBe(BUYER);
  });

  it("matches the guest e-mail case-insensitively and ignoring surrounding spaces", async () => {
    const state = baseState();
    state.orders[0].shippingAddress = guestAddress("  Buyer.ONE@Example.TEST ");
    state.orders[1].shippingAddress = guestAddress("BUYER.one@example.test");
    const { service, fake } = setup(state);

    await service.claimForUser(BUYER);

    expect(fake.state.orders.map((o) => o.buyerId)).toEqual([BUYER, BUYER]);
  });

  it("leaves the guest orders of another e-mail on the guest", async () => {
    const state = baseState();
    state.orders.push({
      id: "o-3",
      buyerId: GUEST,
      sellerId: SELLER,
      checkoutGroupId: "g-2",
      packageId: "p-2",
      status: OrderStatus.delivered,
      shippingAddress: guestAddress("someone.else@example.test"),
    });
    state.packages.push({ id: "p-2", buyerId: GUEST, checkoutGroupId: "g-2" });
    state.groups.push({ id: "g-2", buyerId: GUEST, isGuest: true });
    const { service, fake } = setup(state);

    const result = await service.claimForUser(BUYER);

    expect(result.claimedOrderIds).toEqual(["o-1", "o-2"]);
    expect(ownerOf(fake.state.orders, "o-3")).toBe(GUEST);
    expect(ownerOf(fake.state.packages, "p-2")).toBe(GUEST);
    expect(ownerOf(fake.state.groups, "g-2")).toBe(GUEST);
  });

  it("does not move a group or package that holds another buyer's order, and reports it by id", async () => {
    const state = baseState();
    state.orders[1].buyerId = OTHER;
    state.orders[1].shippingAddress = guestAddress("buyer.two@example.test");
    state.fiscalInvoices = [
      {
        id: "f-1",
        type: "buyer_service_fee",
        sourceId: "p-1",
        recipientUserId: GUEST,
        buyerUserId: GUEST,
      },
    ];
    const { service, fake } = setup(state);

    const result = await service.claimForUser(BUYER);

    expect(ownerOf(fake.state.orders, "o-1")).toBe(BUYER);
    expect(ownerOf(fake.state.packages, "p-1")).toBe(GUEST);
    expect(ownerOf(fake.state.groups, "g-1")).toBe(GUEST);
    expect(result).toMatchObject({
      packages: 0,
      checkoutGroups: 0,
      skippedPackageIds: ["p-1"],
      skippedCheckoutGroupIds: ["g-1"],
    });
    // The package's documents stay with the package.
    expect(fake.state.fiscalInvoices[0].recipientUserId).toBe(GUEST);
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.stringContaining("checkout group g-1 on the system guest"),
        expect.stringContaining("package p-1 on the system guest"),
      ]),
    );
  });

  it("heals an earlier partial claim: the umbrellas and related rows follow the orders (variant 2)", async () => {
    const state = baseState();
    // The old registration claim moved only order.buyerId.
    state.orders.forEach((o) => (o.buyerId = BUYER));
    state.refundRequests = [{ id: "rr-1", orderId: "o-1", requesterId: GUEST }];
    state.fiscalInvoices = [
      {
        id: "f-1",
        type: "buyer_commission",
        sourceId: "p-1",
        recipientUserId: GUEST,
        buyerUserId: GUEST,
      },
    ];
    const { service, fake } = setup(state);

    const result = await service.claimForUser(BUYER);

    expect(result).toMatchObject({
      claimedOrderIds: [],
      packages: 1,
      checkoutGroups: 1,
      refundRequests: 1,
      fiscalInvoiceRecipientLinks: 1,
      fiscalInvoiceBuyerLinks: 1,
      pendingPaymentOrderIds: [],
    });
    expect(ownerOf(fake.state.packages, "p-1")).toBe(BUYER);
    expect(ownerOf(fake.state.groups, "g-1")).toBe(BUYER);
    expect(fake.state.refundRequests[0].requesterId).toBe(BUYER);
  });

  it.each([
    ["unverified", { isEmailVerified: false }],
    ["deleted", { deletedAt: new Date("2026-10-01T00:00:00Z") }],
    ["test-lane", { isTestAccount: true }],
  ])("claims nothing for a %s user and writes nothing", async (_, patch) => {
    const state = baseState();
    Object.assign(state.users[1], patch);
    const { service, fake } = setup(state);

    await expect(service.claimForUser(BUYER)).resolves.toMatchObject({
      skipped: "not_eligible",
      claimedOrderIds: [],
    });
    expect(fake.queryRaw).not.toHaveBeenCalled();
    expect(fake.events).toEqual(["commit"]);
    expect(fake.state).toEqual(state);
  });

  it("claims nothing for a missing user or the system guest itself", async () => {
    const { service, fake } = setup();

    await expect(service.claimForUser("missing")).resolves.toMatchObject({
      skipped: "not_eligible",
    });
    await expect(service.claimForUser(GUEST)).resolves.toMatchObject({
      skipped: "not_eligible",
    });
    expect(fake.queryRaw).not.toHaveBeenCalled();
  });

  it("is a no-op without a system guest user (fresh database)", async () => {
    const state = baseState();
    state.users = state.users.filter((u) => u.id !== GUEST);
    const { service, fake } = setup(state);

    await expect(service.claimForUser(BUYER)).resolves.toMatchObject({
      skipped: "no_system_guest",
    });
    expect(fake.queryRaw).not.toHaveBeenCalled();
  });

  it("is a no-op with no write for a user without guest orders", async () => {
    const { service, fake } = setup();

    const result = await service.claimForUser(OTHER);

    expect(result).toMatchObject({ skipped: null, claimedOrderIds: [] });
    expect(fake.events).toEqual(["commit"]);
    expect(logs).toEqual([]);
  });

  it("is idempotent: a second run moves nothing and writes nothing", async () => {
    const state = baseState();
    state.refundRequests = [{ id: "rr-1", orderId: "o-1", requesterId: GUEST }];
    const { service, fake } = setup(state);

    await service.claimForUser(BUYER);
    const after = structuredClone(fake.state);
    fake.events.length = 0;

    const second = await service.claimForUser(BUYER);

    expect(second).toMatchObject({
      claimedOrderIds: [],
      packages: 0,
      checkoutGroups: 0,
      refundRequests: 0,
      fiscalInvoiceRecipientLinks: 0,
      fiscalInvoiceBuyerLinks: 0,
      orderSummaries: 0,
      sellerInvoices: 0,
    });
    expect(fake.events).toEqual(["commit"]);
    expect(fake.state).toEqual(after);
  });

  it("never touches the ledger, consent records, the shipping snapshot or isGuest", async () => {
    const state = baseState();
    const { service, fake } = setup(state);

    await service.claimForUser(BUYER);

    expect(fake.touched.has("ledgerEntry")).toBe(false);
    expect(fake.touched.has("consentRecord")).toBe(false);
    expect(fake.state.ledgerEntries).toEqual(state.ledgerEntries);
    expect(fake.state.consentRecords).toEqual(state.consentRecords);
    expect(fake.state.orders.map((o) => o.shippingAddress)).toEqual(
      state.orders.map((o) => o.shippingAddress),
    );
    expect(fake.state.groups[0].isGuest).toBe(true);
  });

  it("rolls everything back and throws when a step fails (the outbox retries)", async () => {
    const state = baseState();
    const { service, fake } = setup(state);
    fake.db.refundRequest.updateMany.mockRejectedValueOnce(new Error("db"));

    await expect(service.claimForUser(BUYER)).rejects.toThrow("db");
    expect(fake.events).toContain("rollback");
    expect(fake.state).toEqual(state);
  });

  it("logs ids and counts, never the e-mail", async () => {
    const state = baseState();
    state.orders[1].buyerId = OTHER;
    const { service, sentry } = setup(state);

    await service.claimForUser(BUYER);

    expect(logs.length).toBeGreaterThan(0);
    expect(logs.join("\n")).toContain(`user=${BUYER}`);
    expect(logs.join("\n")).not.toMatch(/@/);
    expect(JSON.stringify(sentry.addBreadcrumb.mock.calls)).not.toMatch(/@/);
  });

  describe("payment check of claimed orders still waiting for payment", () => {
    const pendingState = () => {
      const state = baseState();
      state.orders.forEach((o) => (o.status = OrderStatus.pending_payment));
      state.orders.push({
        id: "o-3",
        buyerId: GUEST,
        sellerId: SELLER,
        checkoutGroupId: null,
        packageId: null,
        status: OrderStatus.delivered,
        shippingAddress: guestAddress(BUYER_EMAIL),
      });
      state.payments = [
        {
          id: "pay-old",
          orderId: null,
          checkoutGroupId: "g-1",
          status: "failed",
          createdAt: new Date("2026-10-01T00:00:00Z"),
        },
        {
          id: "pay-group",
          orderId: null,
          checkoutGroupId: "g-1",
          status: "pending",
          createdAt: new Date("2026-10-02T00:00:00Z"),
        },
      ];
      return state;
    };

    it("asks PayTR once per pending payment, after the commit", async () => {
      const { service, fake, payments } = setup(pendingState());

      const result = await service.claimForUser(BUYER);
      await settle();

      expect(result.pendingPaymentOrderIds).toEqual(["o-1", "o-2"]);
      // One group payment for the two orders; the delivered order is not asked.
      expect(payments.verifyPaymentFromClient).toHaveBeenCalledTimes(1);
      expect(payments.verifyPaymentFromClient).toHaveBeenCalledWith(
        "pay-group",
        { internal: true },
      );
      expect(fake.events.indexOf("commit")).toBeLessThan(
        fake.events.indexOf("verify"),
      );
    });

    it("never asks PayTR when verifyPendingPayments is false (the repair script)", async () => {
      const { service, payments } = setup(pendingState());

      await service.claimForUser(BUYER, { verifyPendingPayments: false });
      await settle();

      expect(payments.verifyPaymentFromClient).not.toHaveBeenCalled();
    });

    it("does not ask again for orders claimed by an earlier run", async () => {
      const { service, payments } = setup(pendingState());

      await service.claimForUser(BUYER, { verifyPendingPayments: false });
      await service.claimForUser(BUYER);
      await settle();

      expect(payments.verifyPaymentFromClient).not.toHaveBeenCalled();
    });

    it("a failing PayTR check never fails the claim", async () => {
      const { service, payments } = setup(pendingState());
      payments.verifyPaymentFromClient.mockRejectedValueOnce(
        new Error("paytr down"),
      );

      await expect(service.claimForUser(BUYER)).resolves.toMatchObject({
        claimedOrderIds: ["o-1", "o-2", "o-3"],
      });
      await settle();

      expect(logs).toEqual(
        expect.arrayContaining([
          expect.stringContaining("payment check failed for order o-1"),
        ]),
      );
    });
  });
});

describe("OrderGuestClaimService outbox handler", () => {
  it(`registers ${OUTBOX_GUEST_ORDER_CLAIM} and claims for the payload's user`, async () => {
    const { service, registry } = setup();
    const claim = jest
      .spyOn(service, "claimForUser")
      .mockResolvedValue({} as never);

    service.onModuleInit();
    const handler = registry.get(OUTBOX_GUEST_ORDER_CLAIM);
    await handler!({ userId: BUYER }, {} as never);

    expect(claim).toHaveBeenCalledWith(BUYER);
  });

  it("refuses a payload without a user id permanently (no retries)", async () => {
    const { service, registry } = setup();
    service.onModuleInit();

    await expect(
      registry.get(OUTBOX_GUEST_ORDER_CLAIM)!({}, {} as never),
    ).rejects.toBeInstanceOf(PermanentOutboxError);
  });

  it("lets a claim failure reach the outbox, which retries", async () => {
    const { service, registry } = setup();
    jest
      .spyOn(service, "claimForUser")
      .mockRejectedValue(new Error("deadlock"));
    service.onModuleInit();

    await expect(
      registry.get(OUTBOX_GUEST_ORDER_CLAIM)!({ userId: BUYER }, {} as never),
    ).rejects.toThrow("deadlock");
  });
});
