import {
  ancestorCategoryIds,
  buildCategoryParentMap,
  descendantCategoryIds,
  type CategoryEdge,
} from "./category-tree.helper";

/**
 *   root
 *    ├── diecast
 *    │    └── diecast-118
 *    └── plastic
 *   orphan (kök, bağımsız)
 */
const TREE: CategoryEdge[] = [
  { id: "root", parentId: null },
  { id: "diecast", parentId: "root" },
  { id: "diecast-118", parentId: "diecast" },
  { id: "plastic", parentId: "root" },
  { id: "orphan", parentId: null },
];

describe("category tree helper", () => {
  describe("ancestorCategoryIds", () => {
    const parentById = buildCategoryParentMap(TREE);

    it("kategorinin kendisini ve tüm üstlerini döndürür", () => {
      expect([...ancestorCategoryIds(parentById, "diecast-118")]).toEqual([
        "diecast-118",
        "diecast",
        "root",
      ]);
    });

    it("kök kategoride yalnız kendisini döndürür", () => {
      expect([...ancestorCategoryIds(parentById, "root")]).toEqual(["root"]);
    });

    it("kategori yoksa boş küme döndürür", () => {
      expect(ancestorCategoryIds(parentById, null).size).toBe(0);
      expect(ancestorCategoryIds(parentById, "yok").size).toBe(1);
    });

    it("döngülü veride sonsuz döngüye girmez", () => {
      const cyclic = buildCategoryParentMap([
        { id: "a", parentId: "b" },
        { id: "b", parentId: "a" },
      ]);
      expect([...ancestorCategoryIds(cyclic, "a")]).toEqual(["a", "b"]);
    });
  });

  describe("descendantCategoryIds", () => {
    it("kategorinin kendisini ve her derinlikteki altlarını döndürür", () => {
      expect(descendantCategoryIds(TREE, "root")).toEqual(
        new Set(["root", "diecast", "diecast-118", "plastic"]),
      );
    });

    it("yaprak kategoride yalnız kendisini döndürür", () => {
      expect(descendantCategoryIds(TREE, "plastic")).toEqual(
        new Set(["plastic"]),
      );
    });

    it("kardeş dalı kapsamaz", () => {
      expect(descendantCategoryIds(TREE, "diecast")).toEqual(
        new Set(["diecast", "diecast-118"]),
      );
    });

    it("döngülü veride sonsuz döngüye girmez", () => {
      const cyclic: CategoryEdge[] = [
        { id: "a", parentId: "b" },
        { id: "b", parentId: "a" },
      ];
      expect(descendantCategoryIds(cyclic, "a")).toEqual(new Set(["a", "b"]));
    });
  });
});
