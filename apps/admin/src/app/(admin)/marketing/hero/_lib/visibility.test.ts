import { describe, expect, it } from "vitest";
import { heroHiddenNotes } from "./visibility";

const ON = { web: true, app: true };
const live = (
  platform: "web" | "app" | "all",
  isLive = true,
  hideOnIos = false,
) => ({ platform, isLive, hideOnIos });

describe("heroHiddenNotes", () => {
  it("both switches on and an `all` slide live → hero shows everywhere", () => {
    expect(heroHiddenNotes([live("all")], ON)).toEqual([]);
  });

  it("no slide at all → hidden on both platforms (empty is allowed)", () => {
    expect(heroHiddenNotes([], ON)).toEqual([
      { platform: "web", reason: "noLiveSlide" },
      { platform: "app", reason: "noLiveSlide" },
    ]);
  });

  it("a platform-only slide covers just that platform", () => {
    expect(heroHiddenNotes([live("web")], ON)).toEqual([
      { platform: "app", reason: "noLiveSlide" },
    ]);
    expect(heroHiddenNotes([live("app")], ON)).toEqual([
      { platform: "web", reason: "noLiveSlide" },
    ]);
  });

  it("scheduled / inactive slides do not count", () => {
    expect(heroHiddenNotes([live("all", false)], ON)).toHaveLength(2);
  });

  it("a switched-off platform is reported as such, regardless of slides", () => {
    expect(heroHiddenNotes([live("all")], { web: false, app: true })).toEqual([
      { platform: "web", reason: "switchOff" },
    ]);
    expect(heroHiddenNotes([], { web: true, app: false })).toEqual([
      { platform: "web", reason: "noLiveSlide" },
      { platform: "app", reason: "switchOff" },
    ]);
  });

  it("app: every live app/all slide hidden in the native app → hidden-in-app note", () => {
    expect(
      heroHiddenNotes([live("all", true, true), live("app", true, true)], ON),
    ).toEqual([{ platform: "app", reason: "hiddenInApp" }]);
  });

  it("app: one app-visible slide is enough; web ignores hideOnIos", () => {
    expect(heroHiddenNotes([live("all", true, true), live("app")], ON)).toEqual(
      [],
    );
    expect(heroHiddenNotes([live("web", true, true)], ON)).toEqual([
      { platform: "app", reason: "noLiveSlide" },
    ]);
  });
});
