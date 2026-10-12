import { BadRequestException } from "@nestjs/common";
import type { NetsisHttpClient } from "../http/netsis-http.client";
import {
  assertNetsisReadOnlySelect,
  bindNetsisQueryParams,
  NetsisQueriesClient,
} from "./netsis-queries.client";

describe("assertNetsisReadOnlySelect", () => {
  it.each([
    "SELECT CARI_KOD, CARI_ISIM FROM TBLCASABIT WHERE CARI_KOD = 'U10001'",
    "  select top 10 * from TBLFATUIRS  ",
    "WITH t AS (SELECT 1 AS x) SELECT x FROM t",
    "SELECT UPDATED_AT, CREATED_BY, DELETED FROM X",
  ])("accepts %p", (sql) => {
    expect(assertNetsisReadOnlySelect(sql)).toBe(sql.trim());
  });

  it.each([
    "UPDATE TBLCASABIT SET CARI_ISIM = 'x'",
    "DELETE FROM TBLFATUIRS",
    "INSERT INTO X VALUES (1)",
    "SELECT * INTO BACKUP_TBL FROM TBLCASABIT",
    "SELECT 1; DROP TABLE TBLCASABIT",
    "SELECT 1 -- comment",
    "SELECT /* c */ 1",
    "EXEC sp_who",
    "SELECT 1 WAITFOR DELAY '00:00:10'",
    "with x as (select 1) delete from y",
    "SELECTX FROM Y",
    "",
  ])("rejects %p with a localized 400", (sql) => {
    let error: unknown;
    try {
      assertNetsisReadOnlySelect(sql);
    } catch (e: unknown) {
      error = e;
    }
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual({
      i18nKey: "server.netsis.queryNotReadOnly",
    });
  });
});

describe("bindNetsisQueryParams", () => {
  const invalidParam = (sql: string, params?: Record<string, string>) => {
    let error: unknown;
    try {
      bindNetsisQueryParams(sql, params);
    } catch (e: unknown) {
      error = e;
    }
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).getResponse();
  };

  it("binds each @name as an N'…' literal with quotes doubled", () => {
    expect(
      bindNetsisQueryParams(
        "SELECT X FROM T WHERE A = @a AND B = @b_2 AND C = @a",
        { a: "ab'c", b_2: "ç" },
      ),
    ).toBe("SELECT X FROM T WHERE A = N'ab''c' AND B = N'ç' AND C = N'ab''c'");
  });

  it("leaves a statement without placeholders as is", () => {
    expect(bindNetsisQueryParams("SELECT 1")).toBe("SELECT 1");
  });

  it("does not treat @@system variables as placeholders", () => {
    expect(bindNetsisQueryParams("SELECT @@ROWCOUNT AS n")).toBe(
      "SELECT @@ROWCOUNT AS n",
    );
  });

  it("keeps SQL-looking values inside the literal", () => {
    expect(
      bindNetsisQueryParams("SELECT X FROM T WHERE A = @a", {
        a: "1'; DROP TABLE T --",
      }),
    ).toBe("SELECT X FROM T WHERE A = N'1''; DROP TABLE T --'");
  });

  const rejected: [string, string, Record<string, string>, string][] = [
    ["a missing value", "SELECT X FROM T WHERE A = @a", {}, "a"],
    ["an unused value", "SELECT 1", { extra: "x" }, "extra"],
    ["a control character", "SELECT X WHERE A = @a", { a: "x\u0000y" }, "a"],
  ];

  it.each(rejected)("rejects %s with a localized 400", (_label, sql, params, name) => {
    expect(invalidParam(sql, params)).toEqual({
      i18nKey: "server.netsis.queryParamInvalid",
      i18nParams: { name },
    });
  });
});

describe("NetsisQueriesClient", () => {
  const http = { post: jest.fn() };
  const client = new NetsisQueriesClient(http as unknown as NetsisHttpClient);

  beforeEach(() => jest.resetAllMocks());

  it("posts the guarded statement to Queries", async () => {
    http.post.mockResolvedValue([{ CARI_KOD: "U10001" }]);

    await expect(
      client.select(" SELECT CARI_KOD FROM TBLCASABIT "),
    ).resolves.toEqual([{ CARI_KOD: "U10001" }]);
    expect(http.post).toHaveBeenCalledWith("Queries", {
      Query: "SELECT CARI_KOD FROM TBLCASABIT",
    });
  });

  it("guards the fixed statement first, then binds the parameters", async () => {
    http.post.mockResolvedValue([]);

    await client.select("SELECT FATIRS_NO FROM TBLFATUIRS WHERE EKACK1 = @k", {
      k: "delete me",
    });
    expect(http.post).toHaveBeenCalledWith("Queries", {
      Query: "SELECT FATIRS_NO FROM TBLFATUIRS WHERE EKACK1 = N'delete me'",
    });
  });

  it("never reaches Netsis with an unbound placeholder", async () => {
    await expect(
      client.select("SELECT X FROM T WHERE A = @a"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(http.post).not.toHaveBeenCalled();
  });

  it("never reaches Netsis with a writing statement", async () => {
    await expect(
      client.select("DELETE FROM TBLCASABIT"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(http.post).not.toHaveBeenCalled();
  });
});
