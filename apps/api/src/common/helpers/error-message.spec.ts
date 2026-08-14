import { errorMessage, errorStack } from "./error-message";

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
