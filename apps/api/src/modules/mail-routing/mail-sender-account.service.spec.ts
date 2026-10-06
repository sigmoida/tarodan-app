import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { MailSenderAccountService } from "./mail-sender-account.service";

const PLAIN = "Sup3r-Secret!";

const row = (patch: Record<string, unknown> = {}) => ({
  id: "acc-1",
  address: "siparis@tarodan.com.tr",
  displayName: "Tarodan Sipariş",
  host: null,
  port: null,
  secure: null,
  username: "siparis@tarodan.com.tr",
  passwordEncrypted: "enc(old)",
  lastTestAt: null,
  lastTestOk: null,
  lastTestError: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: null,
  updatedBy: null,
  ...patch,
});

function build(
  opts: {
    existing?: ReturnType<typeof row> | null;
    usedBy?: string[];
    cipher?: boolean;
  } = {},
) {
  const tx = {
    mailSenderAccount: {
      findUnique: jest.fn(
        async ({ where }: { where: { id?: string; address?: string } }) => {
          if (where.id) return opts.existing ?? null;
          if (where.address) {
            const existing = opts.existing;
            return existing && existing.address === where.address
              ? { id: existing.id }
              : null;
          }
          return null;
        },
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
        row(data),
      ),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
        row({ ...opts.existing, ...data }),
      ),
      delete: jest.fn(async () => opts.existing),
    },
    mailAreaSetting: {
      findMany: jest.fn(async () =>
        (opts.usedBy ?? []).map((areaId) => ({ areaId })),
      ),
    },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const directory = {
    invalidate: jest.fn(),
    findAccount: jest.fn(async () => opts.existing ?? null),
  };
  const cipher = {
    isAvailable: jest.fn(() => opts.cipher !== false),
    encrypt: jest.fn((plain: string) => `enc(${plain.length})`),
  };
  const smtp = {
    dropAccountTransport: jest.fn(),
    sendThroughAccount: jest.fn().mockResolvedValue({ ok: true, error: null }),
  };
  const service = new MailSenderAccountService(
    prisma as never,
    directory as never,
    cipher as never,
    smtp as never,
  );
  return { service, tx, directory, cipher, smtp };
}

const input = {
  address: " Siparis@Tarodan.com.tr ",
  displayName: "Tarodan Sipariş",
  password: PLAIN,
};

describe("MailSenderAccountService.create", () => {
  it("adresi normalize eder, kullanıcı adını adres yapar, şifreyi şifreleyerek yazar", async () => {
    const { service, tx, cipher } = build();

    const view = await service.create(input, "admin-1");

    const data = tx.mailSenderAccount.create.mock.calls[0][0].data;
    expect(data.address).toBe("siparis@tarodan.com.tr");
    expect(data.username).toBe("siparis@tarodan.com.tr");
    expect(cipher.encrypt).toHaveBeenCalledWith(PLAIN);
    expect(data.passwordEncrypted).not.toContain(PLAIN);
    expect(view.hasPassword).toBe(true);
  });

  it("yanıt ve denetim değerleri şifreyi taşımaz", async () => {
    const { service } = build();
    const afterWrite = jest.fn().mockResolvedValue(undefined);

    const view = await service.create(input, "admin-1", afterWrite);

    const serialized = JSON.stringify([view, afterWrite.mock.calls]);
    expect(serialized).not.toContain(PLAIN);
    expect(serialized).not.toContain("passwordEncrypted");
  });

  it("şifresiz oluşturma reddedilir", async () => {
    const { service } = build();
    await expect(
      service.create({ ...input, password: "  " }, "admin-1"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("şifreleme anahtarı yoksa kaydedilmez (503)", async () => {
    const { service, tx } = build({ cipher: false });
    await expect(service.create(input, "admin-1")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(tx.mailSenderAccount.create).not.toHaveBeenCalled();
  });

  it("aynı adres ikinci kez eklenemez (409)", async () => {
    const { service } = build({ existing: row() });
    await expect(service.create(input, "admin-1")).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("geçersiz adres / görünen ad / port reddedilir", async () => {
    const { service } = build();
    await expect(
      service.create({ ...input, address: "nope" }, "admin-1"),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create({ ...input, displayName: "A\r\nBcc: x@y.z" }, "admin-1"),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create({ ...input, port: 70000 }, "admin-1"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("MailSenderAccountService.update", () => {
  it("şifre verilmezse kayıtlıdakini korur ve oturumu düşürür", async () => {
    const { service, tx, cipher, smtp } = build({ existing: row() });

    await service.update("acc-1", { displayName: "Sipariş" }, "admin-1");

    const data = tx.mailSenderAccount.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("passwordEncrypted");
    expect(cipher.encrypt).not.toHaveBeenCalled();
    expect(smtp.dropAccountTransport).toHaveBeenCalledWith("acc-1");
  });

  it("yeni şifre verilirse yeniden şifrelenir", async () => {
    const { service, tx, cipher } = build({ existing: row() });

    await service.update("acc-1", { password: "new-pass" }, "admin-1");

    expect(cipher.encrypt).toHaveBeenCalledWith("new-pass");
    expect(
      tx.mailSenderAccount.update.mock.calls[0][0].data.passwordEncrypted,
    ).toBe("enc(8)");
  });

  it("olmayan hesap → 404", async () => {
    const { service } = build({ existing: null });
    await expect(
      service.update("acc-1", { displayName: "x" }, "admin-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("MailSenderAccountService.remove", () => {
  it("bir alan kullanıyorsa 409 ve silinmez", async () => {
    const { service, tx } = build({ existing: row(), usedBy: ["order"] });

    await expect(service.remove("acc-1")).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.mailSenderAccount.delete).not.toHaveBeenCalled();
  });

  it("kullanılmıyorsa siler, oturumu kapatır, denetim adımını çağırır", async () => {
    const { service, tx, smtp } = build({ existing: row() });
    const afterWrite = jest.fn().mockResolvedValue(undefined);

    await service.remove("acc-1", afterWrite);

    expect(tx.mailSenderAccount.delete).toHaveBeenCalled();
    expect(smtp.dropAccountTransport).toHaveBeenCalledWith("acc-1");
    expect(afterWrite).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ after: null }),
    );
  });
});

describe("MailSenderAccountService.test", () => {
  it("kutunun kendi oturumuyla gerçek test gönderir", async () => {
    const { service, smtp } = build({ existing: row() });

    const result = await service.test("acc-1", "Serhat@Tarodan.com.tr");

    expect(result).toEqual({ ok: true, error: null });
    expect(smtp.sendThroughAccount).toHaveBeenCalledWith(
      expect.objectContaining({ id: "acc-1" }),
      expect.objectContaining({ to: "serhat@tarodan.com.tr" }),
    );
  });

  it("olmayan hesap → 404", async () => {
    const { service } = build({ existing: null });
    await expect(
      service.test("acc-1", "a@tarodan.com.tr"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
