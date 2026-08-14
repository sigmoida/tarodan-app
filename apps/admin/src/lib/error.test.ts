import { describe, expect, it } from "vitest";
import { extractErrorMessage, isNotFoundError } from "./error";

function axiosError(data: unknown, status?: number) {
  return { response: { data, status } };
}

describe("extractErrorMessage", () => {
  it("returns the backend string message when present", () => {
    expect(
      extractErrorMessage(axiosError({ message: "Invalid amount" }), "x"),
    ).toBe("Invalid amount");
  });

  it("joins a NestJS validation array of messages", () => {
    expect(
      extractErrorMessage(
        axiosError({ message: ["amount is required", "amount must be > 0"] }),
        "x",
      ),
    ).toBe("amount is required amount must be > 0");
  });

  it("drops blank/non-string entries from a message array", () => {
    expect(
      extractErrorMessage(axiosError({ message: ["ok", "  ", 42, ""] }), "x"),
    ).toBe("ok");
  });

  it("falls back when the message array has nothing usable", () => {
    expect(
      extractErrorMessage(axiosError({ message: ["  ", ""] }), "fallback"),
    ).toBe("fallback");
  });

  it("falls back for a blank string message", () => {
    expect(
      extractErrorMessage(axiosError({ message: "   " }), "fallback"),
    ).toBe("fallback");
  });

  it("falls back when there's no response data at all", () => {
    expect(extractErrorMessage(new Error("network error"), "fallback")).toBe(
      "fallback",
    );
    expect(extractErrorMessage(null, "fallback")).toBe("fallback");
    expect(extractErrorMessage(undefined, "fallback")).toBe("fallback");
  });
});

describe("isNotFoundError", () => {
  it("returns true for a 404 axios response", () => {
    expect(isNotFoundError(axiosError({}, 404))).toBe(true);
  });

  it("returns false for other statuses", () => {
    expect(isNotFoundError(axiosError({}, 500))).toBe(false);
    expect(isNotFoundError(axiosError({}, 400))).toBe(false);
  });

  it("returns false when there's no response at all", () => {
    expect(isNotFoundError(new Error("boom"))).toBe(false);
    expect(isNotFoundError(null)).toBe(false);
  });
});
