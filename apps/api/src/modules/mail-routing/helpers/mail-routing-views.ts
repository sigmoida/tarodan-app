import type { MailAreaSetting, MailSenderAccount } from "@prisma/client";
import type {
  MailAreaId,
  MailAreaState,
  MailSenderAccountView,
} from "@tarodan/types";
import {
  parseInternalRecipients,
  parseMailEventStates,
} from "../../mail/helpers/mail-area-settings";

/**
 * Admin yanıt şekilleri. Hesabın şifresi (şifreli hali dahil) HİÇBİR yanıta,
 * loga ya da denetim kaydına girmez: görünüm yalnız `hasPassword` taşır ve
 * denetim kaydı da bu görünümden yazılır.
 */
export function toSenderAccountView(
  row: MailSenderAccount,
  usedByAreas: MailAreaId[],
): MailSenderAccountView {
  return {
    id: row.id,
    address: row.address,
    displayName: row.displayName,
    host: row.host,
    port: row.port,
    secure: row.secure,
    username: row.username,
    hasPassword: row.passwordEncrypted.length > 0,
    lastTestAt: row.lastTestAt?.toISOString() ?? null,
    lastTestOk: row.lastTestOk,
    lastTestError: row.lastTestError,
    usedByAreas,
  };
}

/** Alan satırı (yoksa varsayılanlar) → ekran durumu. */
export function toAreaState(
  area: MailAreaId,
  row: MailAreaSetting | undefined,
  templateKeys: string[],
): MailAreaState {
  return {
    id: area,
    templateKeys,
    senderAccountId: row?.senderAccountId ?? null,
    displayName: row?.displayName ?? null,
    replyTo: row?.replyTo ?? null,
    internalRecipients: parseInternalRecipients(row?.internalRecipients),
    events: parseMailEventStates(area, row?.events),
  };
}
