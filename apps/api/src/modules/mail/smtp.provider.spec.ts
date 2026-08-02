/**
 * SmtpProvider transport wiring.
 *
 * These assert the options handed to nodemailer rather than a live send: the
 * TLS knobs exist for relays we cannot reach from CI (mail.akilliticaret.com
 * only speaks pre-1.2 TLS, which Node 20's OpenSSL 3 rejects outright), so the
 * mapping from env to transport is the only thing we can pin down here.
 */
import { SmtpProvider } from "./smtp.provider";

const createTransport = jest.fn();
jest.mock("nodemailer", () => ({
  createTransport: (...args: unknown[]) => createTransport(...args),
}));

function buildProvider(env: Record<string, string>): SmtpProvider {
  const configService = {
    get: (key: string, fallback?: string) => env[key] ?? fallback,
  };
  // EmailLog kaydı için prisma bağımlılığı (bu spec transport seçeneklerini
  // ölçüyor; kayıt yolu smtp-email-log.spec.ts'te).
  const prisma = { emailLog: { create: jest.fn() } };
  return new SmtpProvider(configService as never, prisma as never);
}

describe("SmtpProvider transport options", () => {
  beforeEach(() => {
    createTransport.mockReset();
    createTransport.mockReturnValue({ verify: jest.fn() });
  });

  it("parses the port as a number so nodemailer does not receive a string", () => {
    buildProvider({ SMTP_HOST: "mail.example.com", SMTP_PORT: "587" });

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 587 }),
    );
  });

  it("keeps STARTTLS and modern TLS by default", () => {
    buildProvider({ SMTP_HOST: "mail.example.com" });

    const options = createTransport.mock.calls[0][0];
    expect(options.ignoreTLS).toBe(false);
    expect(options.tls.minVersion).toBeUndefined();
    expect(options.tls.ciphers).toBeUndefined();
  });

  it("drops OpenSSL's security level when pinned to a pre-1.2 TLS version", () => {
    // minVersion alone is not enough: OpenSSL 3 still refuses the legacy
    // ciphers at its default security level.
    buildProvider({
      SMTP_HOST: "mail.example.com",
      SMTP_MIN_TLS_VERSION: "TLSv1",
    });

    const options = createTransport.mock.calls[0][0];
    expect(options.tls.minVersion).toBe("TLSv1");
    expect(options.tls.ciphers).toBe("DEFAULT@SECLEVEL=0");
  });

  it("does not weaken ciphers when pinned to a modern TLS version", () => {
    buildProvider({
      SMTP_HOST: "mail.example.com",
      SMTP_MIN_TLS_VERSION: "TLSv1.2",
    });

    const options = createTransport.mock.calls[0][0];
    expect(options.tls.minVersion).toBe("TLSv1.2");
    expect(options.tls.ciphers).toBeUndefined();
  });

  it("ignores an unparseable TLS version instead of passing it through", () => {
    buildProvider({
      SMTP_HOST: "mail.example.com",
      SMTP_MIN_TLS_VERSION: "SSLv3",
    });

    const options = createTransport.mock.calls[0][0];
    expect(options.tls.minVersion).toBeUndefined();
    expect(options.tls.ciphers).toBeUndefined();
  });

  it("skips STARTTLS when the relay offers no usable encryption", () => {
    buildProvider({ SMTP_HOST: "mail.example.com", SMTP_IGNORE_TLS: "true" });

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ ignoreTLS: true }),
    );
  });

  it("omits auth entirely when no credentials are configured", () => {
    // Mailpit accepts unauthenticated sessions; sending an empty user/pass pair
    // would make it reject the connection.
    buildProvider({ SMTP_HOST: "localhost", SMTP_PORT: "1025" });

    expect(createTransport.mock.calls[0][0].auth).toBeUndefined();
  });

  it("stays disabled without a host so callers fall back to logging", () => {
    const provider = buildProvider({});

    expect(provider.isConfigured()).toBe(false);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("exposes MAIL_FROM as the sender identity", () => {
    const provider = buildProvider({
      SMTP_HOST: "mail.example.com",
      MAIL_FROM: "Tarodan <info@tarodan.com.tr>",
    });

    expect(provider.defaultFrom).toBe("Tarodan <info@tarodan.com.tr>");
  });
});
