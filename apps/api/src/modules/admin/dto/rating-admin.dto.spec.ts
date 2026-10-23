import { ValidationPipe, type ArgumentMetadata } from "@nestjs/common";
import { RatingStatus } from "@prisma/client";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../../common/validators/global-validation-pipe-options";
import {
  AdminUserRatingQueryDto,
  RatingQueryDto,
  UpdateRatingStatusDto,
} from "./rating-admin.dto";

/**
 * The admin review moderation contract at the request edge, through the
 * global pipe the API runs with: an admin can only hide (`hidden`) or show
 * again (`approved`). There is no way back to `pending` and no other stored
 * status can be set. The reason's length rule lives in the rating domain
 * (`normalizeModerationReason`) so its 400 names the rule.
 */
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);

const validate = <T>(
  metatype: new () => T,
  type: "body" | "query",
  value: Record<string, unknown>,
) =>
  pipe.transform(value, {
    type,
    metatype,
    data: "",
  } satisfies ArgumentMetadata) as Promise<T>;

describe("UpdateRatingStatusDto (PATCH /admin/reviews/:id/status, /admin/user-ratings/:id/status)", () => {
  it("takes a hide with its reason", async () => {
    await expect(
      validate(UpdateRatingStatusDto, "body", {
        status: "hidden",
        reason: "Contains a phone number",
      }),
    ).resolves.toMatchObject({
      status: "hidden",
      reason: "Contains a phone number",
    });
  });

  it("takes a show again without a note", async () => {
    await expect(
      validate(UpdateRatingStatusDto, "body", { status: "approved" }),
    ).resolves.toMatchObject({ status: "approved" });
  });

  it.each(
    Object.values(RatingStatus).filter(
      (status) => status !== "hidden" && status !== "approved",
    ),
  )("refuses %s with 400: only hide and show again exist", async (status) => {
    await expect(
      validate(UpdateRatingStatusDto, "body", {
        status,
        reason: "Legacy action",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("refuses a body without a status", async () => {
    await expect(
      validate(UpdateRatingStatusDto, "body", { reason: "No status here" }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("admin review list filters", () => {
  const LISTS = [
    ["product reviews", RatingQueryDto],
    ["user ratings", AdminUserRatingQueryDto],
  ] as const;

  it.each(LISTS)(
    "%s filter by the hidden status and an exact review id",
    async (_kind, dto) => {
      const id = "3f1c9a52-2b8e-4d6f-9a41-0c7e5b2d8f10";
      await expect(
        validate(dto, "query", { status: "hidden", id }),
      ).resolves.toMatchObject({ status: "hidden", id });
    },
  );

  it.each(LISTS)(
    "%s refuse an id that is not a uuid (the report deep link sends one)",
    async (_kind, dto) => {
      await expect(
        validate(dto, "query", { id: "not-a-uuid" }),
      ).rejects.toMatchObject({ status: 400 });
    },
  );
});
