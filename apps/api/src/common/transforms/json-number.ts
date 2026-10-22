import { Transform, type TransformFnParams } from "class-transformer";

/**
 * A number that must arrive as a JSON number. The global pipe runs with
 * `enableImplicitConversion`, which reads the text "59.9" as 59.9, `true` as
 * 1 and "" as 0 before any validator runs, so a client sending text would
 * pass `@IsNumber()`. This hands the raw input (`obj[key]`) back instead:
 * only a JSON number passes, any text, boolean, array or object is a 400, and
 * a missing field stays missing. For amounts a client states as evidence
 * (the boost `expectedPrice`); the boolean twin is `JsonBoolean`.
 */
export function JsonNumber(): PropertyDecorator {
  return Transform(
    ({ obj, key }: TransformFnParams): unknown =>
      (obj as Record<string, unknown> | undefined)?.[key],
  );
}
