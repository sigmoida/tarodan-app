import { BadRequestException } from "@nestjs/common";

import { errorMessage, errorStack } from "./error-message";
import { i18nMessage } from "../../modules/i18n/localized-message";

/**
 * A `catch` binding is `unknown`: `throw` accepts any value, so these have to
 * survive whatever a driver or SDK rejects with — not just `Error`.
 */
describe("errorMessage", () => {
  it("returns the message of an Error", () => {
    expect(errorMessage(new Error("payment declined"))).toBe(
      "payment declined",
    );
  });

  it("stringifies values that are not Errors", () => {
    expect(errorMessage("ETIMEDOUT")).toBe("ETIMEDOUT");
    expect(errorMessage(404)).toBe("404");
    expect(errorMessage(null)).toBe("null");
    expect(errorMessage(undefined)).toBe("undefined");
  });

  it("keeps the subclass message", () => {
    class CargoError extends Error {}
    expect(errorMessage(new CargoError("barcode rejected"))).toBe(
      "barcode rejected",
    );
  });

  // A localized exception (#224) carries a catalog-key payload, so Nest has no
  // text to build `error.message` from and falls back to the class name. Every
  // internal log that quoted it read "Bad Request Exception" and lost the reason.
  it("renders the catalog message of a localized exception", () => {
    const error = new BadRequestException(
      i18nMessage("server.payment.orderAlreadyRefunded"),
    );

    expect(error.message).toBe("Bad Request Exception");
    expect(errorMessage(error)).toContain(
      "[server.payment.orderAlreadyRefunded]",
    );
    expect(errorMessage(error)).not.toBe("Bad Request Exception");
  });

  it("interpolates the ICU params of a localized exception", () => {
    const error = new BadRequestException(
      i18nMessage("server.payment.refundAmountExceedsLimit", {
        amountToRefund: 3500,
        refundCap: 1200,
      }),
    );

    const message = errorMessage(error);
    expect(message).toContain("3500");
    expect(message).toContain("1200");
    expect(message).toContain("[server.payment.refundAmountExceedsLimit]");
  });

  // Cron/driver yolları `Promise.reject({ message })` gibi Error OLMAYAN değerler
  // de fırlatabiliyor; stringify etmek tek teşhisi `[object Object]`a çevirirdi.
  it("keeps the message of an error-shaped plain object", () => {
    expect(errorMessage({ message: "ETIMEDOUT" })).toBe("ETIMEDOUT");
    expect(errorMessage({ code: "E_FAIL" })).toBe("[object Object]");
    expect(errorMessage({ message: 42 })).toBe("[object Object]");
  });

  it("keeps plain-string HTTP exception messages untouched", () => {
    expect(errorMessage(new BadRequestException("iban invalid"))).toBe(
      "iban invalid",
    );
  });
});

describe("errorStack", () => {
  it("returns the stack when there is one", () => {
    const error = new Error("boom");
    expect(errorStack(error)).toBe(error.stack);
  });

  it("falls back to the message on a stackless Error", () => {
    const error = new Error("no stack here");
    error.stack = undefined;
    expect(errorStack(error)).toBe("no stack here");
  });

  it("stringifies values that are not Errors", () => {
    expect(errorStack({ code: "E_FAIL" })).toBe("[object Object]");
  });
});
