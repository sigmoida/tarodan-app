import { describe, expect, it } from "vitest";
import { heroPreviewModel, previewText } from "./preview";
import { emptyHeroForm } from "./types";

describe("previewText", () => {
  it("picks the requested language", () => {
    expect(previewText({ tr: "Merhaba", en: "Hello" }, "en")).toBe("Hello");
    expect(previewText({ tr: "Merhaba", en: "Hello" }, "tr")).toBe("Merhaba");
  });

  it("falls back to TR when EN is blank", () => {
    expect(previewText({ tr: "Merhaba", en: null }, "en")).toBe("Merhaba");
  });

  it("is empty for a missing value", () => {
    expect(previewText(null, "tr")).toBe("");
  });
});

describe("heroPreviewModel", () => {
  const base = {
    ...emptyHeroForm("home"),
    imageUrl: " https://cdn/x.png ",
    imageSide: "left" as const,
    titleTr: "Başlık",
    titleEn: "Title",
    cta1LabelTr: "Keşfet",
    cta1LabelEn: "",
  };

  it("renders from form values in the chosen language", () => {
    expect(heroPreviewModel(base, "en")).toMatchObject({
      imageUrl: "https://cdn/x.png",
      imageSide: "left",
      title: "Title",
      subtitle: "",
    });
  });

  it("falls back to TR for a missing EN button label and drops empty buttons", () => {
    expect(heroPreviewModel(base, "en").buttons).toEqual(["Keşfet"]);
  });
});
