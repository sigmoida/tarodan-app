import { EInvoiceProviderName } from "@prisma/client";
import {
  DEFAULT_INVOICE_PROVIDER,
  INVOICE_PROVIDER_NAMES,
  invoiceProviderName,
  parseInvoiceProviderName,
} from "./invoice-provider";

describe("config/invoice-provider", () => {
  const saved = process.env.INVOICE_PROVIDER;

  afterEach(() => {
    if (saved === undefined) delete process.env.INVOICE_PROVIDER;
    else process.env.INVOICE_PROVIDER = saved;
  });

  it("lists exactly the providers the schema knows", () => {
    expect([...INVOICE_PROVIDER_NAMES].sort()).toEqual(
      Object.values(EInvoiceProviderName).sort(),
    );
  });

  it("defaults to eLogo when unset or blank", () => {
    delete process.env.INVOICE_PROVIDER;
    expect(DEFAULT_INVOICE_PROVIDER).toBe("elogo");
    expect(invoiceProviderName()).toBe("elogo");
    process.env.INVOICE_PROVIDER = "   ";
    expect(invoiceProviderName()).toBe("elogo");
  });

  it("reads netsis case-insensitively", () => {
    process.env.INVOICE_PROVIDER = " Netsis ";
    expect(invoiceProviderName()).toBe("netsis");
  });

  it("rejects unknown names in parsing and falls back in the accessor", () => {
    expect(parseInvoiceProviderName("logo")).toBeNull();
    process.env.INVOICE_PROVIDER = "logo";
    expect(invoiceProviderName()).toBe("elogo");
  });
});
