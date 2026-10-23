import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ArgumentsHost,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AllExceptionsFilter } from "./all-exceptions.filter";
import { I18nService } from "../../modules/i18n/i18n.service";
import { i18nMessage } from "../../modules/i18n/localized-message";
import { runWithRequestId } from "../context/request-context";

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

  it("preserves extra structured fields on a catalog-key payload", () => {
    const { status, body } = run(
      new ForbiddenException({
        ...i18nMessage("server.common.recordNotFound"),
        errorCode: "USER_BANNED",
        bannedReason: "spam",
      }),
    );
    expect(status).toBe(403);
    expect(body.message).toBe("Kayıt bulunamadı");
    expect(body.errorCode).toBe("USER_BANNED");
    expect(body.bannedReason).toBe("spam");
  });

  it("renders localized payloads nested in extra fields (errors[])", () => {
    const { body } = run(
      new BadRequestException({
        ...i18nMessage("server.common.recordNotFound"),
        errors: [i18nMessage("server.common.recordExists")],
        details: { activeProducts: 2 },
      }),
      { "accept-language": "en" },
    );
    expect(body.message).toBe("Record not found");
    expect(body.errors).toEqual(["This record already exists"]);
    expect(body.details).toEqual({ activeProducts: 2 });
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

  /**
   * Sansürlenmiş 500'de istemciye tek bir iz kalır: korelasyon kimliği.
   * Kullanıcı destek talebinde bu kodu söyler, operatör aynı kimlikle konsol
   * satırlarını ve error_logs kaydını bulur — içeriden hiçbir detay sızmadan.
   */
  it("sanitize edilmiş 500 gövdesine korelasyon kimliğini ekler", () => {
    const { body } = runWithRequestId("req-abc", () => run(new Error("boom")));
    expect(body.requestId).toBe("req-abc");
  });

  it("kimlik yokken (bağlam dışı) alan hiç eklenmez", () => {
    const { body } = run(new Error("boom"));
    expect(body).not.toHaveProperty("requestId");
  });

  it("kasıtlı 4xx gövdesi DEĞİŞMEZ (mevcut sözleşme korunur)", () => {
    const { body } = runWithRequestId("req-abc", () =>
      run(new ForbiddenException("nope")),
    );
    expect(body).not.toHaveProperty("requestId");
  });

  /**
   * The 5xx log line becomes the Sentry event message and fingerprint. The
   * query string carries user input (search text, possibly an e-mail), so it
   * never reaches the log: only the method, the path and the status do, and
   * every query of one endpoint groups into one issue.
   */
  it("logs a 5xx with the request path only, never the query string", () => {
    const error = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    const json = jest.fn();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: jest.fn(() => ({ json })) }),
        getRequest: () => ({
          method: "GET",
          url: "/api/products?search=ali%40mail.com&page=2",
          headers: {},
        }),
      }),
    } as unknown as ArgumentsHost;

    try {
      filter.catch(new Error("boom"), host);

      expect(error).toHaveBeenCalledTimes(1);
      expect(error.mock.calls[0][0]).toBe("GET /api/products -> 500");
      expect(JSON.stringify(error.mock.calls)).not.toContain("ali");
    } finally {
      error.mockRestore();
    }
  });
  describe("client aborts", () => {
    const abort = (props: Record<string, unknown>, message = "aborted") =>
      Object.assign(new Error(message), props);

    function runAbort(
      exception: unknown,
      response: Record<string, unknown> = {},
    ) {
      const end = jest.fn();
      const json = jest.fn();
      const status = jest.fn(() => ({ json, end }));
      const host = {
        switchToHttp: () => ({
          getResponse: () => ({ status, ...response }),
          getRequest: () => ({
            method: "POST",
            url: "/api/media/upload/product?token=secret",
            headers: {},
            readableAborted: true,
          }),
        }),
      } as unknown as ArgumentsHost;
      const error = jest.spyOn(Logger.prototype, "error");
      const debug = jest
        .spyOn(Logger.prototype, "debug")
        .mockImplementation(() => undefined);
      try {
        filter.catch(exception, host);
        return {
          status,
          end,
          json,
          error: error.mock.calls,
          debug: debug.mock.calls,
        };
      } finally {
        error.mockRestore();
        debug.mockRestore();
      }
    }

    it.each([
      ["multer", abort({}, "Request aborted")],
      ["body-parser", abort({ type: "request.aborted" })],
      ["ECONNABORTED", abort({ code: "ECONNABORTED" })],
      ["ECONNRESET", abort({ code: "ECONNRESET" })],
    ])("%s: no error log, debug only, no query string", (_name, err) => {
      const out = runAbort(err);
      expect(out.error).toHaveLength(0);
      expect(out.debug).toHaveLength(1);
      expect(String(out.debug[0][0])).toBe(
        "POST /api/media/upload/product -> client aborted the request",
      );
      expect(out.json).not.toHaveBeenCalled();
    });

    it("writes nothing when the socket is already closed", () => {
      const out = runAbort(abort({}, "Request aborted"), {
        socket: { destroyed: true },
      });
      expect(out.status).not.toHaveBeenCalled();
    });

    it("ends a still-open response with an empty 400", () => {
      const out = runAbort(abort({}, "Request aborted"), {
        socket: { destroyed: false },
      });
      expect(out.status).toHaveBeenCalledWith(400);
      expect(out.end).toHaveBeenCalled();
      expect(out.json).not.toHaveBeenCalled();
    });

    it("an upstream ECONNRESET with the client still connected is a logged 500", () => {
      const error = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => undefined);
      try {
        const upstream = abort({ code: "ECONNRESET" }, "socket hang up");
        expect(run(upstream).status).toBe(500);
        expect(error).toHaveBeenCalledTimes(1);
      } finally {
        error.mockRestore();
      }
    });

    it("still turns an unrelated error into a logged 500", () => {
      const error = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => undefined);
      try {
        expect(run(new Error("Request aborted by admin policy")).status).toBe(
          500,
        );
        expect(error).toHaveBeenCalledTimes(1);
      } finally {
        error.mockRestore();
      }
    });
  });
});
