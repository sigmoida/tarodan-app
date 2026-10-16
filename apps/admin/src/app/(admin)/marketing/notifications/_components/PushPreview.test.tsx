// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { PushPreview } from "./PushPreview";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("PushPreview", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (title: string, body: string) =>
    act(() => root.render(<PushPreview title={title} body={body} />));

  it("başlık ve içeriği gösterir", () => {
    render("Merhaba", "Yeni kampanya başladı");
    expect(container.textContent).toContain("Merhaba");
    expect(container.textContent).toContain("Yeni kampanya başladı");
  });

  it("boşken ipucu metinlerini gösterir", () => {
    render("", "");
    expect(container.textContent).toContain(
      "admin.marketing.notifications.enterTitle",
    );
    expect(container.textContent).toContain(
      "admin.marketing.notifications.enterContent",
    );
  });

  it("açık tema: koyu arka plan token'ı kullanılmaz", () => {
    render("a", "b");
    const card = container.querySelector('[data-testid="push-preview-card"]');
    expect(card?.className).toContain("bg-surface-elevated");
    expect(card?.className).not.toContain("bg-heading");
  });
});
