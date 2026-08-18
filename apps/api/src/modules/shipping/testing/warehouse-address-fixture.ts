import type { WarehouseAddressService } from "../warehouse/warehouse-address.service";

/**
 * Depo adresi stub'ı — TEK kaynak. Kargo açan servislerin çoğu depo adresini
 * yalnız "satıcı/alıcı adresi yok" dalında kullanır, dolayısıyla onlarca spec
 * bunu sadece constructor'ı doldurmak için taşır. Şekli burada durur ki
 * `ResolvedWarehouseAddress` değiştiğinde tek dosya güncellenir.
 */

/** Gerçekçi bir depo satırı; `id` verilmezse env-fallback (id: null) taklit edilir. */
export function warehouseAddressStub(
  overrides: Partial<{
    id: string | null;
    fullName: string;
    address: string;
    city: string;
    district: string;
    phone: string;
  }> = {},
): Pick<WarehouseAddressService, "resolve" | "resolveId"> {
  const resolved = {
    id: null,
    fullName: "Tarodan Depo",
    address: "Depo Mah. Sevk Cad. No:1",
    city: "İstanbul",
    district: "Maltepe",
    phone: "05000000000",
    ...overrides,
  };
  return {
    resolve: jest.fn().mockResolvedValue(resolved),
    resolveId: jest
      .fn()
      .mockResolvedValue(resolved.id ?? "warehouse-address-id"),
  } as unknown as Pick<WarehouseAddressService, "resolve" | "resolveId">;
}
