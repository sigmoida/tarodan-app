import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { SuratShipmentFailure } from "../helpers/surat-cargo.types";

const USER_TECHNICAL_TR =
  "Kargo sistemine şu an ulaşılamıyor. Lütfen bir süre sonra tekrar deneyin.";
const USER_BUSINESS_TR =
  "Gönderi oluşturulamadı. Bilgilerinizi kontrol edip tekrar deneyin.";

/**
 * Maps a failed Surat result to HTTP exceptions. Logs should include full technical/business detail.
 */
export function mapSuratFailureToHttpException(
  result: SuratShipmentFailure,
): never {
  if (result.kind === "business") {
    throw new BadRequestException({
      message: USER_BUSINESS_TR,
      code: "SURAT_BUSINESS",
      correlationId: result.correlationId,
    });
  }

  throw new ServiceUnavailableException({
    message: USER_TECHNICAL_TR,
    code: "SURAT_TECHNICAL",
    correlationId: result.correlationId,
    suratCode: result.code,
  });
}
