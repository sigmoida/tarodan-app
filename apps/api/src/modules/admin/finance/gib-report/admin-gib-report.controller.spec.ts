import "reflect-metadata";
import { ROLES_KEY } from "../../../auth/decorators/roles.decorator";
import { PERMISSION_MAP } from "../../../auth/guards/roles.guard";
import { DEFAULT_ROLE_PERMISSIONS } from "../../dto/role-permissions.dto";
import { AdminGibReportController } from "./admin-gib-report.controller";
import { GIB_REPORT_EXPORT_ROW_CAP } from "./admin-gib-report.service";

function setup(over: { rowCount?: number; truncated?: boolean } = {}) {
  const file = {
    filename: "gib-ilan-satici-raporu-2026-10-05.xlsx",
    body: Buffer.from("xlsx"),
    rowCount: over.rowCount ?? 42,
    truncated: over.truncated ?? false,
  };
  const service = {
    exportXlsx: jest.fn().mockResolvedValue(file),
    list: jest.fn(),
  };
  const audit = {
    createRequiredAuditLog: jest.fn().mockResolvedValue(undefined),
  };
  const res = { setHeader: jest.fn(), send: jest.fn() };
  const controller = new AdminGibReportController(
    service as never,
    audit as never,
  );
  return { controller, service, audit, res, file };
}

describe("AdminGibReportController — erişim", () => {
  it.each(["list", "export"] as const)(
    "%s moderator'e kapalıdır; yalnız super_admin ve admin rolü",
    (method) => {
      const roles = Reflect.getMetadata(
        ROLES_KEY,
        AdminGibReportController.prototype[method],
      );
      expect(roles).toEqual(["super_admin", "admin"]);
    },
  );

  it("izin segmenti `tax` iznine bağlıdır (varsayılan yalnız super_admin)", () => {
    expect(PERMISSION_MAP["gib-report"]).toEqual(["tax"]);
    expect(DEFAULT_ROLE_PERMISSIONS.admin).not.toContain("tax");
    expect(DEFAULT_ROLE_PERMISSIONS.moderator).not.toContain("tax");
  });
});

describe("AdminGibReportController.export", () => {
  it("her indirmede zorunlu denetim kaydı yazar: filtre + satır sayısı, kimlik DEĞERİ yok", async () => {
    const { controller, audit, res } = setup();

    await controller.export(
      "admin-1",
      {
        search: "ahmet",
        status: "active",
        sellerKind: "individual",
        identityIncomplete: true,
        startDate: "2026-01-01",
      },
      "tr",
      res as never,
    );

    expect(audit.createRequiredAuditLog).toHaveBeenCalledWith(
      "admin-1",
      "gib_report_export",
      "GibReport",
      "export",
      null,
      {
        filters: {
          searchApplied: true,
          searchLength: 5,
          status: "active",
          sellerKind: "individual",
          identityIncomplete: true,
          startDate: "2026-01-01",
          endDate: null,
        },
        rowCount: 42,
        truncated: false,
      },
    );
  });

  it("arama terimi (vergi no / TCKN olabilir) denetim kaydına yazılmaz", async () => {
    const { controller, audit, res } = setup();
    await controller.export(
      "admin-1",
      { search: "12345678901" },
      "tr",
      res as never,
    );
    const payload = audit.createRequiredAuditLog.mock.calls[0][5];
    expect(JSON.stringify(payload)).not.toContain("12345678901");
    expect(payload.filters).toMatchObject({
      searchApplied: true,
      searchLength: 11,
    });
  });

  it("denetim kaydı yazılamazsa dosya GÖNDERİLMEZ (fail-closed)", async () => {
    const { controller, audit, res } = setup();
    audit.createRequiredAuditLog.mockRejectedValue(new Error("audit down"));

    await expect(
      controller.export("admin-1", {}, "tr", res as never),
    ).rejects.toThrow("audit down");
    expect(res.send).not.toHaveBeenCalled();
  });

  it("dosyayı önbelleğe alınmayan ek olarak gönderir", async () => {
    const { controller, res, file } = setup();
    await controller.export("admin-1", {}, "tr", res as never);

    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      `attachment; filename="${file.filename}"`,
    );
    expect(res.send).toHaveBeenCalledWith(file.body);
    expect(res.setHeader).not.toHaveBeenCalledWith(
      "X-Export-Truncated-At",
      expect.anything(),
    );
  });

  it("tavan aşıldıysa kırpılma başlığını ve denetim kaydında truncated'ı yazar", async () => {
    const { controller, audit, res } = setup({ truncated: true });
    await controller.export("admin-1", {}, "tr", res as never);

    expect(res.setHeader).toHaveBeenCalledWith(
      "X-Export-Truncated-At",
      String(GIB_REPORT_EXPORT_ROW_CAP),
    );
    expect(audit.createRequiredAuditLog.mock.calls[0][5]).toMatchObject({
      truncated: true,
    });
  });
});
