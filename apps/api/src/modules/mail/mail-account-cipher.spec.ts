import { MailAccountCipher } from "./mail-account-cipher";

describe("MailAccountCipher — kutu şifresi durağan şifreleme", () => {
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  const cipherWith = (env: Record<string, string | undefined>) =>
    new MailAccountCipher({ get: (key: string) => env[key] } as never);

  it("kendi anahtarıyla şifreler ve geri açar", () => {
    const cipher = cipherWith({ MAIL_ACCOUNT_ENCRYPTION_KEY: "k".repeat(40) });

    const encrypted = cipher.encrypt("mailbox-pass");

    expect(encrypted).not.toContain("mailbox-pass");
    expect(cipher.decrypt(encrypted)).toBe("mailbox-pass");
  });

  it("başka anahtarla (döndürülmüş) açılamaz", () => {
    const encrypted = cipherWith({
      MAIL_ACCOUNT_ENCRYPTION_KEY: "k".repeat(40),
    }).encrypt("mailbox-pass");

    expect(() =>
      cipherWith({ MAIL_ACCOUNT_ENCRYPTION_KEY: "z".repeat(40) }).decrypt(
        encrypted,
      ),
    ).toThrow();
  });

  it("canlıda anahtar yoksa kullanılamaz (2FA anahtarına ya da JWT'ye düşmez)", () => {
    process.env.NODE_ENV = "production";
    const cipher = cipherWith({
      JWT_SECRET: "j".repeat(40),
      TWO_FACTOR_ENCRYPTION_KEY: "t".repeat(40),
    });

    expect(cipher.isAvailable()).toBe(false);
    expect(() => cipher.encrypt("x")).toThrow(/MAIL_ACCOUNT_ENCRYPTION_KEY/);
  });

  it("canlı dışında boş anahtar JWT_SECRET'a düşer", () => {
    process.env.NODE_ENV = "development";
    const cipher = cipherWith({ JWT_SECRET: "j".repeat(40) });

    expect(cipher.isAvailable()).toBe(true);
    expect(cipher.decrypt(cipher.encrypt("x"))).toBe("x");
  });
});
