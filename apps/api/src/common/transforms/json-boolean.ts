import { Transform, type TransformFnParams } from "class-transformer";

/**
 * A boolean that must arrive as a JSON boolean. The global pipe runs with
 * `enableImplicitConversion`, which turns any non-empty text into `true`
 * (`Boolean("false")`), so `"false"` or `"no"` would pass `@IsBoolean()` as
 * `true`. This hands the raw input (`obj[key]`) back instead: only `true` and
 * `false` pass `@IsBoolean()`, any text or number is a 400, and a missing
 * field stays missing. For statements whose `true` is evidence (consents);
 * multipart and query fields use `FormBoolean` and `QueryBoolean`.
 */
export function JsonBoolean(): PropertyDecorator {
  return Transform(
    ({ obj, key }: TransformFnParams): unknown =>
      (obj as Record<string, unknown> | undefined)?.[key],
  );
}
