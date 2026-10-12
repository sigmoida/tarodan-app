import { ServiceUnavailableException } from "@nestjs/common";
import type { FiscalInvoiceType } from "@prisma/client";
import type { NetsisConfig } from "../../../config/netsis";
import type { PrismaService } from "../../../prisma";
import { i18nMessage } from "../../i18n/localized-message";
import {
  NETSIS_DOC_TYPES,
  NetsisClientFacade,
  NetsisRequestException,
  NetsisStubGateway,
} from "../../netsis";
import type { FiscalDocumentInput } from "./e-invoice-provider";
import {
  NETSIS_FEE_INVOICE_TYPES,
  NETSIS_INVOICE_SETTING_KEYS,
  netsisItemSettingKey,
} from "./netsis-invoice-settings";
import { NETSIS_HEADER_FIELDS } from "./netsis-invoice.constants";
import { NetsisInvoiceProvider } from "./netsis.provider";

const K = NETSIS_INVOICE_SETTING_KEYS;

const config: NetsisConfig = {
  enabled: true,
  mode: "stub",
  baseUrl: "",
  username: "",
  password: "",
  dbName: "",
  dbUser: "",
  dbPassword: "",
  dbType: "vtMSSQL",
  branchCode: "0",
  timeoutMs: 15_000,
  tokenSafetySeconds: 60,
};

function completeSettings(): Record<string, string> {
  const settings: Record<string, string> = {
    [K.retailCariCode]: "PERAKENDE",
    [K.earchiveSerial]: "EAR",
    [K.einvoiceSerial]: "EFT",
    [K.productSaleItem]: "URUN-SATIS",
  };
  NETSIS_FEE_INVOICE_TYPES.forEach((type, index) => {
    settings[netsisItemSettingKey(type)] = `HZM-${index + 1}`;
  });
  return settings;
}

interface FakeUser {
  id: string;
  adminCode: string;
  taxId: string | null;
  companyName: string | null;
  displayName: string;
  taxOffice: string | null;
  email: string;
}

const CORPORATE_USER: FakeUser = {
  id: "u-corp",
  adminCode: "K010042",
  taxId: "1234567890",
  companyName: "Model Araç A.Ş.",
  displayName: "modelarac",
  taxOffice: "Nilüfer",
  email: "muhasebe@example.com",
};

function makePrisma(
  settings: Record<string, string>,
  users: FakeUser[] = [CORPORATE_USER],
  invoiceTypes: Record<string, FiscalInvoiceType> = {},
) {
  return {
    platformSetting: {
      findMany: jest.fn(async () =>
        Object.entries(settings).map(([settingKey, settingValue]) => ({
          settingKey,
          settingValue,
        })),
      ),
    },
    user: {
      findUnique: jest.fn(
        async ({ where }: { where: { id: string } }) =>
          users.find((user) => user.id === where.id) ?? null,
      ),
      findFirst: jest.fn(
        async ({ where }: { where: { taxId: string } }) =>
          users.find((user) => user.taxId === where.taxId) ?? null,
      ),
    },
    fiscalInvoice: {
      findUnique: jest.fn(
        async ({ where }: { where: { invoiceNumber: string } }) =>
          invoiceTypes[where.invoiceNumber]
            ? { type: invoiceTypes[where.invoiceNumber] }
            : null,
      ),
    },
  };
}

async function build(
  options: {
    settings?: Record<string, string>;
    users?: FakeUser[];
    invoiceTypes?: Record<string, FiscalInvoiceType>;
    enabled?: boolean;
    retailCari?: boolean;
  } = {},
) {
  const gateway = new NetsisStubGateway();
  if (options.retailCari !== false) {
    await gateway.arps.create({
      CariTemelBilgi: { CARI_KOD: "PERAKENDE", CARI_ISIM: "Perakende" },
    });
  }
  const facade = new NetsisClientFacade(gateway, {
    ...config,
    enabled: options.enabled ?? true,
  });
  const prisma = makePrisma(
    options.settings ?? completeSettings(),
    options.users,
    options.invoiceTypes,
  );
  const provider = new NetsisInvoiceProvider(
    facade,
    prisma as unknown as PrismaService,
  );
  return { gateway, prisma, provider };
}

function document(over: Partial<FiscalDocumentInput> = {}): FiscalDocumentInput {
  return {
    scenario: "EARCHIVE",
    kind: "SALE",
    ettn: "11111111-2222-4333-8444-555555555555",
    issueDate: "2026-10-12",
    issueTime: "10:15:00",
    currency: "TRY",
    sendType: "ELEKTRONIK",
    note: "Satıcı aracılık hizmet (komisyon) bedeli",
    supplier: { vknTckn: "7620277268", title: "TARODAN" },
    customer: {
      vknTckn: "12345678901",
      firstName: "Ayşe",
      lastName: "Yılmaz",
      city: "Bursa",
      district: "Nilüfer",
      email: "ayse@example.com",
    },
    lines: [
      {
        name: "Satıcı aracılık hizmet (komisyon) bedeli",
        quantity: 1,
        unitPrice: 100,
        vatRate: 20,
      },
    ],
    ...over,
  };
}

const corporateDocument = (over: Partial<FiscalDocumentInput> = {}) =>
  document({
    scenario: "EINVOICE",
    sendType: undefined,
    customer: {
      vknTckn: "1234567890",
      title: "Model Araç A.Ş.",
      city: "Bursa",
      district: "Nilüfer",
    },
    ...over,
  });

const SALE_CONTEXT = {
  invoiceType: "seller_commission" as const,
  recipientUserId: "u-seller",
  sourceReference: "KYT-K7X9M2QF3N",
};

const NUMBER = /^EAR\d{4}000000001$/;

describe("NetsisInvoiceProvider", () => {
  it("adı netsis, numarayı sağlayıcı verir; açıklık NETSIS_ENABLED'dan", async () => {
    const { provider } = await build();
    expect(provider.name).toBe("netsis");
    expect(provider.numbering).toBe("provider");
    expect(provider.isEnabled()).toBe(true);
    expect((await build({ enabled: false })).provider.isEnabled()).toBe(false);
  });

  describe("send — yeni belge", () => {
    it("bireysel alıcı: ortak cariye fiş açar, e-Arşiv serisinden numaralar, gönderir", async () => {
      const { gateway, provider } = await build();

      const res = await provider.send(document(), SALE_CONTEXT);

      expect(res).toEqual({
        accepted: true,
        providerRef: expect.stringMatching(/^ftSFat:EAR\d{4}000000001$/),
        documentNumber: expect.stringMatching(NUMBER),
        ettn: expect.stringMatching(/^00000000-0000-4000-8000-/),
      });
      const snap = gateway.snapshot();
      expect(snap.slips).toHaveLength(1);
      const slip = snap.slips[0];
      expect(slip.FaturaTip).toBe(NETSIS_DOC_TYPES.salesInvoice);
      expect(slip.FatUst).toMatchObject({
        CARI_KODU: "PERAKENDE",
        FATIRS_NO: expect.stringMatching(NUMBER),
        TARIH: "2026-10-12",
        [NETSIS_HEADER_FIELDS.recipientTaxId]: "12345678901",
        [NETSIS_HEADER_FIELDS.recipientFirstName]: "Ayşe",
        [NETSIS_HEADER_FIELDS.ourEttnReference]: document().ettn,
        [NETSIS_HEADER_FIELDS.sourceReference]: "KYT-K7X9M2QF3N",
      });
      const sellerCommissionItem =
        completeSettings()[netsisItemSettingKey("seller_commission")];
      expect(slip.Kalems.map((line) => line.STOK_KODU)).toEqual([
        sellerCommissionItem,
      ]);
      expect(snap.items.map((item) => item.StokTemelBilgi.STOK_KODU)).toEqual(
        [sellerCommissionItem],
      );
      expect(snap.eDocuments).toEqual([
        expect.objectContaining({ state: "sent" }),
      ]);
      expect(snap.transactions).toEqual([
        expect.objectContaining({ state: "committed" }),
      ]);
    });

    it("kurumsal alıcı: carisi B/K koduyla açılır, bayrağı tazelenir, e-Fatura serisi kullanılır", async () => {
      const { gateway, provider } = await build();
      const refresh = jest.spyOn(gateway.arps, "refreshEInvoiceFlags");

      const res = await provider.send(corporateDocument(), {
        ...SALE_CONTEXT,
        recipientUserId: "u-corp",
      });

      expect(res).toEqual(
        expect.objectContaining({
          accepted: true,
          documentNumber: expect.stringMatching(/^EFT\d{4}000000001$/),
        }),
      );
      const snap = gateway.snapshot();
      expect(snap.arps.map((arp) => arp.CariTemelBilgi.CARI_KOD)).toContain(
        "K010042",
      );
      expect(snap.slips[0].FatUst.CARI_KODU).toBe("K010042");
      expect(snap.slips[0].FatUst).not.toHaveProperty(
        NETSIS_HEADER_FIELDS.recipientTaxId,
      );
      expect(refresh).toHaveBeenCalledWith("K010042", expect.anything());
    });

    it("kurumsal cari yoksa ve otomatik açma kapalıysa gönderilmez (configuration)", async () => {
      const { gateway, provider } = await build({
        settings: { ...completeSettings(), [K.autoCreateCorporateCari]: "false" },
      });

      const res = await provider.send(corporateDocument(), SALE_CONTEXT);

      expect(res).toEqual(
        expect.objectContaining({ accepted: false, category: "configuration" }),
      );
      expect(gateway.snapshot().slips).toHaveLength(0);
      expect(gateway.snapshot().transactions).toEqual([
        expect.objectContaining({ state: "rolledBack" }),
      ]);
    });

    it("VKN hiçbir kullanıcıya bağlı değilse gönderilmez", async () => {
      const { gateway, provider } = await build({ users: [] });
      const res = await provider.send(corporateDocument(), SALE_CONTEXT);
      expect(res).toEqual(
        expect.objectContaining({ accepted: false, category: "configuration" }),
      );
      expect(gateway.snapshot().transactions).toHaveLength(0);
    });

    it("ürün satışı tek ürün kartıyla, iade faturası orijinalin kartıyla kesilir", async () => {
      const { gateway, provider } = await build({
        invoiceTypes: { EAR2026000000099: "membership" },
      });

      await provider.send(document(), { invoiceType: "platform_sale" });
      await provider.send(
        document({
          kind: "RETURN",
          ettn: "11111111-2222-4333-8444-666666666666",
          billingReference: {
            documentNumber: "EAR2026000000099",
            issueDate: "2026-10-01",
          },
        }),
        { invoiceType: "return_invoice" },
      );

      const [sale, ret] = gateway.snapshot().slips;
      expect(sale.Kalems[0].STOK_KODU).toBe("URUN-SATIS");
      expect(ret.FaturaTip).toBe(NETSIS_DOC_TYPES.salesReturnInvoice);
      expect(ret.Kalems[0].STOK_KODU).toBe(
        completeSettings()[netsisItemSettingKey("membership")],
      );
      expect(ret.FatUst[NETSIS_HEADER_FIELDS.returnOfNumber]).toBe(
        "EAR2026000000099",
      );
    });

    it("orijinali bulunamayan iade faturası gönderilmez", async () => {
      const { provider } = await build();
      const res = await provider.send(
        document({
          kind: "RETURN",
          billingReference: { documentNumber: "YOK", issueDate: "2026-10-01" },
        }),
        { invoiceType: "return_invoice" },
      );
      expect(res).toEqual(
        expect.objectContaining({ accepted: false, category: "configuration" }),
      );
    });

    it("eksik ayarlar: ETTN aramasından başka Netsis çağrısı yapılmaz, eksik anahtarlar mesajda", async () => {
      const settings = completeSettings();
      delete settings[K.retailCariCode];
      delete settings[netsisItemSettingKey("seller_commission")];
      const { gateway, provider } = await build({ settings });
      const lookup = jest.spyOn(gateway.itemSlips, "findByTrackingKey");

      const res = await provider.send(document(), SALE_CONTEXT);

      expect(lookup).toHaveBeenCalledTimes(1);

      expect(res.accepted).toBe(false);
      if (res.accepted) return;
      expect(res.category).toBe("configuration");
      expect(res.resultMsg).toContain(K.retailCariCode);
      expect(res.resultMsg).toContain(
        netsisItemSettingKey("seller_commission"),
      );
      expect(gateway.snapshot().transactions).toHaveLength(0);
    });

    it("perakende cari Netsis'te yoksa gönderilmez", async () => {
      const { gateway, provider } = await build({ retailCari: false });
      const res = await provider.send(document(), SALE_CONTEXT);
      expect(res).toEqual(
        expect.objectContaining({ accepted: false, category: "configuration" }),
      );
      expect(gateway.snapshot().slips).toHaveLength(0);
    });

    it("Netsis'in hesapladığı toplam kayıttakinden saparsa: fiş yok, numara tüketilmez, gönderim yok", async () => {
      const { gateway, provider } = await build();
      const newNumber = jest.spyOn(gateway.itemSlips, "newEArchiveNumber");
      const sendEDocument = jest.spyOn(gateway.eDocuments, "send");

      // Kayıt KDV'yi 20,05 beyan ediyor; Netsis satırdan 20,00 hesaplar.
      const res = await provider.send(
        document({
          lines: [
            {
              name: "Komisyon",
              quantity: 1,
              unitPrice: 100,
              vatRate: 20,
              taxAmount: 20.05,
            },
          ],
        }),
        SALE_CONTEXT,
      );

      expect(res.accepted).toBe(false);
      if (res.accepted) return;
      expect(res.category).toBe("configuration");
      expect(res.resultMsg).toContain("20.05");
      expect(res.resultMsg).toContain("20.00");
      expect(res).not.toHaveProperty("providerRef");
      expect(newNumber).not.toHaveBeenCalled();
      expect(sendEDocument).not.toHaveBeenCalled();
      expect(gateway.snapshot().slips).toHaveLength(0);
      expect(gateway.snapshot().transactions).toEqual([
        expect.objectContaining({ state: "rolledBack" }),
      ]);
    });

    it("fiş oluşmadan ağ hatası: fırlatılır, transaction geri alınır", async () => {
      const { gateway, provider } = await build();
      jest
        .spyOn(gateway.itemSlips, "newEArchiveNumber")
        .mockRejectedValue(
          new NetsisRequestException("network", null, "connect ETIMEDOUT"),
        );

      await expect(provider.send(document(), SALE_CONTEXT)).rejects.toThrow(
        NetsisRequestException,
      );
      expect(gateway.snapshot().slips).toHaveLength(0);
      expect(gateway.snapshot().transactions).toEqual([
        expect.objectContaining({ state: "rolledBack" }),
      ]);
    });

    it("fiş oluştuktan sonra e-belge ağ hatası: fiş kalır, sonuç referansı ve numarayı taşır", async () => {
      const { gateway, provider } = await build();
      jest
        .spyOn(gateway.eDocuments, "send")
        .mockRejectedValueOnce(
          new NetsisRequestException("network", 504, "gateway timeout"),
        );

      const res = await provider.send(document(), SALE_CONTEXT);

      expect(res).toEqual({
        accepted: false,
        category: "network",
        resultMsg: expect.stringContaining("gateway timeout"),
        providerRef: expect.stringMatching(/^ftSFat:EAR\d{4}000000001$/),
        documentNumber: expect.stringMatching(NUMBER),
      });
      expect(gateway.snapshot().slips).toHaveLength(1);
      expect(gateway.snapshot().transactions).toEqual([
        expect.objectContaining({ state: "committed" }),
      ]);
    });

    it("e-belge iş kuralı reddi sonrası da referans korunur (unknown)", async () => {
      const { gateway, provider } = await build();
      jest
        .spyOn(gateway.eDocuments, "send")
        .mockRejectedValueOnce(
          new NetsisRequestException("validation", 400, "alıcı adresi eksik"),
        );
      const res = await provider.send(document(), SALE_CONTEXT);
      expect(res).toEqual(
        expect.objectContaining({
          accepted: false,
          category: "unknown",
          providerRef: expect.any(String),
          documentNumber: expect.stringMatching(NUMBER),
        }),
      );
    });
  });

  describe("send — kayıp yanıt (referans yok, fiş ETTN ile aranır)", () => {
    it("normal yol: arama boş döner, fiş bir kez açılır", async () => {
      const { gateway, provider } = await build();
      const lookup = jest.spyOn(gateway.itemSlips, "findByTrackingKey");
      const create = jest.spyOn(gateway.itemSlips, "create");

      const res = await provider.send(document(), SALE_CONTEXT);

      expect(res.accepted).toBe(true);
      expect(lookup).toHaveBeenCalledWith(document().ettn);
      expect(create).toHaveBeenCalledTimes(1);
      expect(gateway.snapshot().slips).toHaveLength(1);
    });

    it("commit oldu ama yanıt kayboldu: yeniden deneme İKİNCİ fiş açmaz, tutarı kontrol edip yalnız gönderir", async () => {
      const { gateway, provider } = await build();
      gateway.loseNextCommitResponse();

      // 1. deneme: Netsis fişi yazdı, yanıt gelmedi → ulaşım hatası fırlar,
      // teslim katmanının elinde referans yok.
      await expect(provider.send(document(), SALE_CONTEXT)).rejects.toThrow(
        NetsisRequestException,
      );
      expect(gateway.snapshot().slips).toHaveLength(1);
      expect(gateway.snapshot().eDocuments).toHaveLength(0);
      expect(gateway.snapshot().transactions).toEqual([
        expect.objectContaining({ state: "committed" }),
      ]);

      const create = jest.spyOn(gateway.itemSlips, "create");
      const newNumber = jest.spyOn(gateway.itemSlips, "newEArchiveNumber");
      const calculate = jest.spyOn(gateway.itemSlips, "calculate");
      const check = jest.spyOn(gateway.eDocuments, "check");

      // 2. deneme: existingProviderRef YOK (teslim katmanı bilmiyor).
      const res = await provider.send(document(), SALE_CONTEXT);

      expect(res).toEqual({
        accepted: true,
        providerRef: expect.stringMatching(/^ftSFat:EAR\d{4}000000001$/),
        documentNumber: expect.stringMatching(NUMBER),
        ettn: expect.stringMatching(/^00000000-0000-4000-8000-/),
      });
      expect(create).not.toHaveBeenCalled();
      expect(newNumber).not.toHaveBeenCalled();
      expect(calculate).toHaveBeenCalledTimes(1);
      expect(check).toHaveBeenCalledTimes(1);
      const snap = gateway.snapshot();
      expect(snap.slips).toHaveLength(1);
      expect(snap.eDocuments).toEqual([
        expect.objectContaining({ state: "sent" }),
      ]);
      // Yeni transaction açılmadı: yazım yok.
      expect(snap.transactions).toHaveLength(1);
    });

    it("bulunan fişin e-belgesi zaten yoldaysa ikinci kez gönderilmez, kabul sayılır", async () => {
      const { gateway, provider } = await build();
      const first = await provider.send(document(), SALE_CONTEXT);
      if (!first.accepted) throw new Error("fixture");
      const sendEDocument = jest.spyOn(gateway.eDocuments, "send");

      const res = await provider.send(document(), SALE_CONTEXT);

      expect(res).toEqual(
        expect.objectContaining({
          accepted: true,
          providerRef: first.providerRef,
          documentNumber: first.documentNumber,
        }),
      );
      expect(sendEDocument).not.toHaveBeenCalled();
      expect(gateway.snapshot().slips).toHaveLength(1);
    });

    it("arama ağ hatasıyla düşerse fırlatılır, fiş açılmaz", async () => {
      const { gateway, provider } = await build();
      jest
        .spyOn(gateway.itemSlips, "findByTrackingKey")
        .mockRejectedValue(
          new NetsisRequestException("network", null, "ETIMEDOUT"),
        );
      const create = jest.spyOn(gateway.itemSlips, "create");

      await expect(provider.send(document(), SALE_CONTEXT)).rejects.toThrow(
        NetsisRequestException,
      );
      expect(create).not.toHaveBeenCalled();
      expect(gateway.snapshot().transactions).toHaveLength(0);
    });

    it("arama sonucu okunamazsa fiş açılmaz (ikinci fiş riski), reddedilir", async () => {
      const { gateway, provider } = await build();
      jest
        .spyOn(gateway.itemSlips, "findByTrackingKey")
        .mockRejectedValue(
          new NetsisRequestException("unknown", null, "unexpected row"),
        );

      const res = await provider.send(document(), SALE_CONTEXT);

      expect(res).toEqual(
        expect.objectContaining({ accepted: false, category: "unknown" }),
      );
      expect(gateway.snapshot().slips).toHaveLength(0);
      expect(gateway.snapshot().transactions).toHaveLength(0);
    });
  });

  describe("send — mevcut referansla (idempotent yeniden gönderim)", () => {
    async function createdButUnsent() {
      const built = await build();
      jest
        .spyOn(built.gateway.eDocuments, "send")
        .mockRejectedValueOnce(
          new NetsisRequestException("network", null, "socket hang up"),
        );
      const first = await built.provider.send(document(), SALE_CONTEXT);
      if (first.accepted || !first.providerRef) {
        throw new Error("fixture: expected a created-but-unsent slip");
      }
      return { ...built, providerRef: first.providerRef, first };
    }

    it("fişi YENİDEN OLUŞTURMAZ, yalnız e-belgeyi gönderir", async () => {
      const { gateway, provider, providerRef, first } =
        await createdButUnsent();
      const create = jest.spyOn(gateway.itemSlips, "create");
      const newNumber = jest.spyOn(gateway.itemSlips, "newEArchiveNumber");

      const res = await provider.send(document(), {
        ...SALE_CONTEXT,
        existingProviderRef: providerRef,
      });

      expect(res).toEqual(
        expect.objectContaining({
          accepted: true,
          providerRef,
          documentNumber: first.documentNumber,
        }),
      );
      expect(create).not.toHaveBeenCalled();
      expect(newNumber).not.toHaveBeenCalled();
      expect(gateway.snapshot().slips).toHaveLength(1);
      expect(gateway.snapshot().eDocuments).toHaveLength(1);
    });

    it("e-belge zaten gönderilmişse ikinci kez göndermez, kabul sayar", async () => {
      const { gateway, provider } = await build();
      const sent = await provider.send(document(), SALE_CONTEXT);
      if (!sent.accepted || !sent.providerRef) throw new Error("fixture");
      const sendEDocument = jest.spyOn(gateway.eDocuments, "send");

      const res = await provider.send(document(), {
        ...SALE_CONTEXT,
        existingProviderRef: sent.providerRef,
      });

      expect(res).toEqual(
        expect.objectContaining({
          accepted: true,
          documentNumber: sent.documentNumber,
        }),
      );
      expect(sendEDocument).not.toHaveBeenCalled();
    });

    it("fiş kayıttaki tutarlarla artık uyuşmuyorsa (yeniden fiyatlama) gönderilmez, silinmez", async () => {
      const { gateway, provider, providerRef } = await createdButUnsent();
      const remove = jest.spyOn(gateway.itemSlips, "delete");

      const res = await provider.send(
        document({
          lines: [{ name: "Komisyon", quantity: 1, unitPrice: 60, vatRate: 20 }],
        }),
        { ...SALE_CONTEXT, existingProviderRef: providerRef },
      );

      expect(res).toEqual(
        expect.objectContaining({
          accepted: false,
          category: "configuration",
          providerRef,
        }),
      );
      expect(remove).not.toHaveBeenCalled();
      expect(gateway.snapshot().eDocuments).toHaveLength(0);
    });

    it("iptal edilmiş e-belge yeniden gönderilmez", async () => {
      const { gateway, provider } = await build();
      const sent = await provider.send(document(), SALE_CONTEXT);
      if (!sent.accepted || !sent.providerRef || !sent.ettn) {
        throw new Error("fixture");
      }
      gateway.setEDocumentState(sent.ettn, "cancelled");

      const res = await provider.send(document(), {
        ...SALE_CONTEXT,
        existingProviderRef: sent.providerRef,
      });
      expect(res).toEqual(
        expect.objectContaining({ accepted: false, category: "unknown" }),
      );
    });

    it("Netsis referansı olmayan değer yapılandırma reddidir", async () => {
      const { provider } = await build();
      const res = await provider.send(document(), {
        ...SALE_CONTEXT,
        existingProviderRef: "42",
      });
      expect(res).toEqual(
        expect.objectContaining({ accepted: false, category: "configuration" }),
      );
    });

    it("referansın fişi Netsis'te yoksa yapılandırma reddi", async () => {
      const { provider } = await build();
      const res = await provider.send(document(), {
        ...SALE_CONTEXT,
        existingProviderRef: "ftSFat:EAR2026000000777",
      });
      expect(res).toEqual(
        expect.objectContaining({ accepted: false, category: "configuration" }),
      );
    });
  });

  describe("getStatus", () => {
    it.each([
      ["accepted", "completed"],
      ["sent", "processing"],
      ["rejected", "failed"],
      ["cancelled", "cancelled"],
    ] as const)("Netsis %s → %s", async (netsisState, state) => {
      const { gateway, provider } = await build();
      const sent = await provider.send(document(), SALE_CONTEXT);
      if (!sent.accepted || !sent.ettn) throw new Error("fixture");
      gateway.setEDocumentState(sent.ettn, netsisState);

      const status = await provider.getStatus({
        ettn: sent.ettn,
        providerRef: sent.providerRef,
      });
      expect(status.state).toBe(state);
    });

    it("fiş var ama e-belge yok (taslak) → unknown: teslim katmanı gönderir", async () => {
      const { provider, providerRef } = await (async () => {
        const built = await build();
        jest
          .spyOn(built.gateway.eDocuments, "send")
          .mockRejectedValueOnce(
            new NetsisRequestException("network", null, "timeout"),
          );
        const res = await built.provider.send(document(), SALE_CONTEXT);
        if (res.accepted) throw new Error("fixture");
        return { ...built, providerRef: res.providerRef };
      })();
      const status = await provider.getStatus({
        ettn: document().ettn,
        providerRef,
      });
      expect(status.state).toBe("unknown");
    });

    it("referans yoksa Netsis'e sorulmaz: unknown", async () => {
      const { gateway, provider } = await build();
      const check = jest.spyOn(gateway.eDocuments, "check");
      expect(
        await provider.getStatus({ ettn: "x", providerRef: null }),
      ).toEqual({ state: "unknown" });
      expect(check).not.toHaveBeenCalled();
    });
  });

  describe("cancelEArchive", () => {
    it("gönderilmiş e-Arşiv'i iptal eder", async () => {
      const { gateway, provider } = await build();
      const sent = await provider.send(document(), SALE_CONTEXT);
      if (!sent.accepted) throw new Error("fixture");

      const res = await provider.cancelEArchive({
        ettn: sent.ettn ?? "",
        providerRef: sent.providerRef,
      });

      expect(res).toEqual({ success: true });
      expect(gateway.snapshot().eDocuments[0].state).toBe("cancelled");
    });

    it("referans yoksa ya da Netsis reddederse başarısız döner", async () => {
      const { provider } = await build();
      expect(
        (await provider.cancelEArchive({ ettn: "x", providerRef: null }))
          .success,
      ).toBe(false);
      const res = await provider.cancelEArchive({
        ettn: "x",
        providerRef: "ftSFat:EAR2026000000777",
      });
      expect(res.success).toBe(false);
      expect(res.resultMsg).toBeTruthy();
    });

    it("ulaşım hatası fırlatılır (iptal sonucu bilinmiyor)", async () => {
      const { gateway, provider } = await build();
      jest
        .spyOn(gateway.eDocuments, "cancelEArchive")
        .mockRejectedValue(
          new NetsisRequestException("network", null, "ECONNRESET"),
        );
      await expect(
        provider.cancelEArchive({
          ettn: "x",
          providerRef: "ftSFat:EAR2026000000001",
        }),
      ).rejects.toThrow(NetsisRequestException);
    });
  });

  describe("resolveRecipientKind", () => {
    it("TCKN ve bilinmeyen tüketici: e-Arşiv, Netsis'e sorulmaz", async () => {
      const { gateway, provider } = await build();
      const find = jest.spyOn(gateway.arps, "findByCode");
      expect(await provider.resolveRecipientKind("12345678901")).toEqual({
        kind: "EARCHIVE",
      });
      expect(await provider.resolveRecipientKind("11111111111")).toEqual({
        kind: "EARCHIVE",
      });
      expect(find).not.toHaveBeenCalled();
    });

    it("VKN: cari bayrağı mükellef diyorsa e-Fatura + etiket", async () => {
      const { gateway, provider } = await build();
      await gateway.arps.create({
        CariTemelBilgi: { CARI_KOD: "K010042" },
        CariEkBilgi: {
          EFATURA_KULLANICISI: "E",
          EFATURA_ETIKET: "urn:mail:defaultpk@modelarac.com",
        },
      });
      const refresh = jest.spyOn(gateway.arps, "refreshEInvoiceFlags");

      expect(await provider.resolveRecipientKind("1234567890")).toEqual({
        kind: "EINVOICE",
        alias: "urn:mail:defaultpk@modelarac.com",
      });
      expect(refresh).toHaveBeenCalledWith("K010042");
    });

    it("VKN: cari yoksa açılır; bayrak okunamazsa e-Arşiv (hata değil)", async () => {
      const { gateway, provider } = await build();
      expect(await provider.resolveRecipientKind("1234567890")).toEqual({
        kind: "EARCHIVE",
      });
      expect(
        gateway.snapshot().arps.map((arp) => arp.CariTemelBilgi.CARI_KOD),
      ).toContain("K010042");
    });

    it("VKN kullanıcıya bağlı değilse e-Arşiv", async () => {
      const { provider } = await build({ users: [] });
      expect(await provider.resolveRecipientKind("1234567890")).toEqual({
        kind: "EARCHIVE",
      });
    });

    it("ulaşım hatası yutulmaz", async () => {
      const { gateway, provider } = await build();
      jest
        .spyOn(gateway.arps, "findByCode")
        .mockRejectedValue(
          new NetsisRequestException("network", null, "ETIMEDOUT"),
        );
      await expect(provider.resolveRecipientKind("1234567890")).rejects.toThrow(
        NetsisRequestException,
      );
    });
  });

  describe("classifyError", () => {
    it.each([
      [new NetsisRequestException("network", null, "x"), "network"],
      [new NetsisRequestException("conflict", 409, "x"), "duplicate-number"],
      [new NetsisRequestException("auth", 401, "x"), "configuration"],
      [new NetsisRequestException("configuration", 404, "x"), "configuration"],
      [new NetsisRequestException("validation", 400, "x"), "unknown"],
      [new NetsisRequestException("unknown", 500, "x"), "unknown"],
      [Object.assign(new Error("connect"), { code: "ECONNREFUSED" }), "network"],
      [
        new ServiceUnavailableException(i18nMessage("server.netsis.sessionBusy")),
        "network",
      ],
      [
        new ServiceUnavailableException(i18nMessage("server.netsis.disabled")),
        "configuration",
      ],
      [new Error("boom"), "unknown"],
      [undefined, "unknown"],
    ])("%p → %s", async (error, category) => {
      const { provider } = await build();
      expect(provider.classifyError(error)).toBe(category);
    });
  });

  it("iade stratejisi paylaşılan 8 gün kuralıdır", async () => {
    const { provider } = await build();
    const issued = new Date("2026-06-01T00:00:00Z");
    expect(
      provider.eArchiveReversalStrategy(issued, new Date("2026-06-09T00:00:00Z")),
    ).toBe("CANCEL");
    expect(
      provider.eArchiveReversalStrategy(issued, new Date("2026-06-10T00:00:00Z")),
    ).toBe("RETURN_INVOICE");
  });

  it("PDF'i Netsis'ten çekmez (kendi şablonumuz üretir)", async () => {
    const { provider } = await build();
    await expect(provider.fetchPdf()).resolves.toBeNull();
  });
});
