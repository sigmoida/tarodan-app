/** @format */

import { describe, expect, it } from "vitest";
import { TRUST_BADGE_ICONS } from "@tarodan/types";
import { TRUST_BADGE_ICON_COMPONENTS, trustBadgeIcon } from "./trustBadgeIcons";

// Sözleşme anahtarları dizi ya da nesne olarak sunulabilir; ikisi de desteklenir.
const contractKeys: string[] = Array.isArray(TRUST_BADGE_ICONS)
  ? [...TRUST_BADGE_ICONS]
  : Object.keys(TRUST_BADGE_ICONS);

describe("trust badge icon mapping", () => {
  it("TRUST_BADGE_ICONS'taki her anahtarın bir ikonu var", () => {
    const missing = contractKeys.filter(
      (key) => !(key in TRUST_BADGE_ICON_COMPONENTS),
    );
    expect(missing).toEqual([]);
  });

  it("sözleşmede olmayan ikon anahtarı tutmaz", () => {
    const extra = Object.keys(TRUST_BADGE_ICON_COMPONENTS).filter(
      (key) => !contractKeys.includes(key),
    );
    expect(extra).toEqual([]);
  });

  it("bilinmeyen anahtarda yedek ikon döner", () => {
    expect(trustBadgeIcon("does-not-exist")).toBeTruthy();
  });
});
