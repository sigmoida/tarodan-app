/** @format */

import { describe, expect, it } from "vitest";
import type { VirtualOrderPaymentFields } from "@tarodan/types";
import {
  paymentKind,
  paymentPagePath,
  paymentPurpose,
  paymentReturnRoutes,
  type PaymentKind,
} from "./paymentKind";

const BOOST_PAYMENT: VirtualOrderPaymentFields = {
  isBoostOrder: true,
  boost: {
    id: "boost-1",
    productId: "listing-1",
    productTitle: "Ferrari",
    endsAt: null,
  },
};
const MEMBERSHIP_PAYMENT: VirtualOrderPaymentFields = {
  isMembershipOrder: true,
};
const GOODS_PAYMENT: VirtualOrderPaymentFields = {};

describe("paymentKind", () => {
  // Before the payment loads (or when it cannot), the URL's `type` decides.
  it.each<[string | null | undefined, PaymentKind]>([
    ["boost", "boost"],
    ["membership", "membership"],
    [null, "checkout"],
    [undefined, "checkout"],
    ["", "checkout"],
    ["BOOST", "checkout"],
    ["trade", "checkout"],
  ])("type=%s without a loaded payment is %s", (type, kind) => {
    expect(paymentKind(type)).toBe(kind);
    expect(paymentKind(type, null)).toBe(kind);
  });

  // Once loaded, the API flags win over whatever the URL says.
  it.each<[string | null, VirtualOrderPaymentFields, PaymentKind]>([
    [null, BOOST_PAYMENT, "boost"],
    ["membership", BOOST_PAYMENT, "boost"],
    ["boost", BOOST_PAYMENT, "boost"],
    [null, { isBoostOrder: true, boost: null }, "boost"],
    [null, MEMBERSHIP_PAYMENT, "membership"],
    ["boost", MEMBERSHIP_PAYMENT, "membership"],
    [null, GOODS_PAYMENT, "checkout"],
    ["boost", GOODS_PAYMENT, "checkout"],
    ["membership", GOODS_PAYMENT, "checkout"],
  ])("type=%s with payment %j is %s", (type, payment, kind) => {
    expect(paymentKind(type, payment)).toBe(kind);
  });
});

describe("paymentPagePath", () => {
  it("names the kind of a virtual order and nothing for goods", () => {
    expect(paymentPagePath("p1", "boost")).toBe("/payment/p1?type=boost");
    expect(paymentPagePath("p1", "membership")).toBe(
      "/payment/p1?type=membership",
    );
    expect(paymentPagePath("p1", "checkout")).toBe("/payment/p1");
  });
});

describe("paymentPurpose", () => {
  it("takes membership on its own store and boost on the marketplace store", () => {
    expect(paymentPurpose("membership")).toBe("membership");
    expect(paymentPurpose("boost")).toBe("checkout");
    expect(paymentPurpose("checkout")).toBe("checkout");
  });
});

describe("paymentReturnRoutes", () => {
  it("checkout (member): result pages without a type; cart, orders otherwise", () => {
    expect(paymentReturnRoutes("checkout", { paymentId: "p1" })).toEqual({
      success: "/payment/success?paymentId=p1",
      fail: "/payment/fail?paymentId=p1",
      cancel: "/cart",
      exit: "/profile/orders",
      back: "/profile/orders",
      retry: "/profile/orders",
    });
  });

  it("checkout (guest): keeps guest=true and never sends a guest to an account page", () => {
    expect(
      paymentReturnRoutes("checkout", { paymentId: "p1", guest: true }),
    ).toEqual({
      success: "/payment/success?paymentId=p1&guest=true",
      fail: "/payment/fail?paymentId=p1&guest=true",
      cancel: "/",
      exit: "/",
      back: "/profile/orders",
      retry: "/listings",
    });
  });

  it("membership: its own success page (with the change kind) and the membership page", () => {
    expect(
      paymentReturnRoutes("membership", {
        paymentId: "p2",
        membershipChange: "upgrade",
      }),
    ).toEqual({
      success: "/membership/success?kind=upgrade",
      fail: "/payment/fail?paymentId=p2&type=membership",
      cancel: "/membership",
      exit: "/membership",
      back: "/membership",
      retry: "/membership",
    });
    expect(paymentReturnRoutes("membership", { paymentId: "p2" }).success).toBe(
      "/membership/success",
    );
  });

  it("boost: typed result pages, a cancelled view, My boosts and a retry that reopens the dialog", () => {
    expect(
      paymentReturnRoutes("boost", {
        paymentId: "p3",
        boostProductId: "listing-1",
      }),
    ).toEqual({
      success: "/payment/success?paymentId=p3&type=boost",
      fail: "/payment/fail?paymentId=p3&type=boost",
      cancel: "/payment/fail?paymentId=p3&type=boost&cancelled=true",
      exit: "/profile/boosts",
      back: "/profile/boosts",
      retry: "/profile/listings?boost=listing-1",
    });
  });

  it("boost without a known listing retries from My listings", () => {
    expect(paymentReturnRoutes("boost", { paymentId: "p3" }).retry).toBe(
      "/profile/listings",
    );
  });

  it.each<PaymentKind>(["boost", "membership"])(
    "%s never routes to /profile/orders, which hides virtual orders",
    (kind) => {
      for (const guest of [false, true]) {
        const routes = paymentReturnRoutes(kind, {
          paymentId: "p",
          guest,
          boostProductId: "l",
        });
        for (const href of Object.values(routes)) {
          expect(href).not.toContain("/profile/orders");
        }
      }
    },
  );

  it("omits the payment id when there is none", () => {
    expect(paymentReturnRoutes("boost", { paymentId: null }).fail).toBe(
      "/payment/fail?type=boost",
    );
    expect(paymentReturnRoutes("checkout", { paymentId: null }).success).toBe(
      "/payment/success",
    );
  });

  it("encodes ids it puts into a query", () => {
    expect(
      paymentReturnRoutes("boost", { paymentId: "a&b", boostProductId: "x y" }),
    ).toMatchObject({
      fail: "/payment/fail?paymentId=a%26b&type=boost",
      retry: "/profile/listings?boost=x%20y",
    });
  });
});
