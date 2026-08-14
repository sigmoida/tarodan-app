import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { mapSuratFailureToHttpException } from "./surat-result.mapper";

describe("mapSuratFailureToHttpException", () => {
  it("maps business failure to BadRequestException", () => {
    expect(() =>
      mapSuratFailureToHttpException({
        ok: false,
        kind: "business",
        suratMessage: "secret detail",
        correlationId: "c1",
        idempotencyKey: "k1",
      }),
    ).toThrow(BadRequestException);
  });

  it("maps technical failure to ServiceUnavailableException", () => {
    expect(() =>
      mapSuratFailureToHttpException({
        ok: false,
        kind: "technical",
        code: "HTTP_5XX",
        cause: undefined,
        correlationId: "c2",
        idempotencyKey: "k2",
      }),
    ).toThrow(ServiceUnavailableException);
  });
});
