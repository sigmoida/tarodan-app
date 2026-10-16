import { IsBoolean, validateSync } from "class-validator";
import { IsOptionalNotNull } from "./optional-not-null";

class Body {
  @IsOptionalNotNull()
  @IsBoolean()
  flag?: boolean | null;
}

const errorsFor = (flag: unknown) => {
  const body = new Body();
  if (flag !== undefined) (body as { flag?: unknown }).flag = flag;
  return validateSync(body).length;
};

describe("IsOptionalNotNull", () => {
  it("alan yoksa doğrulamayı atlar", () => {
    expect(errorsFor(undefined)).toBe(0);
  });

  it("değer varsa doğrular", () => {
    expect(errorsFor(true)).toBe(0);
    expect(errorsFor("yes")).toBe(1);
  });

  it("null'ı reddeder (@IsOptional'dan farkı)", () => {
    expect(errorsFor(null)).toBe(1);
  });
});
