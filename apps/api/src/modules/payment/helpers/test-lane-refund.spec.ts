import {
  TEST_LANE_REFUND_PREFIX,
  testLaneRefundReference,
  testLaneRefundResult,
} from "./test-lane-refund";

/**
 * Test şeridi iadesinin sentetik sağlayıcı yanıtı. İade servisleri
 * `providerRefundId`'yi `paymentId || merchant_oid`den çözer; referans oraya
 * yazılmazsa deneme satırı referanssız kalır ve mutabakat onu gerçek PayTR
 * iadesinden ayıramaz.
 */
describe("test lane refund result", () => {
  it("builds a prefixed reference from the attempt id", () => {
    expect(testLaneRefundReference("att-1")).toBe("TEST-REFUND-att-1");
    expect(TEST_LANE_REFUND_PREFIX).toBe("TEST-REFUND-");
  });

  it("is a success carrying the synthetic reference where providerRefundId is read", () => {
    const result = testLaneRefundResult("att-1", 125.5);
    expect(result).toEqual({
      status: "success",
      err_msg: null,
      return_amount: 125.5,
      paymentId: "TEST-REFUND-att-1",
      testLane: true,
    });
    const providerRefundId =
      (result.paymentId as string | undefined) ||
      (result.merchant_oid as string | undefined) ||
      null;
    expect(providerRefundId).toBe("TEST-REFUND-att-1");
  });
});
