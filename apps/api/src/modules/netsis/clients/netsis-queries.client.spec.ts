import { BadRequestException } from "@nestjs/common";
import type { NetsisHttpClient } from "../http/netsis-http.client";
import {
  assertNetsisReadOnlySelect,
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

  it("never reaches Netsis with a writing statement", async () => {
    await expect(
      client.select("DELETE FROM TBLCASABIT"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(http.post).not.toHaveBeenCalled();
  });
});
