// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { FormProvider, useForm, type UseFormReturn } from "react-hook-form";
import { emptyHeroForm, type HeroFormValues } from "../_lib/types";

vi.mock("next-intl", async () => {
  const { fakeT } = await import("@/test-utils/dom");
  return { useTranslations: () => fakeT };
});

import { mount } from "@/test-utils/dom";
import { HeroPreview } from "./HeroPreview";

let form: UseFormReturn<HeroFormValues>;

function Host({
  values,
  children,
}: {
  values: HeroFormValues;
  children: ReactNode;
}) {
  form = useForm({ defaultValues: values });
  return <FormProvider {...form}>{children}</FormProvider>;
}

function render(values: Partial<HeroFormValues>) {
  return mount(
    <Host values={{ ...emptyHeroForm("home"), ...values }}>
      <HeroPreview lang="tr" />
    </Host>,
  );
}

type Size = [width: number, height: number];

const PHONE = "img.aspect-hero-compact";
const DESKTOP = "img.aspect-hero-split";

/** Fires `load` on the frame's image with the given natural size. */
function loadImage(selector: string, [width, height]: Size) {
  const img = document.querySelector<HTMLImageElement>(selector)!;
  Object.defineProperty(img, "naturalWidth", {
    value: width,
    configurable: true,
  });
  Object.defineProperty(img, "naturalHeight", {
    value: height,
    configurable: true,
  });
  act(() => {
    img.dispatchEvent(new Event("load"));
  });
}

function loadImages(phone: Size, desktop: Size) {
  loadImage(PHONE, phone);
  loadImage(DESKTOP, desktop);
}

const warnings = () => Array.from(document.querySelectorAll('[role="alert"]'));

describe("HeroPreview crop warning", () => {
  it("renders a phone frame and a desktop frame", () => {
    const m = render({ imageUrl: "https://cdn/x.png" });
    expect(document.querySelector(".aspect-hero-compact")).not.toBeNull();
    expect(document.querySelector(".aspect-hero-split")).not.toBeNull();
    m.unmount();
  });

  it("shows the mobile image on the phone and the desktop image beside the text", () => {
    const m = render({
      imageUrl: "https://cdn/d.png",
      mobileImageUrl: "https://cdn/m.png",
    });
    expect(document.querySelector(PHONE)!.getAttribute("src")).toBe(
      "https://cdn/m.png",
    );
    expect(document.querySelector(DESKTOP)!.getAttribute("src")).toBe(
      "https://cdn/d.png",
    );
    m.unmount();
  });

  it("falls back to the desktop image on the phone", () => {
    const m = render({ imageUrl: "https://cdn/d.png" });
    expect(document.querySelector(PHONE)!.getAttribute("src")).toBe(
      "https://cdn/d.png",
    );
    m.unmount();
  });

  it("puts the desktop image on the chosen side of the text", () => {
    const m = render({ imageUrl: "https://cdn/d.png", imageSide: "left" });
    const row = document.querySelector(DESKTOP)!.closest(".grid")!;
    expect(row.className).toContain("[&>*:first-child]:order-2");
    m.unmount();
  });

  it("shows no warning for a 16:10 mobile and a 4:3 desktop image", () => {
    const m = render({
      imageUrl: "https://cdn/d.png",
      mobileImageUrl: "https://cdn/m.png",
    });
    loadImages([1600, 1000], [1600, 1200]);
    expect(warnings()).toHaveLength(0);
    m.unmount();
  });

  it("warns on the phone frame, with the mobile hint, for a 4:3 desktop image", () => {
    const m = render({ imageUrl: "https://cdn/d.png" });
    loadImages([1600, 1200], [1600, 1200]);
    const found = warnings();
    expect(found).toHaveLength(1);
    expect(found[0]!.textContent).toContain('"percent":8');
    expect(found[0]!.textContent).toContain("cropFixMobile");
    m.unmount();
  });

  it("warns on the desktop frame when the mobile image fits the phone", () => {
    const m = render({
      imageUrl: "https://cdn/d.png",
      mobileImageUrl: "https://cdn/m.png",
    });
    loadImages([1600, 1000], [1600, 1000]);
    const found = warnings();
    expect(found).toHaveLength(1);
    expect(found[0]!.textContent).not.toContain("cropFixMobile");
    m.unmount();
  });

  it("drops the warning when the image changes, until the new one loads", () => {
    const m = render({ imageUrl: "https://cdn/d.png" });
    loadImages([1600, 1200], [1600, 1200]);
    expect(warnings()).toHaveLength(1);
    act(() => {
      form.setValue("imageUrl", "https://cdn/other.png");
    });
    expect(warnings()).toHaveLength(0);
    loadImage(PHONE, [1600, 1000]);
    expect(warnings()).toHaveLength(0);
    m.unmount();
  });

  it("does not warn when the image size is unknown", () => {
    const m = render({ imageUrl: "https://cdn/d.svg" });
    loadImages([0, 0], [0, 0]);
    expect(warnings()).toHaveLength(0);
    m.unmount();
  });
});
