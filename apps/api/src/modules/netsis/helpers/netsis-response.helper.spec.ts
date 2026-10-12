import { NetsisRequestException } from "../http/netsis-error";
import {
  asNetsisRecord,
  asNetsisRecordList,
  isNetsisNotFound,
  netsisPathSegment,
  nullIfNetsisNotFound,
  readNetsisScalar,
  writtenNetsisRecord,
} from "./netsis-response.helper";

describe("netsis-response.helper", () => {
  it("narrows records and lists, failing loudly on other shapes", () => {
    expect(asNetsisRecord({ a: 1 })).toEqual({ a: 1 });
    expect(() => asNetsisRecord([1])).toThrow(NetsisRequestException);
    expect(() => asNetsisRecord("x")).toThrow(NetsisRequestException);

    expect(asNetsisRecordList([{ a: 1 }])).toEqual([{ a: 1 }]);
    expect(asNetsisRecordList(null)).toEqual([]);
    expect(asNetsisRecordList("")).toEqual([]);
    expect(() => asNetsisRecordList([1, 2])).toThrow(NetsisRequestException);
    expect(() => asNetsisRecordList({ Data: [] })).toThrow(
      NetsisRequestException,
    );
  });

  it("returns the sent model when a write answers with an empty body", () => {
    const sent = { CARI_KOD: "U1" };
    expect(writtenNetsisRecord(null, sent)).toBe(sent);
    expect(writtenNetsisRecord({ CARI_KOD: "U1", ID: 3 }, sent)).toEqual({
      CARI_KOD: "U1",
      ID: 3,
    });
  });

  it("reads a scalar from plain values or known fields", () => {
    expect(readNetsisScalar(" TRD1 ", ["X"])).toBe("TRD1");
    expect(readNetsisScalar(42, ["X"])).toBe("42");
    expect(readNetsisScalar({ B: "v" }, ["A", "B"])).toBe("v");
    expect(readNetsisScalar({ A: 7 }, ["A"])).toBe("7");
    expect(() => readNetsisScalar({ C: "v" }, ["A", "B"])).toThrow(
      NetsisRequestException,
    );
    expect(() => readNetsisScalar("  ", ["A"])).toThrow(NetsisRequestException);
  });

  it("recognises not-found by status or message", () => {
    expect(
      isNetsisNotFound(new NetsisRequestException("configuration", 404, "")),
    ).toBe(true);
    expect(
      isNetsisNotFound(
        new NetsisRequestException("validation", 200, "Kayıt bulunamadı"),
      ),
    ).toBe(true);
    expect(
      isNetsisNotFound(new NetsisRequestException("validation", 400, "bad")),
    ).toBe(false);
    expect(isNetsisNotFound(new Error("bulunamadı"))).toBe(false);
  });

  it("maps a missing record to null and lets other errors through", async () => {
    await expect(
      nullIfNetsisNotFound(
        Promise.reject(new NetsisRequestException("configuration", 404, "")),
      ),
    ).resolves.toBeNull();
    await expect(nullIfNetsisNotFound(Promise.resolve(""))).resolves.toBeNull();
    await expect(
      nullIfNetsisNotFound(Promise.resolve({ a: 1 })),
    ).resolves.toEqual({ a: 1 });
    await expect(
      nullIfNetsisNotFound(
        Promise.reject(new NetsisRequestException("network", null, "")),
      ),
    ).rejects.toMatchObject({ kind: "network" });
  });

  it("encodes path segments", () => {
    expect(netsisPathSegment("120.01/Ş 1")).toBe("120.01%2F%C5%9E%201");
  });
});
