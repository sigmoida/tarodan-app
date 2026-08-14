import { BadRequestException } from "@nestjs/common";
import { resolveUploadTarget } from "./upload-target";

/**
 * Faz 0 — Klasör SÖZLEŞMESİ sunucuda: istemciden gelen `folder` yalnız bir
 * AMAÇ etiketi olarak kabul edilir ve whitelist'ten geçer; bucket + gerçek
 * klasörü sunucu kurar. Eskiden istemci ne gönderirse key'e giriyordu:
 * mesaj/review görselleri public `products/` çatısına düşüyor, keyfi klasör
 * açılabiliyordu.
 */
describe("resolveUploadTarget", () => {
  const USER = "user-1";

  it("routes message uploads to the PRIVATE messages root under the uploader", () => {
    expect(resolveUploadTarget("messages", USER)).toEqual({
      bucket: "messages",
      folder: USER,
      private: true,
    });
  });

  it("routes review/evidence uploads to the public reviews root", () => {
    expect(resolveUploadTarget("reviews", USER)).toEqual({
      bucket: "reviews",
      folder: USER,
      private: false,
    });
  });

  it("routes web collection uploads under collections/user/{id}", () => {
    expect(resolveUploadTarget("collections", USER)).toEqual({
      bucket: "collections",
      folder: `user/${USER}`,
      private: false,
    });
  });

  it("falls back to the legacy products/uploads target when no folder is given", () => {
    expect(resolveUploadTarget(undefined, USER)).toEqual({
      bucket: "products",
      folder: "uploads",
      private: false,
    });
    expect(resolveUploadTarget("uploads", USER)).toEqual({
      bucket: "products",
      folder: "uploads",
      private: false,
    });
  });

  it("rejects any folder outside the whitelist (istemci klasör AÇAMAZ)", () => {
    expect(() => resolveUploadTarget("hack", USER)).toThrow(
      BadRequestException,
    );
    expect(() => resolveUploadTarget("../prod/products", USER)).toThrow(
      BadRequestException,
    );
  });
});
