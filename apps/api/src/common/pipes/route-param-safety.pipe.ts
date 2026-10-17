import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from "@nestjs/common";
import { i18nMessage } from "../../modules/i18n";

/**
 * Yol parametresi üst sınırı. En uzun meşru değer depo anahtarıdır
 * (`DELETE /media/file/*`, S3 anahtarı ≤ 1024 bayt); id'ler 36 karakter.
 */
export const MAX_ROUTE_PARAM_LENGTH = 1024;

/** C0 kontrol karakterleri + DEL — NUL (`%00`) dahil. */
// eslint-disable-next-line no-control-regex -- kontrol karakteri aramak amacın kendisi
const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/;

function isUnsafe(value: unknown): boolean {
  return (
    typeof value === "string" &&
    (value.length > MAX_ROUTE_PARAM_LENGTH || CONTROL_CHAR_RE.test(value))
  );
}

/**
 * Global: yol parametrelerindeki kontrol karakterlerini ve aşırı uzun
 * değerleri 400 ile reddeder — HER uçta, id tipinden bağımsız.
 *
 * Neden: id kolonları `text` olduğu için biçimsiz bir id normalde yalnız
 * "bulunamadı" (404) üretir; ama `%00` gibi bir NUL baytı Postgres'e ulaşınca
 * sorgu "invalid byte sequence" ile patlar ve sanitize edilmiş 500 döner.
 * UUID olmayan meşru id'ler (seed'li vergi/filtre satırları, slug, anahtar)
 * bu kuraldan etkilenmez; UUID biçimi uç bazında `UuidParam` ile denetlenir.
 */
@Injectable()
export class RouteParamSafetyPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (metadata.type !== "param") return value;
    const values =
      value !== null && typeof value === "object"
        ? Object.values(value as Record<string, unknown>) // @Param() — tüm parametreler
        : [value];
    if (values.some(isUnsafe)) {
      throw new BadRequestException(
        i18nMessage("server.common.invalidRouteParam"),
      );
    }
    return value;
  }
}
