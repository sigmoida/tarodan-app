import {
  decryptSecret,
  deriveSecretKey,
  encryptSecret,
  isEncryptedSecret,
} from "./secret-cipher";

describe("secret-cipher — AES-256-GCM durağan sır", () => {
  const key = deriveSecretKey("a-long-enough-key-material-for-tests");

  it("şifreler ve aynı anahtarla geri açar (round trip)", () => {
    const encrypted = encryptSecret("p@ss wörd", key);

    expect(isEncryptedSecret(encrypted)).toBe(true);
    expect(encrypted).not.toContain("p@ss");
    expect(decryptSecret(encrypted, key)).toBe("p@ss wörd");
  });

  it("aynı metni her seferinde farklı şifreler (rastgele IV)", () => {
    expect(encryptSecret("same", key)).not.toBe(encryptSecret("same", key));
  });

  it("yanlış anahtarla açmaya çalışınca fırlatır (çöp döndürmez)", () => {
    const encrypted = encryptSecret("secret", key);

    expect(() =>
      decryptSecret(encrypted, deriveSecretKey("another-key")),
    ).toThrow();
  });

  it("bozulmuş metni reddeder", () => {
    const [prefix, iv, tag] = encryptSecret("secret", key).split(":");

    expect(() => decryptSecret(`${prefix}:${iv}:${tag}:AAAA`, key)).toThrow();
    expect(() => decryptSecret(`${prefix}:${iv}`, key)).toThrow();
  });

  it("v1 öneki olmayan değeri şifreli saymaz", () => {
    expect(isEncryptedSecret("cGxhaW4=")).toBe(false);
    expect(() => decryptSecret("cGxhaW4=", key)).toThrow();
  });

  it("anahtar türetme deterministik ve 32 bayt", () => {
    expect(deriveSecretKey("x").equals(deriveSecretKey("x"))).toBe(true);
    expect(deriveSecretKey("x")).toHaveLength(32);
  });
});
