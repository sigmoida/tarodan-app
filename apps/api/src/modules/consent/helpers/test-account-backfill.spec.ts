import {
  applyRefusal,
  describeDatabaseTarget,
  parseBackfillMode,
  parseDatabaseTarget,
} from "./test-account-backfill";

describe("parseBackfillMode", () => {
  it("varsayılan dry-run: bayraksız koşu yazmaz", () => {
    expect(parseBackfillMode([])).toEqual({ kind: "dry-run" });
    expect(parseBackfillMode(["--dry-run"])).toEqual({ kind: "dry-run" });
  });

  it("yazmak için --apply ve --db=<ad> birlikte gerekir", () => {
    expect(parseBackfillMode(["--apply", "--db=tarodan"])).toEqual({
      kind: "apply",
      database: "tarodan",
    });
    expect(() => parseBackfillMode(["--apply"])).toThrow(/requires --db/);
    expect(() => parseBackfillMode(["--apply", "--db="])).toThrow(
      /requires --db/,
    );
  });

  it("--db tek başına anlamsızdır (yanlışlıkla yazma yolu açmaz)", () => {
    expect(() => parseBackfillMode(["--db=tarodan"])).toThrow(
      /only applies together with --apply/,
    );
  });

  it("eski --confirm bayrağı açıklayıcı hatayla reddedilir", () => {
    expect(() => parseBackfillMode(["--confirm"])).toThrow(
      /no longer accepted; use --apply --db=<database name>/,
    );
  });

  it("--apply ile --dry-run birlikte belirsizdir → hata", () => {
    expect(() => parseBackfillMode(["--apply", "--db=x", "--dry-run"])).toThrow(
      /mutually exclusive/,
    );
  });
});

describe("parseDatabaseTarget / describeDatabaseTarget", () => {
  it("host:port/veritabanı döner, kimlik bilgisini YAZMAZ", () => {
    const url =
      "postgresql://app_user:s3cr3t@db.internal:5432/tarodan_prod?schema=public";
    expect(parseDatabaseTarget(url)).toEqual({
      host: "db.internal",
      port: "5432",
      database: "tarodan_prod",
    });
    const text = describeDatabaseTarget(url);
    expect(text).toBe("db.internal:5432/tarodan_prod");
    expect(text).not.toContain("s3cr3t");
    expect(text).not.toContain("app_user");
  });

  it("portsuz adres", () => {
    expect(describeDatabaseTarget("postgresql://u:p@localhost/db1")).toBe(
      "localhost/db1",
    );
  });

  it("yok ya da okunamayan adres → unknown", () => {
    expect(describeDatabaseTarget(undefined)).toBe("unknown");
    expect(describeDatabaseTarget("not a url")).toBe("unknown");
  });

  it("boş host'lu (Unix socket) adres hedef sayılmaz", () => {
    const socket = "postgresql://u:p@/tarodan?host=/var/run/postgresql";
    expect(parseDatabaseTarget(socket)).toBeNull();
    expect(describeDatabaseTarget(socket)).toBe("unknown");
  });

  it("veritabanı adı olmayan adres hedef sayılmaz", () => {
    expect(
      parseDatabaseTarget("postgresql://u:p@db.internal:5432/"),
    ).toBeNull();
  });
});

describe("applyRefusal", () => {
  const target = { host: "db.internal", port: "5432", database: "tarodan" };

  it("dry-run her zaman serbest", () => {
    expect(applyRefusal({ kind: "dry-run" }, null)).toBeNull();
  });

  it("ad hedefle birebir eşleşince yazmaya izin verir", () => {
    expect(
      applyRefusal({ kind: "apply", database: "tarodan" }, target),
    ).toBeNull();
  });

  it("farklı ad (yanlış ortam) reddedilir", () => {
    expect(
      applyRefusal({ kind: "apply", database: "tarodan_staging" }, target),
    ).toMatch(/does not match/);
  });

  it("büyük/küçük harf farkı da eşleşme sayılmaz", () => {
    expect(
      applyRefusal({ kind: "apply", database: "Tarodan" }, target),
    ).toMatch(/does not match/);
  });

  it("hedef doğrulanamıyorsa (socket/boş host) yazma YOK", () => {
    expect(applyRefusal({ kind: "apply", database: "tarodan" }, null)).toMatch(
      /could not be determined/,
    );
  });
});
