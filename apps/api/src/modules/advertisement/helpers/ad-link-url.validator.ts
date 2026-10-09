import {
  isURL,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from "class-validator";

/**
 * Reklam hedef bağlantısı kuralı — tıklanınca tarayıcının gideceği adres.
 *
 * Kabul edilen iki biçim:
 *  - mutlak `http(s)://` URL (dış kampanya sayfası),
 *  - TEK `/` ile başlayan site içi yol (`/kategori/x`, `/listings?sort=new`).
 *
 * Neden: alan eskiden serbest metindi; `javascript:`/`data:` bir değer
 * web'de `<a href>` olarak render edilince tıklayanın oturumunda kod
 * çalıştırırdı. `//evil.com` ve `/\evil.com` göreli görünür ama tarayıcı
 * onları protokol-göreli dış adres olarak açar — bu yüzden ikinci karakter
 * `/` ya da `\` olamaz, ters bölü ve boşluk/kontrol karakteri hiç olamaz.
 */
export const AD_LINK_URL_MAX_LENGTH = 2048;

const SITE_PATH = /^\/(?![/\\])[^\s\\]*$/;

export function isAdLinkUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > AD_LINK_URL_MAX_LENGTH) {
    return false;
  }
  if (value.startsWith("/")) return SITE_PATH.test(value);
  return isURL(value, {
    protocols: ["http", "https"],
    require_protocol: true,
  });
}

export function IsAdLinkUrl(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isAdLinkUrl",
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return isAdLinkUrl(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be an http(s) URL or a site path starting with a single "/"`;
        },
      },
    });
  };
}
