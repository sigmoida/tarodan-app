import { BadRequestException } from "@nestjs/common";
import { i18nMessage } from "../../i18n";
import {
  ADMIN_RENEW_AUDIT_ACTION,
  AdminProductRenewalService,
} from "./admin-product-renewal.service";

describe("AdminProductRenewalService", () => {
  const makeService = () => {
    const renewal = {
      reactivateByAdmin: jest.fn().mockResolvedValue(undefined),
    };
    const audit = { createAuditLog: jest.fn().mockResolvedValue({}) };
    const service = new AdminProductRenewalService(
      renewal as any,
      audit as any,
    );
    return { service, renewal, audit };
  };

  it("renew: alan servisine delege eder, denetim yazar ve active döner", async () => {
    const { service, renewal, audit } = makeService();

    await expect(service.renew("admin-1", "p1")).resolves.toEqual({
      id: "p1",
      status: "active",
    });
    expect(renewal.reactivateByAdmin).toHaveBeenCalledWith("p1");
    expect(audit.createAuditLog).toHaveBeenCalledWith(
      "admin-1",
      ADMIN_RENEW_AUDIT_ACTION,
      "Product",
      "p1",
      expect.objectContaining({ inactiveReason: "expired" }),
      expect.objectContaining({ status: "active" }),
    );
  });

  it("renew: süresi dolmamış ilan reddi aynen yayılır, denetim yazılmaz", async () => {
    const { service, renewal, audit } = makeService();
    const rejection = new BadRequestException(
      i18nMessage("server.product.renewNotExpired"),
    );
    renewal.reactivateByAdmin.mockRejectedValue(rejection);

    await expect(service.renew("admin-1", "p1")).rejects.toBe(rejection);
    expect(audit.createAuditLog).not.toHaveBeenCalled();
  });

  it("renewMany: kısmi başarısızlıkta her ilan kendi sonucuyla döner", async () => {
    const { service, renewal, audit } = makeService();
    renewal.reactivateByAdmin
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(
        new BadRequestException(i18nMessage("server.product.renewNotExpired")),
      )
      .mockRejectedValueOnce(new Error("boom"));

    const out = await service.renewMany("admin-1", ["a", "b", "c", "a"]);

    expect(out.renewed).toBe(1);
    expect(out.failed).toBe(2);
    expect(out.results[0]).toEqual({ id: "a", ok: true });
    expect(out.results[1]).toMatchObject({
      id: "b",
      ok: false,
      errorKey: "server.product.renewNotExpired",
    });
    expect(out.results[2]).toMatchObject({
      id: "c",
      ok: false,
      errorKey: "server.product.renewFailed",
    });
    // Tekrarlı id bir kez işlenir; yalnız başarılı olan için denetim düşer.
    expect(renewal.reactivateByAdmin).toHaveBeenCalledTimes(3);
    expect(audit.createAuditLog).toHaveBeenCalledTimes(1);
  });
});
