import type { ConfigService } from "@nestjs/config";
import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../../prisma";
import { InvoiceDocumentService } from "./invoice-document.service";
import type {
  DocumentNumbering,
  EInvoiceProvider,
  RecipientKindResult,
} from "./provider/e-invoice-provider";

function fakeConfig(): ConfigService {
  const values: Record<string, string> = { ELOGO_INVOICE_PREFIX: "TRD" };
  return {
    get: (key: string, def?: string) => (key in values ? values[key] : def),
  } as unknown as ConfigService;
}

function fakeProvider(
  numbering: DocumentNumbering,
  resolveRecipientKind: (
    taxId: string,
  ) => Promise<RecipientKindResult | null> = async () => null,
) {
  return {
    numbering,
    resolveRecipientKind: jest.fn(resolveRecipientKind),
  };
}

function build(provider: ReturnType<typeof fakeProvider>, user?: object) {
  const upsert = jest.fn(async () => ({ lastValue: 7 }));
  const prisma = {
    fiscalDocSequence: { upsert },
    user: { findUnique: jest.fn(async () => user ?? null) },
  };
  const service = new InvoiceDocumentService(
    prisma as unknown as PrismaService,
    provider as unknown as EInvoiceProvider,
    fakeConfig(),
  );
  return { service, upsert, tx: prisma as unknown as Prisma.TransactionClient };
}

/**
 * Numara kapısı: belge numarasını kimin verdiği sağlayıcının
 * `numbering` bayrağından okunur. eLogo yereldir (boşluksuz TRD serisi);
 * numarayı ERP atayan bir sağlayıcıda sayaç hiç ilerlememeli — aksi halde
 * seride kullanılmayan numaralar kalır.
 */
describe("InvoiceDocumentService.allocateDocumentNumberInTransaction", () => {
  it("yerel numaralandırmada boşluksuz TRD numarası tahsis eder", async () => {
    const { service, upsert, tx } = build(fakeProvider("local"));

    const number = await service.allocateDocumentNumberInTransaction(tx, 2026);

    expect(number).toBe("TRD2026000000007");
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("numarayı sağlayıcı veriyorsa kayıt numarasız açılır, sayaç ilerlemez", async () => {
    const { service, upsert, tx } = build(fakeProvider("provider"));

    const number = await service.allocateDocumentNumberInTransaction(tx, 2026);

    expect(number).toBeNull();
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("InvoiceDocumentService.resolveRecipient — mükellefiyet sağlayıcıdan", () => {
  it("e-Fatura mükellefi: EINVOICE + posta kutusu etiketi", async () => {
    const provider = fakeProvider("local", async () => ({
      kind: "EINVOICE",
      alias: "urn:mail:pk@x",
    }));
    const { service } = build(provider, {
      companyName: "Firma A.Ş.",
      taxId: "1234567890",
    });

    const recipient = await service.resolveRecipient("u1");

    expect(provider.resolveRecipientKind).toHaveBeenCalledWith("1234567890");
    expect(recipient.documentType).toBe("EINVOICE");
    expect(recipient.alias).toBe("urn:mail:pk@x");
  });

  it("mükellef değilse etiket taşınmaz", async () => {
    const provider = fakeProvider("local", async () => ({
      kind: "EARCHIVE",
      alias: "urn:mail:stale@x",
    }));
    const { service } = build(provider, { taxId: "12345678901" });

    const recipient = await service.resolveRecipient("u1");

    expect(recipient.documentType).toBe("EARCHIVE");
    expect(recipient.alias).toBeUndefined();
  });

  it("sorgu düşerse güvenli taraf: EARCHIVE", async () => {
    const provider = fakeProvider("local", async () => {
      throw new Error("ECONNRESET");
    });
    const { service } = build(provider, { taxId: "1234567890" });

    const recipient = await service.resolveRecipient("u1");

    expect(recipient.documentType).toBe("EARCHIVE");
  });

  it("kimliği olmayan nihai tüketici için sağlayıcıya sorulmaz", async () => {
    const provider = fakeProvider("local");
    const { service } = build(provider, { displayName: "Ad Soyad" });

    const recipient = await service.resolveRecipient("u1");

    expect(recipient.vknTckn).toBe("11111111111");
    expect(provider.resolveRecipientKind).not.toHaveBeenCalled();
  });
});
