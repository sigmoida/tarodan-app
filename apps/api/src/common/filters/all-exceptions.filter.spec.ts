import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ArgumentsHost,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AllExceptionsFilter } from "./all-exceptions.filter";
import { I18nService } from "../../modules/i18n/i18n.service";
import { i18nMessage } from "../../modules/i18n/localized-message";

/**
 * Deterministic proof for issue #70 (+ #224 localization): the filter
 * preserves intentional HttpExceptions, renders catalog-key exceptions in the
 * request's locale, maps known Prisma errors to clean localized 4xx, and
 * sanitizes any unexpected error so no internal detail reaches the client.
 */
describe("AllExceptionsFilter", () => {
  const filter = new AllExceptionsFilter(new I18nService());

  function run(exception: unknown, headers: Record<string, string> = {}) {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: "GET", url: "/x", headers }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(exception, host);
    return {
      status: (status.mock.calls[0] as unknown[])[0] as number,
      body: (json.mock.calls[0] as unknown[])[0] as Record<string, unknown>,
    };
  }

  it("passes an HttpException through with its status and message", () => {
    const { status, body } = run(new ForbiddenException("nope"));
    expect(status).toBe(403);
    expect(body.message).toBe("nope");
  });

  it("preserves a BadRequestException validation message array", () => {
    const { status, body } = run(
      new BadRequestException({
        message: ["field is required"],
        error: "Bad Request",
      }),
    );
    expect(status).toBe(400);
    expect(body.message).toEqual(["field is required"]);
  });

  it("renders a catalog-key exception in the default locale (tr)", () => {
    const { status, body } = run(
      new NotFoundException(i18nMessage("server.common.recordNotFound")),
    );
    expect(status).toBe(404);
    expect(body.message).toBe("Kayıt bulunamadı");
    expect(body.i18nKey).toBe("server.common.recordNotFound");
    expect(body.error).toBe("Not Found");
  });

  it("renders a catalog-key exception in the request's locale (en)", () => {
    const { body } = run(
      new NotFoundException(i18nMessage("server.common.recordNotFound")),
      { "accept-language": "en-US,en;q=0.9" },
    );
    expect(body.message).toBe("Record not found");
  });

  it("maps Prisma P2002 (unique) to a localized 409", () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      "Unique failed on email",
      {
        code: "P2002",
        clientVersion: "test",
      },
    );
    const { status, body } = run(err);
    expect(status).toBe(409);
    expect(body.message).toBe("Kayıt zaten mevcut");
    expect(JSON.stringify(body)).not.toContain("email");
  });

  it("maps Prisma P2025 (not found) to 404", () => {
    const err = new Prisma.PrismaClientKnownRequestError("Record not found", {
      code: "P2025",
      clientVersion: "test",
    });
    expect(run(err).status).toBe(404);
  });

  it("sanitizes an unmapped Prisma code to a generic 500", () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      "column x does not exist",
      {
        code: "P2099",
        clientVersion: "test",
      },
    );
    const { status, body } = run(err);
    expect(status).toBe(500);
    expect(body.message).toBe("Sunucu hatası");
    expect(JSON.stringify(body)).not.toContain("column x");
  });

  it("sanitizes an arbitrary internal error — no leak of error.message", () => {
    const { status, body } = run(
      new Error("connect ECONNREFUSED 10.0.0.5:5432"),
    );
    expect(status).toBe(500);
    expect(body.message).toBe("Sunucu hatası");
    expect(JSON.stringify(body)).not.toContain("ECONNREFUSED");
    expect(JSON.stringify(body)).not.toContain("5432");
  });

  it("localizes the sanitized 500 for an English request", () => {
    const { body } = run(new Error("boom"), {
      "accept-language": "en",
    });
    expect(body.message).toBe("Server error");
  });
});
