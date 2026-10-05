import { smsFixedVerificationCode } from "./sms";

describe("smsFixedVerificationCode", () => {
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    APP_ENV: process.env.APP_ENV,
    SMS_FIXED_VERIFICATION_CODE: process.env.SMS_FIXED_VERIFICATION_CODE,
  };

  const set = (key: keyof typeof saved, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };

  afterEach(() => {
    for (const key of Object.keys(saved) as (keyof typeof saved)[]) {
      set(key, saved[key]);
    }
  });

  it("is off when the variable is unset", () => {
    set("SMS_FIXED_VERIFICATION_CODE", undefined);
    expect(smsFixedVerificationCode()).toBeNull();
  });

  it("returns the fixed code on staging", () => {
    set("NODE_ENV", "production");
    set("APP_ENV", "staging");
    set("SMS_FIXED_VERIFICATION_CODE", "123456");
    expect(smsFixedVerificationCode()).toBe("123456");
  });

  it("returns the fixed code in local development", () => {
    set("NODE_ENV", "development");
    set("APP_ENV", undefined);
    set("SMS_FIXED_VERIFICATION_CODE", " 000000 ");
    expect(smsFixedVerificationCode()).toBe("000000");
  });

  it("is ignored on the live deployment even if boot validation were bypassed", () => {
    set("NODE_ENV", "production");
    set("APP_ENV", "production");
    set("SMS_FIXED_VERIFICATION_CODE", "123456");
    expect(smsFixedVerificationCode()).toBeNull();
  });

  it("is ignored on an optimized build that does not say it is staging", () => {
    set("NODE_ENV", "production");
    set("APP_ENV", undefined);
    set("SMS_FIXED_VERIFICATION_CODE", "123456");
    expect(smsFixedVerificationCode()).toBeNull();
  });

  it("ignores a value the verify DTO could never accept", () => {
    set("NODE_ENV", "development");
    set("SMS_FIXED_VERIFICATION_CODE", "12ab");
    expect(smsFixedVerificationCode()).toBeNull();
  });
});
