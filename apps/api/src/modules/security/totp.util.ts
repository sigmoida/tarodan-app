import * as crypto from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function encodeBase32(input: Buffer): string {
  let value = 0;
  let bits = 0;
  let output = "";

  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }

    value &= (1 << bits) - 1;
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function decodeBase32(input: string): Buffer {
  const normalized = input.toUpperCase().replace(/=+$/g, "");
  let value = 0;
  let bits = 0;
  const output: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) {
      throw new Error("Invalid base32 secret");
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }

    value &= (1 << bits) - 1;
  }

  return Buffer.from(output);
}

export function generateTotpSecret(byteLength = 20): string {
  return encodeBase32(crypto.randomBytes(byteLength));
}

export function generateTotpCode(
  secret: string,
  counter: number,
  digits = 6,
): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const digest = crypto
    .createHmac("sha1", decodeBase32(secret))
    .update(counterBuffer)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;

  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

export function verifyTotpCode(
  secret: string,
  code: string,
  nowMs = Date.now(),
  window = 1,
): boolean {
  if (!/^\d{6}$/.test(code)) return false;

  const counter = Math.floor(nowMs / 1000 / 30);
  const supplied = Buffer.from(code);

  for (let offset = -window; offset <= window; offset++) {
    const expected = Buffer.from(generateTotpCode(secret, counter + offset));
    if (
      expected.length === supplied.length &&
      crypto.timingSafeEqual(expected, supplied)
    ) {
      return true;
    }
  }

  return false;
}
