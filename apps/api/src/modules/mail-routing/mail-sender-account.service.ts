import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma, type MailSenderAccount } from "@prisma/client";
import type {
  MailAccountTestResult,
  MailAreaId,
  MailSenderAccountInput,
  MailSenderAccountView,
} from "@tarodan/types";
import { PrismaService } from "../../prisma";
import { i18nMessage } from "../i18n";
import { SmtpProvider } from "../mail/smtp.provider";
import { MailRoutingDirectory } from "../mail/mail-routing-directory";
import { MailAccountCipher } from "../mail/mail-account-cipher";
import {
  isMailAreaId,
  isValidMailAddress,
  isValidMailDisplayName,
  normalizeMailAddress,
} from "../mail/helpers/mail-area-settings";
import { frontendUrlForEnvironment } from "../../config/app-urls";
import { toSenderAccountView } from "./helpers/mail-routing-views";
import { renderAccountTestMail } from "./helpers/mail-internal-content";
import type { MailRoutingAfterWrite } from "./mail-routing.service";

/** Güncelleme girdisi: şifre verilmezse kayıtlıdaki korunur. */
export type MailSenderAccountPatch = Partial<MailSenderAccountInput>;

/**
 * Gönderici posta kutuları — oluşturma, güncelleme, silme ve gerçek test
 * gönderimi. Şifre yalnız şifreli yazılır; hiçbir dönüşte, logda ya da
 * denetim kaydında yer almaz (denetim `MailSenderAccountView` üzerinden).
 */
@Injectable()
export class MailSenderAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directory: MailRoutingDirectory,
    private readonly cipher: MailAccountCipher,
    private readonly smtp: SmtpProvider,
  ) {}

  async create(
    input: MailSenderAccountInput,
    actorUserId: string,
    afterWrite?: MailRoutingAfterWrite<MailSenderAccountView>,
  ): Promise<MailSenderAccountView> {
    this.assertCipher();
    const fields = this.validatedFields(input);
    const password = input.password ?? "";
    if (!password.trim()) {
      throw new BadRequestException(
        i18nMessage("server.mailRouting.passwordRequired"),
      );
    }

    const view = await this.prisma.$transaction(async (tx) => {
      await this.assertAddressFree(tx, fields.address);
      const row = await tx.mailSenderAccount.create({
        data: {
          ...fields,
          username: fields.username ?? fields.address,
          passwordEncrypted: this.cipher.encrypt(password),
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
      });
      const after = toSenderAccountView(row, []);
      if (afterWrite) await afterWrite(tx, { before: null, after });
      return after;
    });
    this.directory.invalidate();
    return view;
  }

  async update(
    id: string,
    patch: MailSenderAccountPatch,
    actorUserId: string,
    afterWrite?: MailRoutingAfterWrite<MailSenderAccountView>,
  ): Promise<MailSenderAccountView> {
    const view = await this.prisma.$transaction(async (tx) => {
      const current = await this.findOrThrow(tx, id);
      const usedBy = await this.usedByAreas(tx, id);
      const before = toSenderAccountView(current, usedBy);

      const fields = this.validatedFields({
        address: patch.address ?? current.address,
        displayName: patch.displayName ?? current.displayName,
        host: patch.host !== undefined ? patch.host : current.host,
        port: patch.port !== undefined ? patch.port : current.port,
        secure: patch.secure !== undefined ? patch.secure : current.secure,
        username:
          patch.username !== undefined ? patch.username : current.username,
      });
      if (fields.address !== current.address) {
        await this.assertAddressFree(tx, fields.address);
      }
      const newPassword = patch.password?.trim() ? patch.password : null;
      if (newPassword) this.assertCipher();

      const row = await tx.mailSenderAccount.update({
        where: { id },
        data: {
          ...fields,
          username: fields.username ?? fields.address,
          ...(newPassword
            ? { passwordEncrypted: this.cipher.encrypt(newPassword) }
            : {}),
          updatedBy: actorUserId,
        },
      });
      const after = toSenderAccountView(row, usedBy);
      if (afterWrite) await afterWrite(tx, { before, after });
      return after;
    });
    this.directory.invalidate();
    this.smtp.dropAccountTransport(id);
    return view;
  }

  /** Bir alan kullanıyorsa 409 (FK de RESTRICT'tir — yarış durumunda da). */
  async remove(
    id: string,
    afterWrite?: MailRoutingAfterWrite<MailSenderAccountView>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.findOrThrow(tx, id);
      const usedBy = await this.usedByAreas(tx, id);
      if (usedBy.length > 0) {
        throw new ConflictException(
          i18nMessage("server.mailRouting.accountInUse", {
            areas: usedBy.join(", "),
          }),
        );
      }
      await tx.mailSenderAccount.delete({ where: { id } });
      if (afterWrite) {
        await afterWrite(tx, {
          before: toSenderAccountView(current, []),
          after: null,
        });
      }
    });
    this.directory.invalidate();
    this.smtp.dropAccountTransport(id);
  }

  /**
   * Kutunun KENDİ oturumuyla gerçek bir test e-postası gönderir; sonuç kutuya
   * yazılır (son test alanları). Varsayılan kimliğe düşmez.
   */
  async test(id: string, to: string): Promise<MailAccountTestResult> {
    const recipient = normalizeMailAddress(to);
    if (!isValidMailAddress(recipient)) {
      throw new BadRequestException(
        i18nMessage("server.mailRouting.invalidAddress", { address: to }),
      );
    }
    const account = await this.directory.findAccount(id);
    if (!account) {
      throw new NotFoundException(
        i18nMessage("server.mailRouting.accountNotFound"),
      );
    }
    const mail = renderAccountTestMail(account.address, {
      frontendUrl: frontendUrlForEnvironment(),
      to: recipient,
    });
    const result = await this.smtp.sendThroughAccount(account, {
      to: recipient,
      subject: mail.subject,
      html: mail.html,
    });
    this.directory.invalidate();
    return result;
  }

  private assertCipher(): void {
    if (!this.cipher.isAvailable()) {
      throw new ServiceUnavailableException(
        i18nMessage("server.mailRouting.encryptionKeyMissing"),
      );
    }
  }

  /** Şifre dışındaki alanlar: doğrulanmış ve normalize edilmiş. */
  private validatedFields(input: Omit<MailSenderAccountInput, "password">): {
    address: string;
    displayName: string;
    host: string | null;
    port: number | null;
    secure: boolean | null;
    username: string | null;
  } {
    const address = normalizeMailAddress(input.address ?? "");
    if (!isValidMailAddress(address)) {
      throw new BadRequestException(
        i18nMessage("server.mailRouting.invalidAddress", {
          address: input.address ?? "",
        }),
      );
    }
    const displayName = (input.displayName ?? "").trim();
    if (!isValidMailDisplayName(displayName)) {
      throw new BadRequestException(
        i18nMessage("server.mailRouting.invalidDisplayName"),
      );
    }
    const host = input.host?.trim() || null;
    if (host && !/^[a-z0-9.-]+$/i.test(host)) {
      throw new BadRequestException(
        i18nMessage("server.mailRouting.invalidHost"),
      );
    }
    const port = input.port ?? null;
    if (
      port !== null &&
      (!Number.isInteger(port) || port < 1 || port > 65535)
    ) {
      throw new BadRequestException(
        i18nMessage("server.mailRouting.invalidPort"),
      );
    }
    const username = input.username?.trim() || null;
    if (username && /[\r\n]/.test(username)) {
      throw new BadRequestException(
        i18nMessage("server.mailRouting.invalidUsername"),
      );
    }
    return {
      address,
      displayName,
      host,
      port,
      secure: input.secure ?? null,
      username,
    };
  }

  private async assertAddressFree(
    tx: Prisma.TransactionClient,
    address: string,
  ): Promise<void> {
    const taken = await tx.mailSenderAccount.findUnique({
      where: { address },
      select: { id: true },
    });
    if (taken) {
      throw new ConflictException(
        i18nMessage("server.mailRouting.addressTaken"),
      );
    }
  }

  private async findOrThrow(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<MailSenderAccount> {
    const row = await tx.mailSenderAccount.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException(
        i18nMessage("server.mailRouting.accountNotFound"),
      );
    }
    return row;
  }

  private async usedByAreas(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<MailAreaId[]> {
    const rows = await tx.mailAreaSetting.findMany({
      where: { senderAccountId: id },
      select: { areaId: true },
      orderBy: { areaId: "asc" },
    });
    return rows.map((row) => row.areaId).filter(isMailAreaId);
  }
}
