/**
 * SMTP Email Provider using Nodemailer.
 *
 * The single outbound mail transport for the whole API — notification dispatch,
 * the `email` queue worker, invoices and marketing all send through this class.
 * Do not stand up another `nodemailer.createTransport()` elsewhere: each one is
 * a separate connection pool with its own (drifting) From address and TLS
 * policy, which is exactly how the old SendGrid provider ended up mailing from
 * a different sender than the rest of the app.
 *
 * Sender identity (Mail Routing, docs/MAIL_ROUTING.md): every mail belongs to
 * an AREA — derived from its template key, or passed explicitly by callers
 * without a template (marketing, invoices). An area with an assigned sender
 * account is sent through THAT mailbox's own SMTP session, because the mail
 * host (mail.akilliticaret.com) requires the From address to match the
 * authenticated user: overriding `from` on the default session would be
 * rejected. Those per-account sessions live in a small pool inside this class
 * (created lazily, rebuilt when the account's connection settings change,
 * closed when it is deleted), so there is still exactly one place that opens
 * SMTP connections.
 *
 * Everything else — no area, no account, or an account whose session fails to
 * authenticate/connect — goes out as the default identity (MAIL_FROM +
 * SMTP_*). A misconfigured mailbox never drops a customer mail: the failure is
 * logged, recorded on the account for the admin screen, and the mail is resent
 * from the default identity.
 */
import { Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import * as nodemailer from "nodemailer";
import type { MailAreaId } from "@tarodan/types";
import { PrismaService } from "../../prisma";
import { mailAreaOfTemplate } from "../../common/email/email-template-registry";
import {
  MailRoutingDirectory,
  senderAccountFingerprint,
  type MailSenderAccountRecord,
} from "./mail-routing-directory";
import { formatMailFrom } from "./helpers/mail-area-settings";
import {
  describeSmtpError,
  isSenderAccountFailure,
} from "./helpers/smtp-failure";

export interface SmtpEmailOptions {
  to: string;
  subject: string;
  /**
   * Kayıt için opsiyonel bağlam. Şablon anahtarını yalnız çağıran bilir
   * (render'dan sonra bilgi kayboluyordu); verilirse EmailLog satırına geçer.
   * Mail Yönlendirme alanı da buradan türetilir (şablon kaydındaki `area`).
   */
  template?: string;
  /**
   * Gönderici alanını açıkça seçer — şablon anahtarı olmayan ya da kayıtta
   * bulunmayan gönderimler için (pazarlama, fatura). Verilmezse alan
   * şablondan türetilir; ikisi de yoksa varsayılan kimlik kullanılır.
   */
  area?: MailAreaId;
  userId?: string;
  metadata?: Record<string, unknown>;
  text?: string;
  html?: string;
  /** Verilirse alanın Reply-To ayarını ezer (ör. misafir mesajında müşteri). */
  replyTo?: string;
  /**
   * Ek SMTP başlıkları. Pazarlama gönderimlerinde `List-Unsubscribe` ve
   * `List-Unsubscribe-Post` için kullanılır: Gmail ve Yahoo 2024'ten beri toplu
   * gönderende bu başlıkları şart koşuyor, yoksa mailler spam'e düşüyor.
   */
  headers?: Record<string, string>;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

export interface SmtpResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

/** Bir gönderimin çözülmüş kimliği. */
interface ResolvedSender {
  area: MailAreaId | undefined;
  /** null = varsayılan kimlik (MAIL_FROM + SMTP_*). */
  account: MailSenderAccountRecord | null;
  displayName: string | null;
  replyTo: string | undefined;
}

/** Bağlantı parametreleri — varsayılan oturum ve kutu oturumları aynı kalıbı kullanır. */
interface TransportTarget {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

/** Kutunun şifresi çözülemedi: gönderim denenmeden varsayılan kimliğe düşülür. */
class SenderAccountUnusableError extends Error {}

/**
 * Başarısız kutu bu süre boyunca denenmez (bu süreçte); e-postalar doğrudan
 * varsayılan kimlikle gider. Admin "Test gönder" soğumayı beklemez.
 */
export const SENDER_ACCOUNT_COOLDOWN_MS = 5 * 60 * 1000;

/** Kutu oturumunun bağlantı/selam zaman aşımı: bozuk kutu gönderimi uzun bekletmesin. */
const ACCOUNT_CONNECTION_TIMEOUT_MS = 15_000;

/** Accepted SMTP_MIN_TLS_VERSION values, mirroring Node's SecureVersion. */
const SECURE_VERSIONS = ["TLSv1", "TLSv1.1", "TLSv1.2", "TLSv1.3"] as const;

@Injectable()
export class SmtpProvider {
  private readonly logger = new Logger(SmtpProvider.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly fromEmail: string;
  private readonly enabled: boolean;
  private readonly defaultTarget: Omit<TransportTarget, "user" | "pass">;
  private readonly tlsOptions: {
    ignoreTLS: boolean;
    tls: Record<string, unknown>;
  };
  /** Kutu başına SMTP oturumu; anahtar hesap kimliği. */
  private readonly accountTransports = new Map<
    string,
    { fingerprint: string; transport: nodemailer.Transporter }
  >();
  /**
   * Az önce başarısız olan kutular. Bağlantı ayarları değişince (admin şifreyi
   * düzeltti) parmak izi tutmaz ve soğuma kendiliğinden biter.
   */
  private readonly accountCooldowns = new Map<
    string,
    { fingerprint: string; until: number }
  >();

  constructor(
    private readonly configService: ConfigService,
    // PrismaModule @Global — modül döngüsü yok.
    private readonly prisma: PrismaService,
    // Yoksa (kısmi test kurulumları) her gönderim varsayılan kimlikle gider.
    @Optional() private readonly routing?: MailRoutingDirectory,
  ) {
    const host = this.configService.get<string>("SMTP_HOST", "");
    // .env values arrive as strings; nodemailer wants a number for `port`.
    const port = Number.parseInt(
      this.configService.get<string>("SMTP_PORT", "587"),
      10,
    );
    const user = this.configService.get<string>("SMTP_USER", "");
    const pass = this.configService.get<string>("SMTP_PASS", "");
    const secure =
      this.configService.get<string>("SMTP_SECURE", "false") === "true";
    // Shared hosting often serves a certificate that does not match the mail
    // hostname, which would abort STARTTLS. Default stays permissive to keep
    // delivery working; set SMTP_TLS_REJECT_UNAUTHORIZED=true once the host is
    // known to present a valid certificate.
    const rejectUnauthorized =
      this.configService.get<string>(
        "SMTP_TLS_REJECT_UNAUTHORIZED",
        "false",
      ) === "true";
    // Skip STARTTLS even when the server advertises it. Needed for relays that
    // announce STARTTLS but cannot complete a handshake Node will accept; the
    // session (credentials included) then travels in the clear, so only enable
    // this when the provider states the mailbox has no encryption.
    const ignoreTLS =
      this.configService.get<string>("SMTP_IGNORE_TLS", "false") === "true";
    // Node 20 ships OpenSSL 3, which refuses anything below TLSv1.2 outright:
    // a host still on TLSv1/TLSv1.1 fails with
    // "ssl_choose_client_version: unsupported protocol". Lowering minVersion is
    // not enough on its own — OpenSSL's default security level also rejects the
    // old ciphers — so drop SECLEVEL alongside it.
    const configuredMinVersion = this.configService
      .get<string>("SMTP_MIN_TLS_VERSION", "")
      .trim();
    const minVersion = SECURE_VERSIONS.find((v) => v === configuredMinVersion);
    if (configuredMinVersion && !minVersion) {
      this.logger.warn(
        `Ignoring invalid SMTP_MIN_TLS_VERSION="${configuredMinVersion}" (expected one of ${SECURE_VERSIONS.join(", ")})`,
      );
    }
    const allowsLegacyTls = minVersion === "TLSv1" || minVersion === "TLSv1.1";

    this.fromEmail = this.configService.get<string>(
      "MAIL_FROM",
      "info@tarodan.com.tr",
    );
    // Host yeterli (Mailhog/dev auth istemez); user+pass varsa auth uygulanır (prod).
    this.enabled = !!host;
    this.defaultTarget = { host, port, secure };
    // Kutu oturumları da AYNI TLS politikasını kullanır (aynı posta sunucusu).
    this.tlsOptions = {
      ignoreTLS,
      tls: {
        rejectUnauthorized,
        ...(minVersion ? { minVersion } : {}),
        ...(allowsLegacyTls ? { ciphers: "DEFAULT@SECLEVEL=0" } : {}),
      },
    };

    if (this.enabled) {
      this.transporter = this.createTransport({
        host,
        port,
        secure,
        user,
        pass,
      });

      // Verify connection
      this.transporter.verify((error) => {
        if (error) {
          this.logger.error(`SMTP connection failed: ${error.message}`);
        } else {
          this.logger.log(`SMTP connected to ${host}:${port} as ${user}`);
        }
      });
    } else {
      this.logger.warn(
        "SMTP is not configured. Email notifications will be logged only.",
      );
    }
  }

  /**
   * Send email via SMTP
   */
  async sendEmail(options: SmtpEmailOptions): Promise<SmtpResponse> {
    const sender = await this.resolveSender(options);

    if (!this.enabled || !this.transporter) {
      this.logger.log(
        `[EMAIL-MOCK] To: ${options.to}, Subject: ${options.subject}`,
      );
      if (options.html) {
        this.logger.debug(
          `[EMAIL-MOCK] HTML content length: ${options.html.length}`,
        );
      }
      const mockId = `mock-${Date.now()}`;
      await this.recordEmailLog(options, {
        from: this.fromTextOf(sender),
        status: "sent",
        provider: "mock",
        messageId: mockId,
      });
      return { success: true, messageId: mockId };
    }

    let fallbackFrom: string | undefined;
    if (sender.account && this.isCoolingDown(sender.account)) {
      // Kutu az önce başarısız oldu: her e-postada yeniden bağlantı zaman
      // aşımı beklenmesin, soğuma bitene kadar doğrudan varsayılan kimlik.
      fallbackFrom = sender.account.address;
    } else if (sender.account) {
      const account = sender.account;
      let info: { messageId: string } | undefined;
      try {
        const transport = this.accountTransport(account);
        info = await transport.sendMail(
          this.mailOptions(options, sender, {
            name: sender.displayName ?? account.displayName,
            address: account.address,
          }),
        );
      } catch (error) {
        const errorMessage = describeSmtpError(error);
        // Şifre çözülemedi (anahtar yok/değişti) ya da kutunun oturumu/bağlantısı
        // reddedildi → kutu hatalı; e-posta varsayılan kimlikle yeniden gider.
        if (
          !isSenderAccountFailure(error) &&
          !(error instanceof SenderAccountUnusableError)
        ) {
          return this.failed(options, this.fromTextOf(sender), errorMessage);
        }
        this.logger.warn(
          `Gönderici kutu ${account.address} kullanılamadı, varsayılan kimlikle gönderiliyor: ${errorMessage}`,
        );
        this.dropAccountTransport(account.id);
        this.accountCooldowns.set(account.id, {
          fingerprint: senderAccountFingerprint(account),
          until: Date.now() + SENDER_ACCOUNT_COOLDOWN_MS,
        });
        await this.routing?.recordAccountResult(
          account.id,
          false,
          errorMessage,
        );
        fallbackFrom = account.address;
      }
      // Gönderim sonrası işler try DIŞINDA: buradaki bir hata, gitmiş bir
      // e-postayı "kutu hatası" sanıp varsayılan kimlikle ikinci kez yollatmasın.
      if (info) {
        // Kutu "hatalı" işaretliyken başarılı gönderim işareti kaldırır —
        // yalnız o geçişte yazılır, her gönderimde değil.
        if (account.lastTestOk === false) {
          await this.routing?.clearAccountFailure(account.id);
        }
        return this.succeeded(options, this.fromTextOf(sender), info);
      }
    }

    const metadata = fallbackFrom
      ? { ...options.metadata, senderFallbackFrom: fallbackFrom }
      : options.metadata;
    const logged = { ...options, metadata };
    try {
      const info = await this.transporter.sendMail(
        this.mailOptions(options, sender, this.fromEmail),
      );
      return this.succeeded(logged, this.fromEmail, info);
    } catch (error) {
      return this.failed(logged, this.fromEmail, describeSmtpError(error));
    }
  }

  /**
   * Admin "Test gönder": tek bir kutunun KENDİ oturumuyla gerçek bir e-posta
   * gönderir. Varsayılan kimliğe düşmez — amaç kutunun çalıştığını görmek.
   *
   * Kutunun sağlığı (son test alanları) yalnız KUTUYA ait sonuçla yazılır:
   * başarı ya da kutu hatası (oturum, bağlantı, TLS, DNS, MAIL FROM, şifre
   * çözülemedi — `isSenderAccountFailure`). Alıcı/içerik reddi (RCPT TO,
   * DATA) kutunun değil adresin sorunudur: çağırana `ok:false` + hata metni
   * döner, kutunun sağlık kaydına dokunulmaz.
   */
  async sendThroughAccount(
    account: MailSenderAccountRecord,
    message: { to: string; subject: string; html: string },
  ): Promise<{ ok: boolean; error: string | null }> {
    const options: SmtpEmailOptions = {
      ...message,
      template: "mail-routing-test",
    };
    const sender: ResolvedSender = {
      area: undefined,
      account,
      displayName: account.displayName,
      replyTo: undefined,
    };
    if (!(account.host || this.defaultTarget.host)) {
      // Sunucu yapılandırması eksik: kutunun kendisi hakkında bir şey söylemez.
      return { ok: false, error: "SMTP is not configured" };
    }
    try {
      const info = await this.accountTransport(account).sendMail(
        this.mailOptions(options, sender, {
          name: account.displayName,
          address: account.address,
        }),
      );
      await this.succeeded(options, this.fromTextOf(sender), info);
      // Başarılı test kutuyu hemen yeniden devreye alır (soğuma beklenmez).
      this.accountCooldowns.delete(account.id);
      await this.routing?.recordAccountResult(account.id, true, null);
      return { ok: true, error: null };
    } catch (error) {
      const errorMessage = describeSmtpError(error);
      await this.failed(options, this.fromTextOf(sender), errorMessage);
      if (
        isSenderAccountFailure(error) ||
        error instanceof SenderAccountUnusableError
      ) {
        this.dropAccountTransport(account.id);
        await this.routing?.recordAccountResult(
          account.id,
          false,
          errorMessage,
        );
      }
      return { ok: false, error: errorMessage };
    }
  }

  private isCoolingDown(account: MailSenderAccountRecord): boolean {
    const cooldown = this.accountCooldowns.get(account.id);
    if (!cooldown) return false;
    if (
      cooldown.until <= Date.now() ||
      cooldown.fingerprint !== senderAccountFingerprint(account)
    ) {
      this.accountCooldowns.delete(account.id);
      return false;
    }
    return true;
  }

  /** Hesap silindi/değişti: bu süreçteki oturumu hemen kapat. */
  dropAccountTransport(accountId: string): void {
    const pooled = this.accountTransports.get(accountId);
    if (!pooled) return;
    this.accountTransports.delete(accountId);
    try {
      pooled.transport.close();
    } catch {
      // Kapanmayan oturum zaten kullanılmıyor; sızıntı değil.
    }
  }

  /**
   * Alan → hesap çözümü. ASLA fırlatmaz: yönlendirme okunamazsa (DB anlık
   * erişilemez) e-posta varsayılan kimlikle gider.
   */
  private async resolveSender(
    options: SmtpEmailOptions,
  ): Promise<ResolvedSender> {
    const area =
      options.area ??
      (options.template ? mailAreaOfTemplate(options.template) : undefined);
    const none: ResolvedSender = {
      area,
      account: null,
      displayName: null,
      replyTo: options.replyTo,
    };
    if (!area || !this.routing) return none;
    try {
      const snapshot = await this.routing.snapshot();
      this.pruneTransports(snapshot.accounts);
      const routing = snapshot.areas.get(area);
      if (!routing) return none;
      return {
        area,
        account: routing.account,
        displayName: routing.displayName,
        replyTo: options.replyTo ?? routing.replyTo ?? undefined,
      };
    } catch (error) {
      this.logger.warn(
        `Mail yönlendirmesi okunamadı (${area}), varsayılan kimlik: ${describeSmtpError(error)}`,
      );
      return none;
    }
  }

  private mailOptions(
    options: SmtpEmailOptions,
    sender: ResolvedSender,
    from: string | { name: string; address: string },
  ): nodemailer.SendMailOptions {
    return {
      from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      replyTo: sender.replyTo,
      ...(options.headers ? { headers: options.headers } : {}),
      attachments: options.attachments?.map((att) => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType,
      })),
    };
  }

  /** EmailLog'a yazılan gönderen: gerçekten kullanılan kimlik. */
  private fromTextOf(sender: ResolvedSender): string {
    return sender.account
      ? formatMailFrom(
          sender.displayName ?? sender.account.displayName,
          sender.account.address,
        )
      : this.fromEmail;
  }

  private async succeeded(
    options: SmtpEmailOptions,
    from: string,
    info: { messageId: string },
  ): Promise<SmtpResponse> {
    this.logger.log(
      `Email sent via SMTP to ${options.to} as ${from}, ID: ${info.messageId}`,
    );
    await this.recordEmailLog(options, {
      from,
      status: "sent",
      provider: "smtp",
      messageId: info.messageId,
    });
    return { success: true, messageId: info.messageId };
  }

  private async failed(
    options: SmtpEmailOptions,
    from: string,
    errorMessage: string,
  ): Promise<SmtpResponse> {
    this.logger.error(`Failed to send email via SMTP: ${errorMessage}`);
    await this.recordEmailLog(options, {
      from,
      status: "failed",
      provider: "smtp",
      errorMessage,
    });
    return { success: false, error: errorMessage };
  }

  /**
   * Kutunun havuzdaki oturumu; yoksa ya da bağlantı ayarları değiştiyse
   * yeniden kurulur. Şifre çözülemezse `SenderAccountUnusableError`.
   */
  private accountTransport(
    account: MailSenderAccountRecord,
  ): nodemailer.Transporter {
    const fingerprint = senderAccountFingerprint(account);
    const pooled = this.accountTransports.get(account.id);
    if (pooled?.fingerprint === fingerprint) return pooled.transport;
    if (pooled) this.dropAccountTransport(account.id);

    let pass: string;
    try {
      if (!this.routing) throw new Error("Mail routing is not available");
      pass = this.routing.passwordOf(account);
    } catch (error) {
      throw new SenderAccountUnusableError(describeSmtpError(error));
    }
    const transport = this.createTransport(
      {
        host: account.host ?? this.defaultTarget.host,
        port: account.port ?? this.defaultTarget.port,
        secure: account.secure ?? this.defaultTarget.secure,
        user: account.username,
        pass,
      },
      {
        connectionTimeout: ACCOUNT_CONNECTION_TIMEOUT_MS,
        greetingTimeout: ACCOUNT_CONNECTION_TIMEOUT_MS,
      },
    );
    this.accountTransports.set(account.id, { fingerprint, transport });
    return transport;
  }

  /** Silinmiş kutuların oturumlarını kapatır (başka süreçte silinmiş olabilir). */
  private pruneTransports(
    liveAccounts: ReadonlyMap<string, MailSenderAccountRecord>,
  ): void {
    for (const accountId of [...this.accountTransports.keys()]) {
      if (!liveAccounts.has(accountId)) this.dropAccountTransport(accountId);
    }
  }

  private createTransport(
    target: TransportTarget,
    timeouts?: { connectionTimeout: number; greetingTimeout: number },
  ): nodemailer.Transporter {
    return nodemailer.createTransport({
      host: target.host,
      port: target.port,
      secure: target.secure,
      ignoreTLS: this.tlsOptions.ignoreTLS,
      auth:
        target.user && target.pass
          ? { user: target.user, pass: target.pass }
          : undefined,
      tls: this.tlsOptions.tls,
      ...timeouts,
    });
  }

  /**
   * Gönderim kaydı — TEK yazar burasıdır: her e-posta (mock dahil) bu huniden
   * geçtiği için Loglar → E-postalar sekmesi gerçek trafiği gösterir.
   *
   * BEST-EFFORT: kayıt hatası gönderim sonucunu DEĞİŞTİRMEZ. `delivered` /
   * `bounced` durumları bilinçli olarak yazılmaz — sağlayıcı webhook'u yok,
   * uydurmak yerine yazılmıyor.
   */
  private async recordEmailLog(
    options: SmtpEmailOptions,
    result: {
      /** Gerçekten kullanılan gönderen (kutu ya da varsayılan kimlik). */
      from: string;
      status: "sent" | "failed";
      provider: string;
      messageId?: string;
      errorMessage?: string;
    },
  ): Promise<void> {
    try {
      await this.prisma.emailLog.create({
        data: {
          to: options.to,
          from: result.from,
          subject: options.subject,
          template: options.template,
          userId: options.userId,
          status: result.status,
          provider: result.provider,
          messageId: result.messageId,
          errorMessage: result.errorMessage,
          ...(result.status === "sent" ? { sentAt: new Date() } : {}),
          ...(options.metadata
            ? { metadata: options.metadata as Prisma.InputJsonValue }
            : {}),
        },
      });
    } catch (error) {
      this.logger.warn(
        `EmailLog yazılamadı: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Check if SMTP is properly configured
   */
  isConfigured(): boolean {
    return this.enabled;
  }

  /**
   * The configured MAIL_FROM identity — the sender of every mail whose area has
   * no (working) sender account. Shown on the Mail Routing screen.
   */
  get defaultFrom(): string {
    return this.fromEmail;
  }
}
