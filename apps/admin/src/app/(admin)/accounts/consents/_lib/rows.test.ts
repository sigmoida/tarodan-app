import { describe, expect, it } from "vitest";
import type { AdminConsentRecordRow } from "@tarodan/types";
import type { TranslateFn } from "@/components/list/filters/types";
import { consentReference, consentSubject } from "./rows";

const t = ((key: string) => key) as unknown as TranslateFn;

const base: AdminConsentRecordRow = {
  id: "c1",
  document: "distance_sales",
  version: "2026-08-03",
  isCurrentVersion: true,
  action: "granted",
  source: "checkout",
  subjectType: "user",
  user: null,
  guestEmail: null,
  visitorId: null,
  details: null,
  ipAddress: null,
  userAgent: null,
  checkoutGroup: null,
  order: null,
  createdAt: "2026-10-01T09:00:00.000Z",
};

describe("consentSubject", () => {
  it("üye kaydı kullanıcı dosyasına bağlanır", () => {
    expect(
      consentSubject(t, {
        ...base,
        user: {
          id: "u1",
          displayName: "Ahmet",
          email: "a@example.com",
          adminCode: "B10001",
        },
      }),
    ).toMatchObject({ name: "Ahmet", href: "/accounts/users/u1" });
  });

  it("misafir alıcı e-postasıyla gösterilir", () => {
    expect(
      consentSubject(t, {
        ...base,
        subjectType: "guest",
        guestEmail: "g@x.com",
      }),
    ).toMatchObject({ name: "g@x.com" });
  });

  it("anonim ziyaretçi ziyaretçi kimliğiyle gösterilir", () => {
    expect(
      consentSubject(t, {
        ...base,
        subjectType: "visitor",
        visitorId: "6f1c2a7e-7b0f-4e0b-9a3c-2f3d1e5a9b10",
      }),
    ).toMatchObject({
      name: "admin.consents.subjects.visitor",
      secondary: "6f1c2a7e-7b0f-4e0b-9a3c-2f3d1e5a9b10",
    });
  });
});

describe("consentReference", () => {
  it("tekil (teklif) sipariş dosyasına bağlanır", () => {
    expect(
      consentReference({
        ...base,
        order: { id: "o1", orderNumber: "ORD-10001" },
      }),
    ).toEqual({ href: "/operations/orders/o1", label: "ORD-10001" });
  });

  it("sepet numarasıyla Siparişler ekranında arar", () => {
    const ref = consentReference({
      ...base,
      checkoutGroup: { id: "g1", groupNumber: "GRP-10001" },
    });
    expect(ref?.label).toBe("GRP-10001");
    expect(ref?.href).toContain("q=GRP-10001");
  });

  it("satın alma bağı yoksa boş", () => {
    expect(consentReference(base)).toBeNull();
  });
});
