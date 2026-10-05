import { describe, expect, it } from "vitest";
import type { AdminGibReportRow } from "@tarodan/types";
import type { TranslateFn } from "@/components/list/filters/types";
import { gibSeller } from "./rows";

const t = ((key: string) => key) as unknown as TranslateFn;

const base: AdminGibReportRow = {
  productId: "p1",
  productCode: "U010001",
  title: "Hot Wheels",
  description: null,
  price: 149.9,
  status: "active",
  publishedAt: "2026-02-01T09:00:00.000Z",
  createdAt: "2026-01-30T09:00:00.000Z",
  listingUrl: "https://tarodan.com.tr/listings/p1",
  sellerId: "u1",
  sellerKind: "individual",
  sellerDeleted: false,
  membershipDate: "2025-03-01T10:00:00.000Z",
  identityNumber: "12345678901",
  identityKind: "tckn",
  legalName: "Ahmet Kaya",
  legalNameSource: "bank_account_holder",
  storeName: "ahmet_k",
  profileUrl: "https://tarodan.com.tr/u/ahmet_k",
};

describe("gibSeller", () => {
  it("yasal adı, kaynağını ve türünü kullanıcı dosyası bağlantısıyla gösterir", () => {
    expect(gibSeller(t, base)).toEqual({
      name: "Ahmet Kaya",
      secondary: "admin.gibReport.nameSources.bankAccountHolder",
      tertiary: "admin.gibReport.sellerKinds.individual",
      href: "/accounts/users/u1",
    });
  });

  it("silinmiş hesabı işaretler", () => {
    expect(gibSeller(t, { ...base, sellerDeleted: true }).tertiary).toBe(
      "admin.gibReport.sellerKinds.individual · admin.gibReport.deletedSeller",
    );
  });

  it("ad çözülemediyse 'çözülemedi' yazar, kaynak satırı eklemez", () => {
    expect(
      gibSeller(t, { ...base, legalName: null, legalNameSource: "none" }),
    ).toMatchObject({
      name: "admin.gibReport.nameSources.none",
      secondary: undefined,
    });
  });
});
