import { CategoryService } from "./category.service";

describe("CategoryService", () => {
  it("keeps an active category visible when its parent is inactive", async () => {
    const categories = [
      {
        id: "root",
        name: "Root",
        slug: "root",
        description: null,
        parentId: null,
        _count: { products: 1 },
      },
      {
        id: "orphan",
        name: "Visible child",
        slug: "visible-child",
        description: null,
        parentId: "inactive-parent",
        _count: { products: 2 },
      },
      {
        id: "grandchild",
        name: "Grandchild",
        slug: "grandchild",
        description: null,
        parentId: "orphan",
        _count: { products: 3 },
      },
    ];
    const prisma = {
      category: { findMany: jest.fn().mockResolvedValue(categories) },
    };
    const cache = {
      getOrSet: jest.fn(async (_key: string, factory: () => Promise<unknown>) =>
        factory(),
      ),
      del: jest.fn(),
    };
    const service = new CategoryService(prisma as any, cache as any);

    const result = await service.findAll();

    expect(result.map((category: { id: string }) => category.id)).toEqual([
      "root",
      "orphan",
    ]);
    expect(result[1].children).toEqual([
      expect.objectContaining({ id: "grandchild" }),
    ]);
  });

  it("does not allow the legacy write route to activate below an inactive parent", async () => {
    const prisma = {
      category: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: "child",
            parentId: "parent",
            isActive: false,
            name: "Child",
            slug: "child",
          })
          .mockResolvedValueOnce({
            id: "parent",
            parentId: null,
            isActive: false,
          }),
        update: jest.fn(),
      },
    };
    const cache = { del: jest.fn() };
    const service = new CategoryService(prisma as any, cache as any);

    await expect(service.update("child", { isActive: true })).rejects.toThrow(
      "tüm üst kategoriler aktif olmalıdır",
    );
    expect(prisma.category.update).not.toHaveBeenCalled();
  });
});
