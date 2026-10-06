import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  MailAccountTestResult,
  MailAreaState,
  MailAreaUpdate,
  MailRoutingState,
  MailSenderAccountInput,
  MailSenderAccountView,
} from "@tarodan/types";
import {
  MailRoutingService,
  type MailRoutingChange,
} from "../../mail-routing/mail-routing.service";
import {
  MailSenderAccountService,
  type MailSenderAccountPatch,
} from "../../mail-routing/mail-sender-account.service";
import { AdminAuditService } from "./admin-audit.service";

/**
 * Mail Yönlendirme ekranının admin yüzü. Yazma domain servisinden geçer
 * (§1); bu katman yalnız ZORUNLU denetim kaydını, yazımla AYNI işlemde ekler —
 * denetim yazılamazsa değişiklik de olmaz.
 *
 * Denetime giden önce/sonra değerleri `MailSenderAccountView`dir: şifre (düz
 * ya da şifreli) bu görünümde YOKTUR. Şifre değişimi yalnız
 * `passwordChanged: true` bayrağıyla izlenir.
 */
/** Denetim kaydına şifrenin kendisi değil, yalnız değiştiği bilgisi yazılır. */
interface AuditPasswordFlag {
  passwordChanged: boolean;
}

@Injectable()
export class AdminMailRoutingService {
  constructor(
    private readonly routing: MailRoutingService,
    private readonly accounts: MailSenderAccountService,
    private readonly audit: AdminAuditService,
  ) {}

  getState(): Promise<MailRoutingState> {
    return this.routing.getState();
  }

  createAccount(
    adminUserId: string,
    input: MailSenderAccountInput,
  ): Promise<MailSenderAccountView> {
    return this.accounts.create(input, adminUserId, (tx, change) =>
      this.writeAudit(
        tx,
        adminUserId,
        "mail_sender_account_create",
        change.after?.id ?? "",
        change,
      ),
    );
  }

  updateAccount(
    adminUserId: string,
    id: string,
    patch: MailSenderAccountPatch,
  ): Promise<MailSenderAccountView> {
    const passwordChanged = Boolean(patch.password?.trim());
    return this.accounts.update(id, patch, adminUserId, (tx, change) =>
      this.writeAudit<
        MailSenderAccountView | (MailSenderAccountView & AuditPasswordFlag)
      >(tx, adminUserId, "mail_sender_account_update", id, {
        before: change.before,
        after: change.after ? { ...change.after, passwordChanged } : null,
      }),
    );
  }

  deleteAccount(adminUserId: string, id: string): Promise<void> {
    return this.accounts.remove(id, (tx, change) =>
      this.writeAudit(
        tx,
        adminUserId,
        "mail_sender_account_delete",
        id,
        change,
      ),
    );
  }

  /**
   * Gerçek test gönderimi. Yapılandırmayı değiştirmez (yalnız son test
   * alanları yazılır), yine de kimin hangi kutuyu hangi adrese denediği
   * izlenir — best-effort denetim: kayıt yazılamazsa test sonucu yine döner.
   */
  async testAccount(
    adminUserId: string,
    id: string,
    to: string,
  ): Promise<MailAccountTestResult> {
    const result = await this.accounts.test(id, to);
    await this.audit.createAuditLog(
      adminUserId,
      "mail_sender_account_test",
      "MailSenderAccount",
      id,
      null,
      { to, ok: result.ok, error: result.error },
    );
    return result;
  }

  updateArea(
    adminUserId: string,
    areaId: string,
    update: MailAreaUpdate,
  ): Promise<MailAreaState> {
    return this.routing.updateArea(areaId, update, adminUserId, (tx, change) =>
      this.audit
        .createRequiredAuditLog(
          adminUserId,
          "mail_area_update",
          "MailAreaSetting",
          areaId,
          change.before,
          change.after,
          tx,
        )
        .then(() => undefined),
    );
  }

  private async writeAudit<T>(
    tx: Prisma.TransactionClient,
    adminUserId: string,
    action: string,
    entityId: string,
    change: MailRoutingChange<T>,
  ): Promise<void> {
    await this.audit.createRequiredAuditLog(
      adminUserId,
      action,
      "MailSenderAccount",
      entityId,
      change.before,
      change.after,
      tx,
    );
  }
}
