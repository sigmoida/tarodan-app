import { applyDecorators } from "@nestjs/common";
import {
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateBy,
  ValidateIf,
  type ValidationArguments,
} from "class-validator";

/** Google auth codes and id tokens, Apple identity tokens. */
export const PROVIDER_PROOF_MAX_LENGTH = 4096;

type GoogleProofField = "code" | "idToken";

const OTHER_FIELD: Record<GoogleProofField, GoogleProofField> = {
  code: "idToken",
  idToken: "code",
};

/** `null` counts as not sent, as the services read it (`proof.code ? ...`). */
function isSent(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function otherValue(
  args: ValidationArguments | undefined,
  other: GoogleProofField,
): unknown {
  return (args?.object as Record<string, unknown> | undefined)?.[other];
}

/**
 * The one rule for a Google proof, on every route that takes one
 * (`POST /auth/google`, `POST /auth/reauth`, `POST /auth/social/google/link`):
 * exactly one of `code` (web popup, exchanged with Google) and `idToken`
 * (native sign-in).
 *
 * - A field that is sent is always checked (string, not empty, at most
 *   `PROVIDER_PROOF_MAX_LENGTH`).
 * - With neither sent, both are reported as missing.
 * - With both sent, the request is a 400. Before, each field skipped its
 *   checks when the other was present, so with both sent neither was checked
 *   and up to the body limit reached the Google exchange.
 *
 * @param applies whether the body carries a Google proof at all (the step-up
 *   only with `provider: "google"`); by default always.
 */
export function IsGoogleProof(
  field: GoogleProofField,
  applies: (body: Record<string, unknown>) => boolean = () => true,
): PropertyDecorator {
  const other = OTHER_FIELD[field];
  return applyDecorators(
    ValidateIf(
      (body: Record<string, unknown>, value: unknown) =>
        applies(body) && (isSent(value) || !isSent(body[other])),
    ),
    IsString(),
    IsNotEmpty(),
    MaxLength(PROVIDER_PROOF_MAX_LENGTH),
    ValidateBy({
      name: "googleProofExclusive",
      validator: {
        validate: (_value: unknown, args?: ValidationArguments) =>
          !isSent(otherValue(args, other)),
        defaultMessage: () =>
          `${field} must not be sent together with ${other}`,
      },
    }),
  );
}
