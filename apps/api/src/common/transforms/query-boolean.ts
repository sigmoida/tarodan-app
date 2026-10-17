import { Transform } from "class-transformer";

/**
 * Query-string boolean: yalnız `"true"` (ya da gerçek `true`) → `true`, geri
 * kalan her değer (`"false"`, `""`, `"all"`, …) → `false`.
 *
 * Ham girdiye (`obj[key]`) bakılır, `value`'ya DEĞİL: global ValidationPipe
 * `enableImplicitConversion: true` ile çalışır ve class-transformer, `boolean`
 * tipli bir alanda özel `@Transform`'dan ÖNCE `Boolean(value)` uygular —
 * `Boolean("false") === true`. Eski kalıp
 * `@Transform(({ value }) => value === "true" || value === true)` bu yüzden
 * `?flag=false` isteğini `true`'ya çeviriyordu (spec: query-boolean.spec.ts).
 */
export function QueryBoolean(): PropertyDecorator {
  return Transform(({ obj, key }) => {
    const raw = (obj as Record<string, unknown> | undefined)?.[key];
    return raw === true || raw === "true";
  });
}
