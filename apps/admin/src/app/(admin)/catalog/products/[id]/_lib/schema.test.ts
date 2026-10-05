import { describe, expect, it } from "vitest";
import type { Translate } from "@/lib/statusLabels";
import { productRejectSchema, productRemoveSchema } from "./schema";

/** Anahtarı döndürür: hangi kuralın konuştuğu testte görünür. */
const t = ((key: string) => key) as unknown as Translate;

/** Başarısız ayrıştırmanın ilk sorunu: alan + mesaj. */
function firstIssue(result: {
  success: boolean;
  error?: { issues: Array<{ path: PropertyKey[]; message: string }> };
}) {
  const issue = result.error?.issues[0];
  return issue ? { path: issue.path.join("."), message: issue.message } : null;
}

describe("productRejectSchema — shared removal rule", () => {
  const schema = productRejectSchema(t);

  it("requires a violation code next to the explanation", () => {
    const result = schema.safeParse({
      reason: "Sahte ürün",
      violationCode: "",
    });

    expect(result.success).toBe(false);
    expect(firstIssue(result)).toEqual({
      path: "violationCode",
      message: "validation.listingRemoval.violation_required",
    });
  });

  it("rejects a code outside the catalog", () => {
    const result = schema.safeParse({
      reason: "Sahte ürün",
      violationCode: "made_up",
    });

    expect(firstIssue(result)?.message).toBe(
      "validation.listingRemoval.violation_invalid",
    );
  });

  it("accepts a catalog code with the explanation", () => {
    expect(
      schema.safeParse({
        reason: "Replika olduğu görsellerden belli",
        violationCode: "counterfeit_replica",
      }).success,
    ).toBe(true);
  });

  it("still requires the explanation shown to the seller", () => {
    const result = schema.safeParse({
      reason: "  ",
      violationCode: "counterfeit_replica",
    });

    expect(firstIssue(result)).toEqual({
      path: "reason",
      message: "admin.catalog.products.rejectNoteRequired",
    });
  });
});

describe("productRemoveSchema — shared removal rule", () => {
  const schema = productRemoveSchema(t);

  it("requires a violation code", () => {
    const result = schema.safeParse({ violationCode: "", note: "" });

    expect(firstIssue(result)).toEqual({
      path: "violationCode",
      message: "validation.listingRemoval.violation_required",
    });
  });

  it("the note is optional for a catalog code", () => {
    expect(
      schema.safeParse({ violationCode: "duplicate_listing", note: "" })
        .success,
    ).toBe(true);
  });

  it("'other' requires the note, reported on the note field", () => {
    expect(
      firstIssue(schema.safeParse({ violationCode: "other", note: " " })),
    ).toEqual({
      path: "note",
      message: "validation.listingRemoval.detail_required",
    });
    expect(
      schema.safeParse({ violationCode: "other", note: "Telif ihlali" })
        .success,
    ).toBe(true);
  });

  it("caps the note at the shared length limit", () => {
    const result = schema.safeParse({
      violationCode: "other",
      note: "x".repeat(501),
    });

    expect(result.success).toBe(false);
    expect(firstIssue(result)?.path).toBe("note");
  });
});
