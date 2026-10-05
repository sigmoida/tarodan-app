import { ACCOUNT_REQUIRED_CONSENTS, CONSENT_DOCUMENTS } from "@tarodan/types";
import {
  computePendingConsents,
  latestByDocument,
  type ConsentHistoryRow,
} from "./pending-consents";

const at = (iso: string) => new Date(iso);

const granted = (
  document: string,
  version: string,
  createdAt = "2026-09-01T10:00:00Z",
): ConsentHistoryRow => ({
  document,
  version,
  action: "granted",
  createdAt: at(createdAt),
});

/** Zorunlu belgelerin hepsini YÜRÜRLÜKTEKİ sürümle onaylamış üye. */
const upToDate = () =>
  ACCOUNT_REQUIRED_CONSENTS.map((doc) =>
    granted(doc, CONSENT_DOCUMENTS[doc].version),
  );

describe("computePendingConsents", () => {
  it("zorunlu belgeler terms + privacy + kvkk'dır (KVKK ayrı onay)", () => {
    expect([...ACCOUNT_REQUIRED_CONSENTS].sort()).toEqual(
      ["kvkk", "privacy", "terms"].sort(),
    );
  });

  it("hiç kaydı olmayan (eski) üyede zorunlu belgelerin hepsi 'missing' bekler", () => {
    const pending = computePendingConsents([]);

    expect(pending.map((p) => p.document).sort()).toEqual(
      [...ACCOUNT_REQUIRED_CONSENTS].sort(),
    );
    expect(pending.every((p) => p.reason === "missing")).toBe(true);
    for (const p of pending) {
      expect(p.version).toBe(CONSENT_DOCUMENTS[p.document].version);
    }
  });

  it("hepsini yürürlükteki sürümle onaylamış üye için kapı açıktır", () => {
    expect(computePendingConsents(upToDate())).toEqual([]);
  });

  it("belge sürümü değişince yalnız o belge 'outdated' olarak yeniden istenir", () => {
    const rows = upToDate().map((row) =>
      row.document === "terms" ? { ...row, version: "2020-01-01" } : row,
    );

    expect(computePendingConsents(rows)).toEqual([
      {
        document: "terms",
        version: CONSENT_DOCUMENTS.terms.version,
        path: CONSENT_DOCUMENTS.terms.path,
        reason: "outdated",
      },
    ]);
  });

  it("eski sürümden SONRA yeni sürüm onaylandıysa en son satır kazanır", () => {
    const rows = [
      ...upToDate().filter((row) => row.document !== "kvkk"),
      granted("kvkk", "2020-01-01", "2026-01-01T00:00:00Z"),
      granted("kvkk", CONSENT_DOCUMENTS.kvkk.version, "2026-09-10T00:00:00Z"),
    ];

    expect(computePendingConsents(rows)).toEqual([]);
  });

  it("veritabanı sırası ters gelse de en son satır createdAt'ten seçilir", () => {
    const rows = [
      ...upToDate().filter((row) => row.document !== "kvkk"),
      granted("kvkk", CONSENT_DOCUMENTS.kvkk.version, "2026-09-10T00:00:00Z"),
      granted("kvkk", "2020-01-01", "2026-01-01T00:00:00Z"),
    ];

    expect(computePendingConsents(rows)).toEqual([]);
  });

  it("geri çekilen zorunlu onay yeniden 'missing' bekler", () => {
    const rows = [
      ...upToDate(),
      {
        document: "privacy",
        version: CONSENT_DOCUMENTS.privacy.version,
        action: "withdrawn" as const,
        createdAt: at("2026-09-20T00:00:00Z"),
      },
    ];

    expect(computePendingConsents(rows)).toEqual([
      expect.objectContaining({ document: "privacy", reason: "missing" }),
    ]);
  });

  it("zorunlu olmayan belgeler (pazarlama, çerez) kapıyı etkilemez", () => {
    expect(computePendingConsents([...upToDate()])).toEqual([]);
    expect(
      computePendingConsents([
        ...upToDate(),
        {
          document: "marketing",
          version: CONSENT_DOCUMENTS.marketing.version,
          action: "withdrawn",
          createdAt: at("2026-09-21T00:00:00Z"),
        },
      ]),
    ).toEqual([]);
  });
});

describe("latestByDocument", () => {
  it("belge başına en geç satırı tutar", () => {
    const map = latestByDocument([
      granted("terms", "a", "2026-01-01T00:00:00Z"),
      granted("terms", "b", "2026-02-01T00:00:00Z"),
      granted("kvkk", "c", "2026-01-15T00:00:00Z"),
    ]);

    expect(map.get("terms")?.version).toBe("b");
    expect(map.get("kvkk")?.version).toBe("c");
  });
});
