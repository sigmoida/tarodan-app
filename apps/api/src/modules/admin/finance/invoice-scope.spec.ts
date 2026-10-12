import {
  FISCAL_INVOICE_SCOPES,
  fiscalInvoiceScopeWhere,
  type InvoicePartyFieldRefs,
} from "./invoice-scope";

/**
 * Fatura ekranının sekmeleri. Taraf sekmeleri belgenin MUHATABINI işlemin
 * taraflarıyla karşılaştırır; türden çıkarım yapmaz. Bu spec o kuralın
 * bozulmasını engeller — türe göre liste tutulsaydı her yeni fatura türü
 * sessizce hiçbir sekmede görünmezdi.
 */

// `prisma.fiscalInvoice.fields` yerine geçen işaretçiler; karşılaştırmanın hangi
// alana kurulduğu görünsün diye düz string.
const fields = {
  sellerUserId: "ref:sellerUserId",
  buyerUserId: "ref:buyerUserId",
} as unknown as InvoicePartyFieldRefs;

describe("fiscalInvoiceScopeWhere", () => {
  it("sekme verilmezse hiçbir kısıt eklemez", () => {
    expect(fiscalInvoiceScopeWhere(undefined, fields)).toEqual({});
    expect(fiscalInvoiceScopeWhere("all", fields)).toEqual({});
  });

  it("satıcı sekmesi muhatabı işlemin SATICISI olan belgeleri gösterir", () => {
    expect(fiscalInvoiceScopeWhere("seller", fields)).toEqual({
      recipientUserId: { equals: fields.sellerUserId },
    });
  });

  it("alıcı sekmesi platform satışlarını dışarıda bırakır", () => {
    // Üyelik ve öne çıkarma da muhatabı alıcı olan belgelerdir ama bir
    // alışverişin tarafına kesilmemişlerdir; kendi sekmeleri vardır.
    expect(fiscalInvoiceScopeWhere("buyer", fields)).toEqual({
      recipientUserId: { equals: fields.buyerUserId },
      type: { notIn: ["membership", "boost"] },
    });
  });

  it("ceza ve platform sekmeleri türe göre süzer", () => {
    expect(fiscalInvoiceScopeWhere("penalty", fields)).toEqual({
      type: "penalty",
    });
    expect(fiscalInvoiceScopeWhere("platform", fields)).toEqual({
      type: { in: ["membership", "boost"] },
    });
  });

  it("her sekme bir where üretir — listede olup karşılığı olmayan sekme kalmaz", () => {
    for (const scope of FISCAL_INVOICE_SCOPES) {
      expect(fiscalInvoiceScopeWhere(scope, fields)).toBeDefined();
    }
  });
});
