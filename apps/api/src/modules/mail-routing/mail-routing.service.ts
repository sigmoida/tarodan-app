import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  MAIL_AREAS,
  MAIL_INTERNAL_RECIPIENTS_MAX,
  isValidMailDisplayName,
  type MailAreaId,
  type MailAreaState,
  type MailAreaUpdate,
  type MailInternalEventState,
  type MailRoutingState,
} from "@tarodan/types";
import { PrismaService } from "../../prisma";
import { i18nMessage } from "../i18n";
import { SmtpProvider } from "../mail/smtp.provider";
import { MailRoutingDirectory } from "../mail/mail-routing-directory";
import {
  areaOfMailEvent,
  isMailAreaId,
  isMailDeliveryMode,
  isMailInternalEventId,
  isValidMailAddress,
  normalizeMailAddress,
  serializeMailEventStates,
} from "../mail/helpers/mail-area-settings";
import { templateKeysByMailArea } from "../../common/email/email-template-registry";
import { toAreaState, toSenderAccountView } from "./helpers/mail-routing-views";

/** Bir yazımın önce/sonra çifti — admin katmanının denetim kaydı bunu yazar. */
export interface MailRoutingChange<T> {
  before: T | null;
  after: T | null;
}

/**
 * Yazımla AYNI işlemde çalışan adım (zorunlu denetim kaydı). Fırlatırsa
 * değişiklik de geri alınır — "değişti ama kaydı yok" durumu oluşamaz.
 */
export type MailRoutingAfterWrite<T> = (
  tx: Prisma.TransactionClient,
  change: MailRoutingChange<T>,
) => Promise<void>;

/**
 * Mail Yönlendirme — ekran durumu ve alan ayarları. Doğrulama burada
 * (DTO şekli, servis iş kuralları); yazımdan sonra bu süreçteki yönlendirme
 * önbelleği boşaltılır, diğer süreçler en geç önbellek süresi sonunda görür.
 */
@Injectable()
export class MailRoutingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directory: MailRoutingDirectory,
    private readonly smtp: SmtpProvider,
  ) {}

  async getState(): Promise<MailRoutingState> {
    const [accounts, settings] = await Promise.all([
      this.prisma.mailSenderAccount.findMany({ orderBy: { address: "asc" } }),
      this.prisma.mailAreaSetting.findMany(),
    ]);
    const byArea = new Map(settings.map((row) => [row.areaId, row]));
    const templates = templateKeysByMailArea();
    const usedBy = this.usedByAreas(settings);
    return {
      defaultFrom: this.smtp.defaultFrom,
      accounts: accounts.map((row) =>
        toSenderAccountView(row, usedBy.get(row.id) ?? []),
      ),
      areas: MAIL_AREAS.map((area) =>
        toAreaState(area, byArea.get(area), templates[area]),
      ),
    };
  }

  async updateArea(
    areaId: string,
    update: MailAreaUpdate,
    actorUserId: string,
    afterWrite?: MailRoutingAfterWrite<MailAreaState>,
  ): Promise<MailAreaState> {
    if (!isMailAreaId(areaId)) {
      throw new NotFoundException(
        i18nMessage("server.mailRouting.unknownArea"),
      );
    }
    const area = areaId;
    const templateKeys = templateKeysByMailArea()[area];

    const after = await this.prisma.$transaction(async (tx) => {
      const row = await tx.mailAreaSetting.findUnique({
        where: { areaId: area },
      });
      const before = toAreaState(area, row ?? undefined, templateKeys);
      const next = await this.applyUpdate(tx, area, before, update);

      const saved = await tx.mailAreaSetting.upsert({
        where: { areaId: area },
        create: {
          areaId: area,
          senderAccountId: next.senderAccountId,
          displayName: next.displayName,
          replyTo: next.replyTo,
          internalRecipients: next.internalRecipients,
          events: serializeMailEventStates(next.events),
          updatedBy: actorUserId,
        },
        update: {
          senderAccountId: next.senderAccountId,
          displayName: next.displayName,
          replyTo: next.replyTo,
          internalRecipients: next.internalRecipients,
          events: serializeMailEventStates(next.events),
          updatedBy: actorUserId,
        },
      });
      const afterState = toAreaState(area, saved, templateKeys);
      if (afterWrite) await afterWrite(tx, { before, after: afterState });
      return afterState;
    });
    this.directory.invalidate();
    return after;
  }

  /** Değişikliği doğrulayıp yeni durumu kurar (yazmaz). */
  private async applyUpdate(
    tx: Prisma.TransactionClient,
    area: MailAreaId,
    current: MailAreaState,
    update: MailAreaUpdate,
  ): Promise<MailAreaState> {
    const next: MailAreaState = { ...current };

    if (update.senderAccountId !== undefined) {
      if (update.senderAccountId !== null) {
        const exists = await tx.mailSenderAccount.findUnique({
          where: { id: update.senderAccountId },
          select: { id: true },
        });
        if (!exists) {
          throw new BadRequestException(
            i18nMessage("server.mailRouting.accountNotFound"),
          );
        }
      }
      next.senderAccountId = update.senderAccountId;
    }

    if (update.displayName !== undefined) {
      const name = update.displayName?.trim() ?? "";
      if (name && !isValidMailDisplayName(name)) {
        throw new BadRequestException(
          i18nMessage("server.mailRouting.invalidDisplayName"),
        );
      }
      next.displayName = name || null;
    }

    if (update.replyTo !== undefined) {
      const replyTo = normalizeMailAddress(update.replyTo ?? "");
      if (replyTo && !isValidMailAddress(replyTo)) {
        throw new BadRequestException(
          i18nMessage("server.mailRouting.invalidReplyTo"),
        );
      }
      next.replyTo = replyTo || null;
    }

    if (update.internalRecipients !== undefined) {
      next.internalRecipients = normalizeRecipients(update.internalRecipients);
    }

    if (update.events !== undefined) {
      next.events = mergeEvents(area, current.events, update.events);
    }
    return next;
  }

  /** Hesap → onu kullanan alanlar. */
  private usedByAreas(
    settings: ReadonlyArray<{ areaId: string; senderAccountId: string | null }>,
  ): Map<string, MailAreaId[]> {
    const usedBy = new Map<string, MailAreaId[]>();
    for (const area of MAIL_AREAS) {
      const accountId = settings.find(
        (row) => row.areaId === area,
      )?.senderAccountId;
      if (!accountId) continue;
      usedBy.set(accountId, [...(usedBy.get(accountId) ?? []), area]);
    }
    return usedBy;
  }
}

/** Alıcılar: geçerli, küçük harf, tekil, en çok 20. */
export function normalizeRecipients(raw: readonly string[]): string[] {
  const unique: string[] = [];
  for (const entry of raw) {
    const address = normalizeMailAddress(String(entry ?? ""));
    if (!address) continue;
    if (!isValidMailAddress(address)) {
      throw new BadRequestException(
        i18nMessage("server.mailRouting.invalidRecipient", { address }),
      );
    }
    if (!unique.includes(address)) unique.push(address);
  }
  if (unique.length > MAIL_INTERNAL_RECIPIENTS_MAX) {
    throw new BadRequestException(
      i18nMessage("server.mailRouting.tooManyRecipients", {
        max: MAIL_INTERNAL_RECIPIENTS_MAX,
      }),
    );
  }
  return unique;
}

/** Olay değişikliklerini alanın mevcut durumuna uygular (yalnız bu alanın olayları). */
export function mergeEvents(
  area: MailAreaId,
  current: readonly MailInternalEventState[],
  changes: ReadonlyArray<{ id: string; enabled: boolean; delivery: string }>,
): MailInternalEventState[] {
  const seen = new Set<string>();
  const byId = new Map(current.map((state) => [state.id, { ...state }]));
  for (const change of changes) {
    if (
      !isMailInternalEventId(change.id) ||
      areaOfMailEvent(change.id) !== area
    ) {
      throw new BadRequestException(
        i18nMessage("server.mailRouting.eventNotInArea", {
          event: String(change.id),
        }),
      );
    }
    if (seen.has(change.id)) {
      throw new BadRequestException(
        i18nMessage("server.mailRouting.duplicateEvent"),
      );
    }
    seen.add(change.id);
    if (!isMailDeliveryMode(change.delivery)) {
      throw new BadRequestException(
        i18nMessage("server.mailRouting.invalidDelivery"),
      );
    }
    byId.set(change.id, {
      id: change.id,
      enabled: change.enabled === true,
      delivery: change.delivery,
    });
  }
  return current.map((state) => byId.get(state.id) ?? state);
}
