import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  AdminOrderCountsQueryDto,
  AdminOrderQueryDto,
} from "./admin-query.dto";

async function errorsOf<T extends object>(
  cls: new () => T,
  plain: Record<string, unknown>,
): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, plain));
  return errors.map((error) => error.property);
}

describe("AdminOrderQueryDto", () => {
  it("accepts the tab, bucket and every column filter", async () => {
    await expect(
      errorsOf(AdminOrderQueryDto, {
        tab: "offer_order",
        bucket: "delivered",
        party: "K010001",
        orderNumber: "ORD-1",
        packageNumber: "PKG-1",
        groupNumber: "GRP-1",
        productQuery: "MC-1",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        page: "2",
        limit: "100",
      }),
    ).resolves.toEqual([]);
  });

  it("accepts the all (Tümü) bucket on every tab", async () => {
    for (const tab of ["all", "direct_sale", "offer_order"]) {
      await expect(
        errorsOf(AdminOrderQueryDto, { tab, bucket: "all" }),
      ).resolves.toEqual([]);
    }
  });

  it("rejects an unknown tab or bucket", async () => {
    await expect(
      errorsOf(AdminOrderQueryDto, { tab: "trades", bucket: "lost" }),
    ).resolves.toEqual(expect.arrayContaining(["tab", "bucket"]));
  });

  it("rejects the screen-only tabs and the removed offer buckets", async () => {
    // Teklifler / Takaslar panel sekmeleri kendi uçlarını okur; eski teklif
    // kovaları (Bekleyen / Süresi Dolan) Teklifler sekmesinin durum filtresidir.
    for (const tab of ["offer", "offers"]) {
      await expect(errorsOf(AdminOrderQueryDto, { tab })).resolves.toEqual([
        "tab",
      ]);
    }
    for (const bucket of ["pending", "expired"]) {
      await expect(errorsOf(AdminOrderQueryDto, { bucket })).resolves.toEqual([
        "bucket",
      ]);
    }
  });

  it("keeps accepting the legacy origin, status and date names", async () => {
    await expect(
      errorsOf(AdminOrderQueryDto, {
        origin: "direct_sale",
        status: "delivered",
        fromDate: "2026-09-01",
        toDate: "2026-09-02",
        userId: "u1",
        userRole: "seller",
      }),
    ).resolves.toEqual([]);
  });

  it("rejects a status that is not an order status", async () => {
    await expect(
      errorsOf(AdminOrderQueryDto, { status: "DELIVERED" }),
    ).resolves.toEqual(["status"]);
  });
});

describe("AdminOrderCountsQueryDto", () => {
  it("has the filters but not the tab (counts cover every tab)", async () => {
    const dto = plainToInstance(AdminOrderCountsQueryDto, {
      party: "ali",
      tab: "offer_order",
    });
    await expect(validate(dto)).resolves.toEqual([]);
    expect("tab" in new AdminOrderCountsQueryDto()).toBe(false);
  });
});
