import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../../common/validators/global-validation-pipe-options";
import { ReauthDto } from "../reauth/dto/reauth.dto";
import { GoogleLinkDto } from "../sign-in-methods/dto/link-provider.dto";
import { GoogleAuthDto } from "./google-auth.dto";
import { PROVIDER_PROOF_MAX_LENGTH } from "./google-proof.validator";

/**
 * The Google proof rule (`IsGoogleProof`) on every route that takes one, run
 * through the real global ValidationPipe settings: exactly one of `code` and
 * `idToken`, each bounded. Both together used to skip every check on both.
 */
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);

const CODE = "4/0AeaYSHB-web-popup-code";
const ID_TOKEN = "eyJhbGciOiJSUzI1NiJ9.native.signature";
const TOO_LONG = "x".repeat(PROVIDER_PROOF_MAX_LENGTH + 1);

const routes: Array<{
  name: string;
  metatype: new () => object;
  base: Record<string, unknown>;
}> = [
  { name: "POST /auth/google", metatype: GoogleAuthDto, base: {} },
  {
    name: "POST /auth/social/google/link",
    metatype: GoogleLinkDto,
    base: { reauthToken: "step-up-token" },
  },
  {
    name: "POST /auth/reauth (google)",
    metatype: ReauthDto,
    base: { provider: "google" },
  },
];

async function validate(
  metatype: new () => object,
  body: Record<string, unknown>,
): Promise<string[]> {
  try {
    await pipe.transform(body, { type: "body", metatype });
    return [];
  } catch (error) {
    if (!(error instanceof BadRequestException)) throw error;
    const response = error.getResponse() as { message: string[] };
    return response.message;
  }
}

describe.each(routes)("Google proof on $name", ({ metatype, base }) => {
  it("accepts a code alone (web)", async () => {
    expect(await validate(metatype, { ...base, code: CODE })).toEqual([]);
  });

  it("accepts an idToken alone (native)", async () => {
    expect(await validate(metatype, { ...base, idToken: ID_TOKEN })).toEqual(
      [],
    );
  });

  it("treats a null partner as not sent", async () => {
    expect(
      await validate(metatype, { ...base, code: null, idToken: ID_TOKEN }),
    ).toEqual([]);
  });

  it("refuses a body without either", async () => {
    const messages = await validate(metatype, base);
    expect(messages).toEqual(
      expect.arrayContaining([
        "code should not be empty",
        "idToken should not be empty",
      ]),
    );
  });

  it("refuses both together", async () => {
    const messages = await validate(metatype, {
      ...base,
      code: CODE,
      idToken: ID_TOKEN,
    });
    expect(messages).toEqual(
      expect.arrayContaining([
        "code must not be sent together with idToken",
        "idToken must not be sent together with code",
      ]),
    );
  });

  it("checks the bound of each field even when both are sent", async () => {
    const messages = await validate(metatype, {
      ...base,
      code: TOO_LONG,
      idToken: TOO_LONG,
    });
    expect(messages).toEqual(
      expect.arrayContaining([
        `code must be shorter than or equal to ${PROVIDER_PROOF_MAX_LENGTH} characters`,
        `idToken must be shorter than or equal to ${PROVIDER_PROOF_MAX_LENGTH} characters`,
      ]),
    );
  });

  it.each(["code", "idToken"])("refuses an oversized %s", async (field) => {
    expect(await validate(metatype, { ...base, [field]: TOO_LONG })).toEqual([
      `${field} must be shorter than or equal to ${PROVIDER_PROOF_MAX_LENGTH} characters`,
    ]);
  });

  it.each(["code", "idToken"])("refuses an empty %s", async (field) => {
    expect(await validate(metatype, { ...base, [field]: "" })).toEqual(
      expect.arrayContaining([`${field} should not be empty`]),
    );
  });
});

describe("Google proof on POST /auth/reauth without provider google", () => {
  it("ignores Google fields on a password proof (the service never reads them)", async () => {
    expect(
      await validate(ReauthDto, {
        password: "current-password",
        code: CODE,
        idToken: ID_TOKEN,
      }),
    ).toEqual([]);
  });

  it("does not ask an Apple proof for a Google field", async () => {
    expect(
      await validate(ReauthDto, {
        provider: "apple",
        identityToken: ID_TOKEN,
      }),
    ).toEqual([]);
  });
});
