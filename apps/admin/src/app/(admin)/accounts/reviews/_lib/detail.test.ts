import { describe, expect, it } from "vitest";
import {
  normalizeReviewImages,
  toProductReviewDetail,
  toSellerReviewDetail,
} from "./detail";
import type { Review, UserRating } from "./types";

const person = { id: "u1", displayName: "Ayse", email: "a@x.com" };

const review: Review = {
  id: "r1",
  score: 4,
  title: "Great",
  review: "Arrived as described.",
  status: "pending",
  adminReply: "Thanks",
  images: ["https://cdn/x.jpg", { url: "https://cdn/y.jpg" }],
  orderId: "order-123456789",
  sellerId: "seller-1",
  createdAt: "2026-10-01T10:00:00Z",
  isVerifiedPurchase: true,
  user: person,
  product: { id: "p1", title: "Model Araba", images: [] },
};

describe("normalizeReviewImages", () => {
  it("accepts plain urls and { url } objects and drops empties", () => {
    expect(
      normalizeReviewImages(["a", { url: "b" }, "", { url: "" }]),
    ).toEqual(["a", "b"]);
  });

  it("is empty for missing images", () => {
    expect(normalizeReviewImages(undefined)).toEqual([]);
    expect(normalizeReviewImages(null)).toEqual([]);
  });
});

describe("toProductReviewDetail", () => {
  it("carries text, images, reply and the author", () => {
    const detail = toProductReviewDetail(review);
    expect(detail.text).toBe("Arrived as described.");
    expect(detail.images).toEqual(["https://cdn/x.jpg", "https://cdn/y.jpg"]);
    expect(detail.adminReply).toBe("Thanks");
    expect(detail.author).toEqual({
      name: "Ayse",
      email: "a@x.com",
      href: "/accounts/users/u1",
    });
  });

  it("links product, order and seller", () => {
    expect(toProductReviewDetail(review).links).toEqual([
      { kind: "product", label: "Model Araba", href: "/catalog/products/p1" },
      {
        kind: "order",
        label: "order-12",
        href: "/operations/orders/order-123456789",
      },
      { kind: "seller", label: "seller-1", href: "/accounts/users/seller-1" },
    ]);
  });

  it("omits links whose id is absent", () => {
    const detail = toProductReviewDetail({
      ...review,
      orderId: undefined,
      sellerId: undefined,
    });
    expect(detail.links.map((l) => l.kind)).toEqual(["product"]);
  });
});

describe("toSellerReviewDetail", () => {
  const rating: UserRating = {
    id: "ur1",
    score: 5,
    comment: "Fast shipping",
    createdAt: "2026-10-02T10:00:00Z",
    tradeId: "trade-99999999",
    giver: person,
    receiver: { id: "s1", displayName: "Seller", email: "s@x.com" },
  };

  it("defaults a missing status to approved and links seller and trade", () => {
    const detail = toSellerReviewDetail(rating);
    expect(detail.status).toBe("approved");
    expect(detail.text).toBe("Fast shipping");
    expect(detail.links.map((l) => l.kind)).toEqual(["seller", "trade"]);
    expect(detail.links[1]!.href).toBe("/operations/trades/trade-99999999");
  });
});
