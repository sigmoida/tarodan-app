import { registerDecorator, type ValidationOptions } from "class-validator";

/** Digits with at most two decimals, as JS writes the number (no sign, no exponent). */
const TL_AMOUNT_TEXT = /^\d+(\.\d{1,2})?$/;

/**
 * The largest amount a `Decimal(10, 2)` money column holds. A larger input
 * fails in the database as a generic 500, so a DTO or service bounds amounts
 * written to such a column by it. An amount two users agree on has a lower
 * ceiling, shared with the clients: `TL_NEGOTIATED_AMOUNT_MAX` in
 * `@tarodan/types`.
 */
export const TL_AMOUNT_COLUMN_MAX = 99_999_999.99;

/**
 * A TL amount in a JSON body: a finite number of at least 0 with at most two
 * decimals (whole kuruş). Decided on the shortest decimal form JS writes for
 * the number (`String(value)`), which is what the client sent: 59.9 and 59.99
 * pass, 59.999, 0.1 + 0.2 (0.30000000000000004), -1 and the exponent forms
 * (1e-7, 1e21) do not. class-validator's `@IsNumber({ maxDecimalPlaces })`
 * throws on an exponent form (a 500 instead of a 400), so it is not used here.
 */
export function isTlAmount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    TL_AMOUNT_TEXT.test(String(value))
  );
}

/**
 * `isTlAmount` for an amount whose sign carries meaning (trade cash: positive
 * when the initiator pays, negative when the receiver pays): its magnitude is
 * a TL amount. -59.99 passes, -59.999 and -1e-7 do not.
 */
export function isSignedTlAmount(value: unknown): value is number {
  return typeof value === "number" && isTlAmount(Math.abs(value));
}

/**
 * `isTlAmount` as a property decorator. Pair it with `@JsonNumber()` so text
 * such as "59.9" is refused instead of converted. Where a released client may
 * still send text, leave `JsonNumber` out: the global pipe's implicit
 * conversion then turns "59.9" into 59.9 before this check runs.
 */
export function IsTlAmount(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isTlAmount",
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) => isTlAmount(value),
        defaultMessage: () =>
          `${propertyName} must be a TL amount: a number of at least 0 with at most two decimals`,
      },
    });
  };
}
