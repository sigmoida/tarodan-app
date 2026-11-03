// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { FormProvider, useForm } from "react-hook-form";
import { emptyHeroForm, type HeroFormValues } from "../_lib/types";

vi.mock("next-intl", async () => {
  const { fakeT } = await import("@/test-utils/dom");
  return { useTranslations: () => fakeT };
});

import { mount } from "@/test-utils/dom";
import { HeroPreview } from "./HeroPreview";

function Host({
  values,
  children,
}: {
  values: HeroFormValues;
  children: ReactNode;
}) {
  const form = useForm({ defaultValues: values });
  return <FormProvider {...form}>{children}</FormProvider>;
}

function render(values: Partial<HeroFormValues>) {
  return mount(
    <Host values={{ ...emptyHeroForm("home"), ...values }}>
      <HeroPreview lang="tr" />
    </Host>,
  );
}

function loadImages(sizes: Array<[number, number]>) {
  const imgs = Array.from(document.querySelectorAll("img"));
  imgs.forEach((img, i) => {
    Object.defineProperty(img, "naturalWidth", { value: sizes[i]![0] });
    Object.defineProperty(img, "naturalHeight", { value: sizes[i]![1] });
    act(() => {
      img.dispatchEvent(new Event("load"));
    });
  });
}

const warnings = () => Array.from(document.querySelectorAll('[role="alert"]'));

describe("HeroPreview crop warning", () => {
  it("renders a phone frame and a desktop frame", () => {
    const m = render({ imageUrl: "https://cdn/x.png" });
    expect(document.querySelector(".aspect-hero-compact")).not.toBeNull();
    expect(document.querySelector(".aspect-hero-split")).not.toBeNull();
    m.unmount();
  });

  it("shows no warning for a 16:10 mobile and a 4:3 desktop image", () => {
    const m = render({
      imageUrl: "https://cdn/d.png",
      mobileImageUrl: "https://cdn/m.png",
    });
    // Phone frame is rendered first, desktop second.
    loadImages([
      [1600, 1000],
      [1600, 1200],
    ]);
    expect(warnings()).toHaveLength(0);
    m.unmount();
  });

  it("warns on the phone frame, with the mobile hint, for a 4:3 desktop image", () => {
    const m = render({ imageUrl: "https://cdn/d.png" });
    loadImages([
      [1600, 1200],
      [1600, 1200],
    ]);
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
    loadImages([
      [1600, 1000],
      [1600, 1000],
    ]);
    const found = warnings();
    expect(found).toHaveLength(1);
    expect(found[0]!.textContent).not.toContain("cropFixMobile");
    m.unmount();
  });
});
