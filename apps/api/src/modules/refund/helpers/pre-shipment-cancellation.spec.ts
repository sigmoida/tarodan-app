import {
  CancellationActor,
  OrderCancellationReason,
  RefundReason,
} from "@prisma/client";
import {
  buyerCancellationSpec,
  platformCancellationSpec,
} from "./pre-shipment-cancellation";

/**
 * Kargo öncesi iptalde "kim iptal etti"nin bütün sonuçları spec'te toplanır;
 * çekirdek dal içermez. Burada iki iptal edenin sözleşmesi sabitlenir.
 */
describe("pre-shipment cancellation specs", () => {
  it("alıcı iptali: aktör alıcı, duyuru yalnız satıcıya", () => {
    const spec = buyerCancellationSpec(
      "buyer-1",
      OrderCancellationReason.changed_mind,
      "  Vazgeçtim ",
    );

    expect(spec).toMatchObject({
      initiator: CancellationActor.buyer,
      requesterId: "buyer-1",
      actorId: "buyer-1",
      decidedBy: "system",
      reasonCode: OrderCancellationReason.changed_mind,
      description: "Vazgeçtim",
      cancelReason: "Vazgeçtim",
      requestReason: RefundReason.changed_mind,
      resolvedReason: RefundReason.changed_mind,
      faultParty: "buyer",
      notifyParties: ["seller"],
    });
  });

  it("alıcının gecikme iptali satıcı kusurudur; aktör yine alıcı", () => {
    const spec = buyerCancellationSpec(
      "buyer-1",
      OrderCancellationReason.delivery_delayed,
    );

    expect(spec).toMatchObject({
      initiator: CancellationActor.buyer,
      requestReason: RefundReason.other,
      resolvedReason: RefundReason.delivery_delayed,
      faultParty: "seller",
      cancelReason: OrderCancellationReason.delivery_delayed,
      notifyParties: ["seller"],
    });
  });

  it("platform iptali: aktör platform, talep alıcı adına, duyuru iki tarafa", () => {
    const spec = platformCancellationSpec(
      "buyer-1",
      "admin-1",
      "  Satıcı stoğu bitti ",
    );

    expect(spec).toMatchObject({
      initiator: CancellationActor.platform,
      requesterId: "buyer-1",
      actorId: "admin-1",
      decidedBy: "admin-1",
      reasonCode: null,
      description: "Satıcı stoğu bitti",
      cancelReason: "Satıcı stoğu bitti",
      requestReason: RefundReason.other,
      resolvedReason: RefundReason.other,
      faultParty: "platform",
      notifyParties: ["buyer", "seller"],
    });
    expect(spec.policy).toMatchObject({
      policyCode: "platform_cancellation",
      requiresAdminReview: false,
    });
  });
});
