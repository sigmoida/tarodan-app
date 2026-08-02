import { Injectable } from "@nestjs/common";
import { Prisma, SiteAccessPin } from "@prisma/client";
import { randomInt } from "crypto";
import { PrismaService } from "../../prisma";

// No I/L/O/0/1 — codes are read aloud and typed by invitees.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const CREATE_RETRIES = 3;

/**
 * Early-access invite codes for the pre-launch SITE_LOCKED storefront gate.
 * Admin CRUD lives in modules/admin; this service owns code generation and
 * the public verify-and-consume path.
 */
@Injectable()
export class SiteAccessPinService {
  constructor(private readonly prisma: PrismaService) {}

  generateCode(): string {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    }
    return code;
  }

  /** Uppercase and strip separators/whitespace the invitee may have typed. */
  normalizeCode(raw: string): string {
    return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  /** Create a pin with a server-generated unique code (retry on collision). */
  async createWithUniqueCode(
    data: Omit<Prisma.SiteAccessPinCreateInput, "code">,
  ): Promise<SiteAccessPin> {
    let lastError: unknown;
    for (let attempt = 0; attempt < CREATE_RETRIES; attempt++) {
      try {
        return await this.prisma.siteAccessPin.create({
          data: { ...data, code: this.generateCode() },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          lastError = error;
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  /**
   * Validate a code and count the unlock in one atomic statement — the
   * cross-column `used_count < max_uses` guard is not expressible in
   * `updateMany`, and a read-then-write pair would race. The counter only
   * moves on success.
   */
  async verifyAndConsume(rawCode: string): Promise<boolean> {
    const code = this.normalizeCode(rawCode);
    if (!code) return false;

    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE site_access_pins
      SET used_count = used_count + 1, last_used_at = NOW(), updated_at = NOW()
      WHERE code = ${code}
        AND is_active = true
        AND (expires_at IS NULL OR expires_at > NOW())
        AND (max_uses IS NULL OR used_count < max_uses)
      RETURNING id
    `;
    return rows.length === 1;
  }
}
