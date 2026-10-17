import { Injectable } from "@nestjs/common";
import type { AdminLegalIdentity } from "@tarodan/types";
import { PrismaService } from "../../../prisma";
import { AdminAuditService } from "../ops/admin-audit.service";
import { LegalIdentityService } from "../../legal-identity/legal-identity.service";
import {
  legalIdentityAuditSummary,
  rethrowNationalIdConflict,
} from "../../legal-identity/helpers/legal-identity-status";
import type { AdminCorrectLegalIdentityDto } from "../../legal-identity/dto/legal-identity.dto";

/** Denetim kaydı eylem adı — Denetim Kayıtları ekranında bu adla aranır. */
export const LEGAL_IDENTITY_CORRECTION_ACTION = "user_legal_identity_correct";

/**
 * Admin yasal kimlik düzeltmesi. Üye kimliğini bir kez girer, değiştiremez;
 * yanlışlık (yazım, nüfus kaydı değişikliği) yalnız buradan düzeltilir.
 *
 * Yazım domain servisinden geçer (`LegalIdentityService.applyCorrection`:
 * aynı doğrulama + tekillik), denetim kaydı AYNI transaction'da ve zorunludur:
 * kayıt yazılamazsa düzeltme de geri alınır. Kayıt gerekçeyi, değişen alanları
 * ve TCKN'nin MASKELİ hâlini taşır — ad ve tam numara değer olarak yazılmaz.
 */
@Injectable()
export class AdminLegalIdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly legalIdentity: LegalIdentityService,
  ) {}

  async correct(
    adminId: string,
    userId: string,
    dto: AdminCorrectLegalIdentityDto,
  ): Promise<AdminLegalIdentity> {
    const { reason, ...input } = dto;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const change = await this.legalIdentity.applyCorrection(
          userId,
          input,
          tx,
        );
        const summary = legalIdentityAuditSummary(change);
        await this.audit.createRequiredAuditLog(
          adminId,
          LEGAL_IDENTITY_CORRECTION_ACTION,
          "User",
          userId,
          { nationalIdMasked: summary.nationalIdMaskedBefore },
          {
            changedFields: summary.changedFields,
            nationalIdMasked: summary.nationalIdMaskedAfter,
            reason,
          },
          tx,
        );
        return change.after;
      });
    } catch (error) {
      rethrowNationalIdConflict(error);
    }
  }
}
