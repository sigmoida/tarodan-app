import { createHash } from "crypto";
import { Injectable, Logger } from "@nestjs/common";
import type { MailAreaId, MailInternalEventState } from "@tarodan/types";
import { PrismaService } from "../../prisma";
import { MailAccountCipher } from "./mail-account-cipher";
import {
  isMailAreaId,
  parseInternalRecipients,
  parseMailEventStates,
} from "./helpers/mail-area-settings";

/** Bir gönderici kutusunun gönderim için gereken alanları (şifre şifreli). */
export interface MailSenderAccountRecord {
  id: string;
  address: string;
  displayName: string;
  host: string | null;
  port: number | null;
  secure: boolean | null;
  username: string;
  passwordEncrypted: string;
  /**
   * Kutunun son bilinen sağlığı; `false` iken başarılı bir gönderim işareti
   * kaldırır (yalnız o geçişte yazılır). Bağlantı parmak izine girmez.
   */
  lastTestOk: boolean | null;
}

/** Bir alanın etkin yönlendirmesi (satır yoksa varsayılanlar). */
export interface MailAreaRouting {
  area: MailAreaId;
  account: MailSenderAccountRecord | null;
  /** Alanın görünen ad ezmesi; null = hesabın kendi adı. */
  displayName: string | null;
  replyTo: string | null;
  internalRecipients: string[];
  events: MailInternalEventState[];
}

export interface MailRoutingSnapshot {
  accounts: ReadonlyMap<string, MailSenderAccountRecord>;
  areas: ReadonlyMap<MailAreaId, MailAreaRouting>;
}

/**
 * Gönderimlerin okuduğu yönlendirme belleği. Her e-posta veritabanına gitmesin
 * diye kısa süre önbelleğe alınır; admin yazınca aynı süreçte hemen
 * (`invalidate`), diğer süreçlerde (web ↔ worker) en geç TTL sonunda geçerli
 * olur.
 */
export const MAIL_ROUTING_CACHE_TTL_MS = 30_000;

const ACCOUNT_SELECT = {
  id: true,
  address: true,
  displayName: true,
  host: true,
  port: true,
  secure: true,
  username: true,
  passwordEncrypted: true,
  lastTestOk: true,
} as const;

/**
 * Bağlantıyı belirleyen alanların özeti — havuzdaki transport bu değişince
 * yeniden kurulur. Son-test alanları (her başarısızlıkta yazılır) içinde YOK:
 * yoksa her hata bağlantıyı boşuna yıkardı.
 */
export function senderAccountFingerprint(
  account: MailSenderAccountRecord,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        account.host,
        account.port,
        account.secure,
        account.username,
        account.passwordEncrypted,
      ]),
    )
    .digest("hex");
}

/** Alan satırı yokken geçerli yönlendirme: hesap yok, alıcı yok, olaylar kapalı. */
export function defaultAreaRouting(area: MailAreaId): MailAreaRouting {
  return {
    area,
    account: null,
    displayName: null,
    replyTo: null,
    internalRecipients: [],
    events: parseMailEventStates(area, null),
  };
}

@Injectable()
export class MailRoutingDirectory {
  private readonly logger = new Logger(MailRoutingDirectory.name);
  private cached: {
    loadedAt: number;
    snapshot: Promise<MailRoutingSnapshot>;
  } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: MailAccountCipher,
  ) {}

  /** Önbellekli tam görüntü. Okuma hatası önbelleğe alınmaz. */
  snapshot(): Promise<MailRoutingSnapshot> {
    const now = Date.now();
    if (this.cached && now - this.cached.loadedAt < MAIL_ROUTING_CACHE_TTL_MS) {
      return this.cached.snapshot;
    }
    const snapshot = this.load().catch((error: unknown) => {
      this.cached = null;
      throw error;
    });
    this.cached = { loadedAt: now, snapshot };
    return snapshot;
  }

  async area(area: MailAreaId): Promise<MailAreaRouting> {
    return (await this.snapshot()).areas.get(area) ?? defaultAreaRouting(area);
  }

  /** Admin yazdıktan sonra: bu süreçte bir sonraki gönderim taze okur. */
  invalidate(): void {
    this.cached = null;
  }

  /** Önbelleği atlayarak tek hesap (admin "Test gönder"). */
  findAccount(id: string): Promise<MailSenderAccountRecord | null> {
    return this.prisma.mailSenderAccount.findUnique({
      where: { id },
      select: ACCOUNT_SELECT,
    });
  }

  /**
   * Kutunun SMTP şifresi. Anahtar yoksa ya da çözülemiyorsa (anahtar
   * döndürüldü, kayıt bozuk) fırlatır — çağıran kutuyu hatalı sayıp varsayılan
   * kimliğe düşer.
   */
  passwordOf(account: MailSenderAccountRecord): string {
    return this.cipher.decrypt(account.passwordEncrypted);
  }

  /**
   * Son deneme sonucunu kutuya yazar (admin ekranı gösterir). Best-effort:
   * yazılamaması gönderimi etkilemez. Hesap silinmişse no-op.
   */
  async recordAccountResult(
    accountId: string,
    ok: boolean,
    error: string | null,
  ): Promise<void> {
    try {
      await this.prisma.mailSenderAccount.updateMany({
        where: { id: accountId },
        data: {
          lastTestAt: new Date(),
          lastTestOk: ok,
          lastTestError: ok ? null : error,
        },
      });
      // Bu süreçteki görüntü sağlık işaretini hemen görsün (temizleme
      // kararı `lastTestOk`a bakar).
      this.invalidate();
    } catch (writeError: unknown) {
      this.logger.warn(
        `Gönderici kutu sonucu yazılamadı (${accountId}): ${writeError instanceof Error ? writeError.message : String(writeError)}`,
      );
    }
  }

  /**
   * Gerçek gönderim başarılı oldu: kutu "hatalı" işaretliyse işareti kaldırır.
   * Koşullu yazım (`lastTestOk = false` olan satır) — işaret zaten kalkmışsa
   * (başka süreç ya da önbellek bayat) hiçbir satır değişmez. Best-effort.
   */
  async clearAccountFailure(accountId: string): Promise<void> {
    try {
      await this.prisma.mailSenderAccount.updateMany({
        where: { id: accountId, lastTestOk: false },
        data: { lastTestAt: new Date(), lastTestOk: true, lastTestError: null },
      });
      // Satır değişmediyse de görüntü bayattır (başka süreç temizledi):
      // tazele ki sonraki gönderimler tekrar yazmaya kalkmasın.
      this.invalidate();
    } catch (writeError: unknown) {
      this.logger.warn(
        `Gönderici kutu işareti temizlenemedi (${accountId}): ${writeError instanceof Error ? writeError.message : String(writeError)}`,
      );
    }
  }

  private async load(): Promise<MailRoutingSnapshot> {
    const [accounts, settings] = await Promise.all([
      this.prisma.mailSenderAccount.findMany({ select: ACCOUNT_SELECT }),
      this.prisma.mailAreaSetting.findMany(),
    ]);
    const accountById = new Map(accounts.map((a) => [a.id, a]));
    const areas = new Map<MailAreaId, MailAreaRouting>();
    for (const row of settings) {
      const area = row.areaId;
      // Sözlükte olmayan alan satırı (eski/elle eklenmiş) yok sayılır.
      if (!isMailAreaId(area)) continue;
      areas.set(area, {
        area,
        account: row.senderAccountId
          ? (accountById.get(row.senderAccountId) ?? null)
          : null,
        displayName: row.displayName,
        replyTo: row.replyTo,
        internalRecipients: parseInternalRecipients(row.internalRecipients),
        events: parseMailEventStates(area, row.events),
      });
    }
    return { accounts: accountById, areas };
  }
}
