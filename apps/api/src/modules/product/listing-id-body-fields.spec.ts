import { ValidationPipe } from "@nestjs/common";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../common/validators/global-validation-pipe-options";
import { AddCollectionItemDto } from "../collection/dto/collection.dto";
import { CreateOfferDto } from "../offer/dto/create-offer.dto";
import {
  CreateReportDto,
  ReportType,
} from "../user-report/dto/create-report.dto";
import { AddToWishlistDto } from "../wishlist/dto/wishlist.dto";

/**
 * The request bodies an old app's product screen sends with the product id
 * it took from the route, which is the whole `<slug>-<uuid>` segment when the
 * screen was opened from a listing link (ADR 0017, contract delta
 * 2026-10-23-listing-slug-param). Traced in mobile-v1.0.5 and mobile-v1.1.1:
 *
 * - favourite on: `POST /wishlist { productId }`
 * - make offer: `POST /offers { productId, amount, message }`
 * - add to collection (also via "new collection"): `POST /collections/:id/items { productId }`
 * - report listing: `POST /user-reports { type: "product", targetId, reason }`
 *
 * Each resolves the segment to the uuid before its existing validator runs;
 * garbage still fails it, and a non-product report target stays strict.
 */
describe("product id body fields under the global ValidationPipe", () => {
  const ID = "0b1e7a52-3c4d-4e5f-8a9b-1c2d3e4f5ac9";
  const SEGMENT = `ferrari-f40-1-18-bburago-kirmizi-${ID}`;
  const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
  const asBody = <T>(metatype: new () => T, value: unknown) =>
    pipe.transform(value, { type: "body", metatype }) as Promise<T>;

  it.each([
    ["POST /wishlist", AddToWishlistDto, { productId: SEGMENT }, "productId"],
    [
      "POST /offers",
      CreateOfferDto,
      { productId: SEGMENT, amount: 250, message: "Olur mu?" },
      "productId",
    ],
    [
      "POST /collections/:id/items",
      AddCollectionItemDto,
      { productId: SEGMENT },
      "productId",
    ],
    [
      "POST /user-reports (product)",
      CreateReportDto,
      { type: ReportType.PRODUCT, targetId: SEGMENT, reason: "spam" },
      "targetId",
    ],
  ] as const)(
    "%s resolves the segment to the uuid",
    async (_label, dto, body, field) => {
      const out = (await asBody(dto as new () => object, body)) as Record<
        string,
        unknown
      >;
      expect(out[field]).toBe(ID);
    },
  );

  it.each([
    ["POST /wishlist", AddToWishlistDto, { productId: "ferrari-f40" }],
    ["POST /offers", CreateOfferDto, { productId: "ferrari-f40", amount: 250 }],
    [
      "POST /collections/:id/items",
      AddCollectionItemDto,
      { productId: "ferrari-f40" },
    ],
    [
      "POST /user-reports (product)",
      CreateReportDto,
      { type: ReportType.PRODUCT, targetId: "ferrari-f40", reason: "spam" },
    ],
  ] as const)(
    "%s still rejects garbage with 400",
    async (_label, dto, body) => {
      await expect(asBody(dto as new () => object, body)).rejects.toMatchObject(
        { status: 400 },
      );
    },
  );

  it.each([
    ReportType.USER,
    ReportType.COLLECTION,
    ReportType.MESSAGE,
    ReportType.REVIEW,
  ])("a %s report target stays a strict uuid", async (type) => {
    await expect(
      asBody(CreateReportDto, { type, targetId: SEGMENT, reason: "spam" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("keeps a bare uuid unchanged", async () => {
    await expect(
      asBody(AddToWishlistDto, { productId: ID }),
    ).resolves.toMatchObject({ productId: ID });
  });
});
