import "reflect-metadata";
import { StreamableFile } from "@nestjs/common";
import { ROLES_KEY } from "../../../auth/decorators/roles.decorator";
import { PERMISSION_MAP } from "../../../auth/guards/roles.guard";
import { DEFAULT_ROLE_PERMISSIONS } from "../../dto/role-permissions.dto";
import { AdminGibReportController } from "./admin-gib-report.controller";

function setup(over: { truncatedAt?: number | null } = {}) {
  const file = {
    filename: "gib-ilan-satici-raporu-2026-10-05.xlsx",
    body: Buffer.from("xlsx"),
    rowCount: 42,
    truncatedAt: over.truncatedAt ?? null,
  };
  const service = {
    export: jest.fn().mockResolvedValue(file),
    list: jest.fn(),
  };
  const headers = new Map<string, string>();
  const res = {
    setHeader: jest.fn((name: string, value: string) => {
      headers.set(name, value);
    }),
  };
  const controller = new AdminGibReportController(service as never);
  return { controller, service, res, headers, file };
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
  it("dökümü çağıranın kimliği ve isteğin diliyle üretir", async () => {
    const { controller, service, res } = setup();
    const query = { search: "ahmet", status: "active" as const };

    await controller.export("admin-1", query, "tr", res as never);

    expect(service.export).toHaveBeenCalledWith(query, "admin-1", "tr");
  });

  it("dosyayı ortak yanıtla, önbelleğe alınmayan ek olarak döner", async () => {
    const { controller, res, headers, file } = setup();

    const result = await controller.export("admin-1", {}, "tr", res as never);

    expect(result).toBeInstanceOf(StreamableFile);
    expect(headers.get("Cache-Control")).toBe("no-store");
    expect(headers.get("Content-Disposition")).toBe(
      `attachment; filename="${file.filename}"`,
    );
    expect(headers.get("X-Export-Row-Count")).toBe("42");
    expect(headers.has("X-Export-Truncated-At")).toBe(false);
  });

  it("tavan aşıldıysa kırpılma başlığını yazar", async () => {
    const { controller, res, headers } = setup({ truncatedAt: 20000 });
    await controller.export("admin-1", {}, "tr", res as never);
    expect(headers.get("X-Export-Truncated-At")).toBe("20000");
  });

  it("döküm (ve denetimi) başarısızsa dosya dönmez", async () => {
    const { controller, service, res } = setup();
    service.export.mockRejectedValue(new Error("audit down"));

    await expect(
      controller.export("admin-1", {}, "tr", res as never),
    ).rejects.toThrow("audit down");
    expect(res.setHeader).not.toHaveBeenCalled();
  });
});
