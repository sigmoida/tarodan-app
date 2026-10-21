import { Transform, type TransformFnParams } from "class-transformer";

/**
 * Text fields of a JSON body under the global `enableImplicitConversion`:
 * class-transformer turns an object into "[object Object]" for a `string`
 * field before any `@Transform` runs, and `@IsString()` then accepts it. Both
 * decorators below read the raw input (`obj[key]`), as `QueryBoolean` does.
 * A number or boolean still becomes text, as it would in a query string.
 */
const rawOf = ({ obj, key }: TransformFnParams): unknown =>
  (obj as Record<string, unknown> | undefined)?.[key];

const isObject = (raw: unknown): raw is object =>
  typeof raw === "object" && raw !== null;

const isPlainObject = (raw: unknown): raw is Record<string, unknown> => {
  if (!isObject(raw) || Array.isArray(raw)) return false;
  const proto: unknown = Object.getPrototypeOf(raw);
  return proto === Object.prototype || proto === null;
};

/**
 * Hands an object or array back as it came, so `@IsString()` refuses it with
 * 400 instead of accepting "[object Object]".
 */
export function RawObject(): PropertyDecorator {
  return Transform((params: TransformFnParams): unknown => {
    const raw = rawOf(params);
    return isObject(raw) ? raw : params.value;
  });
}

/**
 * For a field that carries JSON text (in a query string): a plain object in
 * a JSON body is written as that JSON text, so both forms validate and read
 * the same. An array or any other object is handed back for `@IsString()` to
 * refuse.
 */
export function JsonObjectAsText(): PropertyDecorator {
  return Transform((params: TransformFnParams): unknown => {
    const raw = rawOf(params);
    if (isPlainObject(raw)) return JSON.stringify(raw);
    return isObject(raw) ? raw : params.value;
  });
}
