import { shouldDeferSupersededOidFailure } from "./paytr-superseded-oid.guard";

/**
 * HIGH: retry bir ödemede `merchant_oid`'i döndürür ama ödeme SATIRINI yeniden
 * kullanır ve callback eşlemesi eski oid'leri `merchantOidHistory` üzerinden de
 * bulur. Gecikmiş/yeniden gönderilmiş bir "failed" bildirimi (attempt-1'e ait)
 * `processFailedPayment`'e düşüyordu; oradaki CAS `pending` VE `processing`'i kabul
 * ediyor ve — `confirmFailedFromClient` ile cron'ların aksine — canlı-çekim
 * guard'ı YOK. Senaryo: alıcının attempt-2 3DS'i uçarken eski failed geliyor →
 * ödeme `failed`, sipariş iptal, rezervasyon serbest → attempt-2 başarı callback'i
 * geldiğinde CAS `failed` görüp fulfillment'ı atlıyor → alıcıdan para çekilmiş,
 * sipariş iptal, MANUEL iade gerekiyor.
 */
describe("shouldDeferSupersededOidFailure", () => {
  const liveMeta = { lastChargeStartedAt: new Date().toISOString() };

  it("eski oid + canlı çekim → fail ERTELENİR", () => {
    expect(
      shouldDeferSupersededOidFailure({
        callbackOid: "OID1",
        currentOid: "OID2",
        chargeLive: true,
      }),
    ).toBe(true);
    void liveMeta;
  });

  it("güncel oid'e ait fail normal işlenir (canlı çekim olsa bile)", () => {
    // Bu bildirim gerçekten AKTİF denemenin sonucudur; ertelemek siparişi askıda bırakır.
    expect(
      shouldDeferSupersededOidFailure({
        callbackOid: "OID2",
        currentOid: "OID2",
        chargeLive: true,
      }),
    ).toBe(false);
  });

  it("eski oid ama canlı çekim yok → normal işlenir", () => {
    expect(
      shouldDeferSupersededOidFailure({
        callbackOid: "OID1",
        currentOid: "OID2",
        chargeLive: false,
      }),
    ).toBe(false);
  });

  it("güncel oid bilinmiyorsa engellenmez", () => {
    expect(
      shouldDeferSupersededOidFailure({
        callbackOid: "OID1",
        currentOid: null,
        chargeLive: true,
      }),
    ).toBe(false);
  });
});
