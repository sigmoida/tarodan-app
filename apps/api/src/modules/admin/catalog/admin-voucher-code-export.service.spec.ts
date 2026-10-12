import "reflect-metadata";
import * as ExcelJS from "exceljs";
import { NotFoundException } from "@nestjs/common";
import { ROLES_KEY } from "../../auth/decorators/roles.decorator";
import { ExportListService } from "../../../common/export";
import { AdminProductController } from "./admin-product.controller";
import {
  AdminVoucherCodeExportService,
  voucherCodeExportRecord,
} from "./admin-voucher-code-export.service";

const code = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  code: "YILBASI-A7K2M9PQRS",
  isRedeemed: true,
  redeemedById: "u1",
  redeemedAt: new Date("2026-10-01T21:30:00.000Z"),
  orderId: "o1",
  createdAt: new Date("2026-09-01T09:00:00.000Z"),
  ...over,
});

function setup(codes = [code(), code({ id: "c2", isRedeemed: false, redeemedAt: null, orderId: null })]) {
  const discounts = {
    findOne: jest
      .fn()
      .mockResolvedValue({ id: "d1", name: "Yılbaşı", code: "YILBASI" }),
    listCodesPage: jest.fn(async (_id: string, page: { skip: number; take: number }) =>
      codes.slice(page.skip, page.skip + page.take),
    ),
  };
  const prisma = {
    order: {
      findMany: jest.fn().mockResolvedValue([{ id: "o1", orderNumber: "ORD-1" }]),
    },
  };
  const audit = {
    createRequiredAuditLog: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AdminVoucherCodeExportService(
    prisma as never,
    discounts as never,
    new ExportListService(audit as never),
  );
  return { service, discounts, prisma, audit };
}

describe("AdminVoucherCodeExportService", () => {
  it("şablon yoksa domain servisinin 404'ünü geçirir, dosya üretmez", async () => {
    const { service, discounts, audit } = setup();
    discounts.findOne.mockRejectedValue(new NotFoundException());

    await expect(service.exportCodes("yok", "admin-1", "tr")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(audit.createRequiredAuditLog).not.toHaveBeenCalled();
  });

  it("kodları sayfa sayfa okur ve sipariş NUMARASIYLA yazar", async () => {
    const { service, discounts } = setup();

    const file = await service.exportCodes("d1", "admin-1", "tr");

    expect(discounts.listCodesPage).toHaveBeenCalledWith(
      "d1",
      expect.objectContaining({ skip: 0, take: 500 }),
    );
    expect(file.rowCount).toBe(2);
    expect(file.filename).toMatch(/^voucher-kodlari-\d{4}-\d{2}-\d{2}\.xlsx$/);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.body as never);
    const row = workbook.worksheets[1].getRow(2);
    expect(row.getCell(1).value).toBe("YILBASI-A7K2M9PQRS");
    expect(row.getCell(2).value).toBe("Evet");
    // 21:30Z = ertesi gün 00:30 İstanbul.
    expect(row.getCell(3).value).toEqual(new Date("2026-10-02T00:30:00.000Z"));
    expect(row.getCell(4).value).toBe("ORD-1");
  });

  it("her indirme şablon anahtarıyla denetim kaydı bırakır", async () => {
    const { service, audit } = setup();

    await service.exportCodes("d1", "admin-1", "tr");

    expect(audit.createRequiredAuditLog.mock.calls[0].slice(0, 4)).toEqual([
      "admin-1",
      "voucher_codes_export",
      "Discount",
      "d1",
    ]);
  });
});

describe("voucherCodeExportRecord", () => {
  it("kullanılmamış kodda kullanım alanları boştur", () => {
    expect(
      voucherCodeExportRecord({
        ...code({ isRedeemed: false, redeemedAt: null, orderId: null }),
        orderNumber: null,
      }),
    ).toMatchObject({ isRedeemed: false, redeemedAt: null, orderNumber: null });
  });
});

describe("GET /admin/discounts/:id/codes/export — erişim", () => {
  it("kod üretimiyle aynı rollere açıktır (moderator değil)", () => {
    const roles = (name: "exportVoucherCodes" | "generateVoucherCodes") =>
      Reflect.getMetadata(ROLES_KEY, AdminProductController.prototype[name]);
    expect(roles("exportVoucherCodes")).toEqual(["super_admin", "admin"]);
    expect(roles("exportVoucherCodes")).toEqual(roles("generateVoucherCodes"));
  });
});
