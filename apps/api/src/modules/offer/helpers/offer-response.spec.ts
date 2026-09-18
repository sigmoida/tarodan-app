import { OfferStatus } from "@prisma/client";
import { unstampedTransitions } from "../../../common/helpers/stamped-transition.guard";
import { offerReacceptedData, offerRespondedData } from "./offer-response";

describe("offerRespondedData", () => {
  it("stamps the answer moment alongside the status", () => {
    const at = new Date("2026-05-02T09:00:00.000Z");
    expect(offerRespondedData(OfferStatus.accepted, at)).toEqual({
      status: OfferStatus.accepted,
      respondedAt: at,
    });
    expect(offerRespondedData(OfferStatus.rejected, at)).toEqual({
      status: OfferStatus.rejected,
      respondedAt: at,
    });
  });

  it("defaults to now so callers cannot forget the stamp", () => {
    const before = Date.now();
    expect(
      offerRespondedData(OfferStatus.rejected).respondedAt.getTime(),
    ).toBeGreaterThanOrEqual(before);
  });

  /**
   * Ödeme penceresi dolan teklifin yeniden açılması İKİNCİ bir cevap değildir:
   * anlaşma çok önce yapıldı. `respondedAt` ilk cevabın anında kalmalı, yoksa
   * "cevap süresi" ödeme gecikmesiyle şişerdi.
   */
  it("re-accepting a payment-expired offer does not re-stamp the answer", () => {
    expect(offerReacceptedData()).toEqual({ status: OfferStatus.accepted });
    expect(offerReacceptedData()).not.toHaveProperty("respondedAt");
  });

  it("is the ONLY way an offer is written to accepted or rejected", () => {
    expect(
      unstampedTransitions({
        delegate: "offer",
        statuses: ["accepted", "rejected"],
        enumName: "OfferStatus",
        helpers: ["offerRespondedData", "offerReacceptedData"],
      }),
    ).toEqual([]);
  });
});
