import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  addLocalizedIssues,
  localizedFromForm,
  localizedKey,
  localizedShape,
  localizedToForm,
} from "./localized-form";

const messages = { required: "req", trRequiredForEn: "needTr" };

function issuesOf(values: Record<string, string>, required: boolean) {
  const schema = z
    .object(localizedShape("title", 5, "max"))
    .superRefine((v, ctx) =>
      addLocalizedIssues(ctx, v, "title", required, messages),
    );
  const r = schema.safeParse(values);
  return r.success ? [] : r.error.issues.map((i) => [i.path[0], i.message]);
}

describe("localized form helpers", () => {
  it("builds flat keys", () => {
    expect(localizedKey("title", "tr")).toBe("titleTr");
    expect(localizedKey("title", "en")).toBe("titleEn");
  });

  it("maps a LocalizedText to flat fields and back-fills blanks", () => {
    expect(localizedToForm("title", { tr: "a", en: "b" })).toEqual({
      titleTr: "a",
      titleEn: "b",
    });
    expect(localizedToForm("title", { tr: "a", en: null })).toEqual({
      titleTr: "a",
      titleEn: "",
    });
    expect(localizedToForm("title", null)).toEqual({
      titleTr: "",
      titleEn: "",
    });
  });

  it("requires TR only when the field is required", () => {
    expect(issuesOf({ titleTr: "", titleEn: "" }, true)).toEqual([
      ["titleTr", "req"],
    ]);
    expect(issuesOf({ titleTr: "", titleEn: "" }, false)).toEqual([]);
  });

  it("rejects EN without TR even when optional", () => {
    expect(issuesOf({ titleTr: "", titleEn: "hi" }, false)).toEqual([
      ["titleTr", "needTr"],
    ]);
  });

  it("enforces max length on both languages", () => {
    expect(issuesOf({ titleTr: "123456", titleEn: "123456" }, true)).toEqual([
      ["titleTr", "max"],
      ["titleEn", "max"],
    ]);
  });

  it("maps to the API value: trims, nulls blank EN", () => {
    expect(
      localizedFromForm({ titleTr: " a ", titleEn: " " }, "title", "create"),
    ).toEqual({ tr: "a", en: null });
    expect(
      localizedFromForm({ titleTr: "a", titleEn: "b" }, "title", "update"),
    ).toEqual({ tr: "a", en: "b" });
  });

  it("clears with null on update, omits on create", () => {
    const blank = { titleTr: "", titleEn: "" };
    expect(localizedFromForm(blank, "title", "update")).toBeNull();
    expect(localizedFromForm(blank, "title", "create")).toBeUndefined();
  });
});
