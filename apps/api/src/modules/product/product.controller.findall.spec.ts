import { ProductController } from "./product.controller";
import type { ProductQueryDto } from "./dto";

/**
 * `GET /products` answers honestly (apps/api/CLAUDE.md, "Controllers are
 * thin": never swallow errors into an empty 200).
 *
 * Regression: the controller caught every `findAll` error and answered 200
 * `{ data: [], meta: { total: 0 } }`. The web home cached that empty page for
 * its ISR window and hid its rails, and the error never reached
 * `AllExceptionsFilter` or Sentry. A failure now propagates, so the filter
 * answers a sanitised 5xx and reports it.
 */
describe("ProductController.findAll", () => {
  const make = () => {
    const productService = { findAll: jest.fn() };
    const controller = new ProductController(
      productService as never,
      {} as never, // boost
      {} as never, // boost seller
      {} as never, // boost offers
      {} as never, // renewal
      {} as never, // i18n
    );
    return { controller, productService };
  };

  const query = { page: 2, limit: 12 } as ProductQueryDto;

  it("lets a failing list reach the exception filter instead of answering an empty 200", async () => {
    const { controller, productService } = make();
    const failure = new Error("search backend unavailable");
    productService.findAll.mockRejectedValue(failure);

    await expect(controller.findAll(query, "viewer-1")).rejects.toBe(failure);
  });

  it("passes the page through with the viewer", async () => {
    const { controller, productService } = make();
    const page = {
      data: [{ id: "p1" }],
      meta: { total: 1, page: 2, limit: 12, totalPages: 1 },
    };
    productService.findAll.mockResolvedValue(page);

    await expect(controller.findAll(query, "viewer-1")).resolves.toBe(page);
    expect(productService.findAll).toHaveBeenCalledWith(query, "viewer-1");
  });

  it("keeps an empty result a 200 page", async () => {
    const { controller, productService } = make();
    const empty = {
      data: [],
      meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
    };
    productService.findAll.mockResolvedValue(empty);

    await expect(controller.findAll(query)).resolves.toBe(empty);
  });
});
