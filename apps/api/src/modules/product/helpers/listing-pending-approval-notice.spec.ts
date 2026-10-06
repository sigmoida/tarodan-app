import { ProductStatus } from "@prisma/client";
import { emitListingPendingApproval } from "./listing-pending-approval-notice";

describe("emitListingPendingApproval — listing.pendingApproval", () => {
  const product = (patch: Record<string, unknown> = {}) => ({
    status: ProductStatus.pending,
    productCode: "U10042",
    title: "1:43 Porsche 911",
    price: 850,
    seller: {
      username: "modelci",
      displayName: null,
      companyName: null,
      isTestAccount: false,
    },
    ...patch,
  });

  const build = (row: ReturnType<typeof product> | null) => {
    const prisma = {
      product: { findUnique: jest.fn().mockResolvedValue(row) },
    };
    const notifier = { emit: jest.fn().mockResolvedValue(undefined) };
    return { prisma, notifier };
  };

  it("hâlâ onay bekleyen ilanı ilan kodu ve panel linkiyle bildirir", async () => {
    const { prisma, notifier } = build(product());

    await emitListingPendingApproval(
      prisma as never,
      notifier as never,
      "p-1",
      "submitted",
    );

    expect(notifier.emit).toHaveBeenCalledWith(
      "listing.pendingApproval",
      expect.objectContaining({
        ref: "U10042",
        adminPath: "/catalog/products/p-1",
      }),
      { isTest: false, dedupeKey: "p-1:submitted" },
    );
  });

  it("AI oto-onayladıysa (artık pending değil) bildirmez", async () => {
    const { prisma, notifier } = build(
      product({ status: ProductStatus.active }),
    );

    await emitListingPendingApproval(
      prisma as never,
      notifier as never,
      "p-1",
      "submitted",
    );

    expect(notifier.emit).not.toHaveBeenCalled();
  });

  it("test hesabının ilanı test şeridi olarak işaretlenir (notifier atlar)", async () => {
    const { prisma, notifier } = build(
      product({
        seller: {
          username: "t",
          displayName: null,
          companyName: null,
          isTestAccount: true,
        },
      }),
    );

    await emitListingPendingApproval(
      prisma as never,
      notifier as never,
      "p-1",
      "submitted",
    );

    expect(notifier.emit.mock.calls[0][2]).toMatchObject({ isTest: true });
  });

  it("notifier yoksa ya da okuma patlarsa sessizce geçer", async () => {
    const { prisma } = build(product());
    await expect(
      emitListingPendingApproval(prisma as never, undefined, "p-1", "x"),
    ).resolves.toBeUndefined();

    prisma.product.findUnique.mockRejectedValue(new Error("db down"));
    await expect(
      emitListingPendingApproval(
        prisma as never,
        { emit: jest.fn() } as never,
        "p-1",
        "x",
      ),
    ).resolves.toBeUndefined();
  });
});
