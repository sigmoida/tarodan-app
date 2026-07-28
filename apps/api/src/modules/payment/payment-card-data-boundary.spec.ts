import { PATH_METADATA } from "@nestjs/common/constants";
import { PaymentController } from "./payment.controller";

describe("PaymentController card data boundary", () => {
  it("does not expose an API route that accepts raw card data", () => {
    const prototype = PaymentController.prototype as unknown as Record<
      string,
      unknown
    >;
    const routes = Object.getOwnPropertyNames(prototype)
      .filter((name) => name !== "constructor")
      .map((name) => Reflect.getMetadata(PATH_METADATA, prototype[name]))
      .filter(Boolean);

    expect(routes).not.toContain("process-direct");
  });
});
