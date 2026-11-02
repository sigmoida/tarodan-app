import { reassignGuestInvoiceLinks } from "./guest-claim-links";

type Doc = {
  id: string;
  type: string;
  sourceId: string;
  recipientUserId: string | null;
  buyerUserId: string | null;
  recipientEmail: string | null;
  invoiceNumber: string | null;
};

type Where = Record<string, any>;

/** Evaluates the subset of Prisma filters the function uses. */
function matches(doc: Doc, where: Where): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "OR") return (cond as Where[]).some((w) => matches(doc, w));
    const value = (doc as Record<string, unknown>)[key];
    if (cond && typeof cond === "object") {
      if ("in" in cond) return (cond.in as unknown[]).includes(value);
      if ("startsWith" in cond)
        return typeof value === "string" && value.startsWith(cond.startsWith);
    }
    return value === cond;
  });
}

function fakeTx(docs: Doc[]) {
  return {
    fiscalInvoice: {
      findMany: jest.fn(async ({ where }: { where: Where }) =>
        docs.filter((d) => matches(d, where)).map((d) => ({ id: d.id })),
      ),
      updateMany: jest.fn(
        async ({ where, data }: { where: Where; data: Partial<Doc> }) => {
          const hit = docs.filter((d) => matches(d, where));
          hit.forEach((d) => Object.assign(d, data));
          return { count: hit.length };
        },
      ),
    },
  };
}

const GUEST = "guest-user";
const USER = "claimer";
const OTHER = "other-buyer";
const SELLER = "seller-1";

const doc = (overrides: Partial<Doc> & Pick<Doc, "id">): Doc => ({
  type: "buyer_service_fee",
  sourceId: "pkg-1",
  recipientUserId: GUEST,
  buyerUserId: GUEST,
  recipientEmail: "buyer@example.test",
  invoiceNumber: `KYT-${overrides.id}`,
  ...overrides,
});

describe("reassignGuestInvoiceLinks", () => {
  const input = {
    guestUserId: GUEST,
    userId: USER,
    packageOrOrderIds: ["order-1", "pkg-1"],
    refundRequestIds: ["rr-1"],
  };

  it("moves the buyer-addressed documents of the claimed package and order to the account", async () => {
    const docs = [
      doc({ id: "f1", type: "buyer_service_fee", sourceId: "pkg-1" }),
      doc({ id: "f2", type: "platform_sale", sourceId: "order-1" }),
    ];
    const tx = fakeTx(docs);

    await expect(
      reassignGuestInvoiceLinks(tx as never, input),
    ).resolves.toEqual({ recipientLinks: 2, buyerLinks: 2 });
    expect(docs.map((d) => [d.recipientUserId, d.buyerUserId])).toEqual([
      [USER, USER],
      [USER, USER],
    ]);
  });

  it("moves only the buyer link of a seller-addressed document", async () => {
    const docs = [
      doc({
        id: "f1",
        type: "seller_commission",
        recipientUserId: SELLER,
      }),
    ];

    await expect(
      reassignGuestInvoiceLinks(fakeTx(docs) as never, input),
    ).resolves.toEqual({ recipientLinks: 0, buyerLinks: 1 });
    expect(docs[0]).toMatchObject({
      recipientUserId: SELLER,
      buyerUserId: USER,
    });
  });

  it("moves a penalty document keyed on a claimed refund request", async () => {
    const docs = [doc({ id: "f1", type: "penalty", sourceId: "rr-1" })];

    await reassignGuestInvoiceLinks(fakeTx(docs) as never, input);

    expect(docs[0]).toMatchObject({ recipientUserId: USER, buyerUserId: USER });
  });

  it("moves the return invoices of a moved document, full and partial", async () => {
    const docs = [
      doc({ id: "f1", type: "buyer_service_fee", sourceId: "pkg-1" }),
      doc({ id: "r1", type: "return_invoice", sourceId: "f1" }),
      doc({ id: "r2", type: "return_invoice", sourceId: "f1:attempt-1" }),
    ];

    await expect(
      reassignGuestInvoiceLinks(fakeTx(docs) as never, input),
    ).resolves.toEqual({ recipientLinks: 3, buyerLinks: 3 });
  });

  it("leaves documents of other sources, other buyers and the snapshot alone", async () => {
    const docs = [
      // Another guest order (another e-mail): not in the claimed ids.
      doc({ id: "f1", sourceId: "pkg-other" }),
      // A package id used by a document type that keys on something else.
      doc({ id: "f2", type: "boost", sourceId: "pkg-1" }),
      // A refund request id under a package type is not a penalty source.
      doc({ id: "f3", type: "buyer_service_fee", sourceId: "rr-1" }),
      // Already on another account: never re-pointed.
      doc({
        id: "f4",
        sourceId: "order-1",
        type: "platform_sale",
        recipientUserId: OTHER,
        buyerUserId: OTHER,
      }),
      // Return invoice of a document that does not move.
      doc({ id: "r1", type: "return_invoice", sourceId: "f1:attempt-1" }),
    ];
    const before = structuredClone(docs);

    await expect(
      reassignGuestInvoiceLinks(fakeTx(docs) as never, input),
    ).resolves.toEqual({ recipientLinks: 0, buyerLinks: 0 });
    expect(docs).toEqual(before);
  });

  it("never writes the recipient snapshot, number or e-mail", async () => {
    const docs = [doc({ id: "f1" })];
    const tx = fakeTx(docs);

    await reassignGuestInvoiceLinks(tx as never, input);

    const written = tx.fiscalInvoice.updateMany.mock.calls.map(([{ data }]) =>
      Object.keys(data),
    );
    expect(written).toEqual([["recipientUserId"], ["buyerUserId"]]);
    expect(docs[0]).toMatchObject({
      recipientEmail: "buyer@example.test",
      invoiceNumber: "KYT-f1",
    });
  });

  it("is idempotent: a second run moves nothing", async () => {
    const docs = [doc({ id: "f1" })];
    const tx = fakeTx(docs);

    await reassignGuestInvoiceLinks(tx as never, input);

    await expect(
      reassignGuestInvoiceLinks(tx as never, input),
    ).resolves.toEqual({ recipientLinks: 0, buyerLinks: 0 });
  });

  it("reads and writes nothing without ids", async () => {
    const tx = fakeTx([]);

    await expect(
      reassignGuestInvoiceLinks(tx as never, {
        ...input,
        packageOrOrderIds: [],
        refundRequestIds: [],
      }),
    ).resolves.toEqual({ recipientLinks: 0, buyerLinks: 0 });
    expect(tx.fiscalInvoice.findMany).not.toHaveBeenCalled();
    expect(tx.fiscalInvoice.updateMany).not.toHaveBeenCalled();
  });
});
