import {
  resolveSeedProductAssetBase,
  seedCollectionAssetKey,
} from "./seed-media-mapping";

describe("seed media mapping", () => {
  const bases = [
    "hot-wheels-ferrari-275-gtb",
    "autoart-mercedes-300sl-gullwing",
    "kyosho-nissan-gtr-r35-118",
  ];

  it.each([
    ["hot-wheels-ferrari-275-gtb-0", "hot-wheels-ferrari-275-gtb"],
    [
      "kurumsal-autoart-mercedes-300sl-gullwing-0",
      "autoart-mercedes-300sl-gullwing",
    ],
    ["durum-pending-kyosho-nissan-gtr-r35-118", "kyosho-nissan-gtr-r35-118"],
  ])("maps seeded product slug %s to %s", (slug, expected) => {
    expect(resolveSeedProductAssetBase(slug, bases)).toBe(expected);
  });

  it("does not attach seed media to an ordinary user listing", () => {
    expect(
      resolveSeedProductAssetBase(
        "benim-hot-wheels-ferrari-275-gtb-ilanim",
        bases,
      ),
    ).toBeNull();
  });

  it("uses the collection slug as its stable seed asset key", () => {
    expect(seedCollectionAssetKey("best-jdm")).toBe(
      "seed-assets/collections/best-jdm.webp",
    );
  });
});
