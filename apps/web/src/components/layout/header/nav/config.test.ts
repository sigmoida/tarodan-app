import { describe, expect, it } from "vitest";
import {
  groupManufacturers,
  NAV_MANUFACTURER_LIMIT,
  type ManufacturerRef,
} from "./config";

const mfr = (name: string, products?: number): ManufacturerRef => ({
  id: name.toLowerCase(),
  name,
  ...(products == null ? {} : { _count: { products } }),
});

/** Gruplardaki isimleri düz bir listeye indirger. */
const names = (groups: ReturnType<typeof groupManufacturers>) =>
  groups.flatMap((g) => g.items.map((i) => i.name));

describe("groupManufacturers", () => {
  it("ilanı olmayan üreticileri menüden düşürür", () => {
    const groups = groupManufacturers([
      mfr("Autoart", 12),
      mfr("Bburago", 0),
      mfr("Norev", 3),
    ]);

    expect(names(groups)).toEqual(["Autoart", "Norev"]);
  });

  it("sayaç hiç gelmemişse süzmez — menü sessizce boşalmaz", () => {
    const groups = groupManufacturers([mfr("Autoart"), mfr("Bburago")]);

    expect(names(groups)).toEqual(["Autoart", "Bburago"]);
  });

  it("sayaçlar gelmiş ve hepsi sıfırsa liste boştur", () => {
    expect(groupManufacturers([mfr("Autoart", 0), mfr("Norev", 0)])).toEqual(
      [],
    );
  });

  it("en çok ilanı olanları alır, ama grupların içi alfabetiktir", () => {
    // Sıralama ilan sayısına göre: Zenith > Bburago > Autoart; ikisi seçilir.
    const groups = groupManufacturers(
      [mfr("Autoart", 1), mfr("Bburago", 5), mfr("Zenith", 9)],
      2,
    );

    // A-E grubunda yalnız Bburago, T-Z grubunda Zenith kalır (Autoart elenir).
    expect(groups.map((g) => g.range)).toEqual(["A-E", "T-Z"]);
    expect(names(groups)).toEqual(["Bburago", "Zenith"]);
  });

  it("listeyi varsayılan sınırın üstüne taşırmaz", () => {
    const many = Array.from({ length: NAV_MANUFACTURER_LIMIT + 25 }, (_, i) =>
      mfr(`Marka ${String(i).padStart(3, "0")}`, i + 1),
    );

    expect(names(groupManufacturers(many))).toHaveLength(
      NAV_MANUFACTURER_LIMIT,
    );
  });

  it("eşit ilan sayısında ada göre sıralar", () => {
    const groups = groupManufacturers(
      [mfr("Norev", 4), mfr("Ebbro", 4), mfr("Kyosho", 4)],
      2,
    );

    expect(names(groups)).toEqual(["Ebbro", "Kyosho"]);
  });
});
