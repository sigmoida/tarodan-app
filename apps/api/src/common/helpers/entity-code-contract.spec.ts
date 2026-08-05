import { readFileSync } from "fs";
import { join } from "path";
import { ENTITY_PREFIX } from "./code-prefixes";

/**
 * Varlık kodları (B/K/U) Postgres tarafında DEFAULT ile üretilir. Şema ile
 * migration'ın birbirinden kopmasını engelleyen kontrat testi: kod tabanında
 * bu üretimin tek bir doğru yeri olsun.
 */
describe("entity code contract", () => {
  const schema = readFileSync(
    join(__dirname, "../../../prisma/schema.prisma"),
    "utf8",
  );
  const migration = readFileSync(
    join(
      __dirname,
      "../../../prisma/migrations/20260731140000_entity_codes_product_and_user/migration.sql",
    ),
    "utf8",
  );

  it("ürün kodunu DB varsayılanı üretir (uygulama yazmaz)", () => {
    expect(schema).toMatch(
      /productCode\s+String\s+@unique\s+@default\(dbgenerated\("generate_product_code\(\)"\)\)\s+@map\("product_code"\)/,
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION generate_product_code()",
    );
  });

  it("ürün ve üye sayaçları 10000'den başlar (kayıt sayısını sızdırmamak için)", () => {
    expect(migration).toContain("product_code_seq START WITH 10000");
    expect(migration).toMatch(/setval\('user_admin_code_seq'[\s\S]*10000/);
  });

  it("ürün kodu 'U', kullanıcı kodları 'B'/'K' önekini taşır", () => {
    expect(migration).toContain(
      "SELECT 'U' || lpad(nextval('product_code_seq')",
    );
    expect(ENTITY_PREFIX.product).toBe("U");
    expect(ENTITY_PREFIX.individualUser).toBe("B");
    expect(ENTITY_PREFIX.corporateUser).toBe("K");
  });

  it("bireysel satıcı öneki (S) kaldırıldı ve mevcut kayıtlar B'ye taşındı", () => {
    expect(migration).toContain("WHERE \"admin_code\" LIKE 'S%'");
    // Hesap tipi yalnızca bireysel/kurumsal: üçüncü bir önek tanımlı olmamalı.
    expect(Object.values(ENTITY_PREFIX)).toEqual(["B", "K", "U"]);
  });
});
