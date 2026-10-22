import { registerDecorator, type ValidationOptions } from "class-validator";

/** Digits with at most two decimals, as JS writes the number (no sign, no exponent). */
const TL_AMOUNT_TEXT = /^\d+(\.\d{1,2})?$/;

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
 * `isTlAmount` as a property decorator. Pair it with `@JsonNumber()` so text
 * such as "59.9" is refused instead of converted.
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
