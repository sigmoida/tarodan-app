import { BadRequestException, Param, ParseUUIDPipe } from "@nestjs/common";
import { i18nMessage } from "../../modules/i18n";

/**
 * UUID yol parametresi — biçimsiz id 400 (`server.common.invalidId`).
 *
 * `@Param("id", ParseUUIDPipe)` ile aynı denetim (her UUID sürümü kabul;
 * deterministik seed id'leri v4 olmayabilir), mesaj ise katalogdan gelir.
 * Yalnız kimliği HER ZAMAN `@default(uuid())` olan varlıklarda kullanılır;
 * seed'le metin id alan satırlar (vergi kuralı, içerik filtresi …) ya da
 * slug/numara da kabul eden uçlar bunu KULLANMAZ.
 */
export function UuidParam(name: string): ParameterDecorator {
  return Param(name, uuidParamPipe());
}

/** `UuidParam`'ın borusu — testler ve özel bileşimler için. */
export function uuidParamPipe(): ParseUUIDPipe {
  return new ParseUUIDPipe({
    exceptionFactory: () =>
      new BadRequestException(i18nMessage("server.common.invalidId")),
  });
}
