import { ConsentSource } from "@prisma/client";
import { ACCOUNT_REQUIRED_CONSENTS, CONSENT_DOCUMENTS } from "@tarodan/types";
import {
  findPendingAccountConsents,
  grantPendingAccountConsents,
  planAccountConsentGrant,
  type AccountConsentDb,
} from "./account-consents";

type Row = {
  document: string;
  version: string;
  action: "granted" | "withdrawn";
  createdAt: Date;
};

/** Ekleme-yalnız tabloyu taklit eder: createMany satırları listeye ekler. */
function fakeDb(initial: Row[] = []) {
  const rows = [...initial];
  const createMany = jest.fn(async ({ data }: { data: any[] }) => {
    for (const d of data) {
      rows.push({
        document: d.document,
        version: d.version,
        action: d.action,
        createdAt: new Date("2026-10-13T10:00:00Z"),
      });
    }
    return { count: data.length };
  });
  const db = {
    consentRecord: {
      findMany: jest.fn(async () => [...rows]),
      createMany,
    },
  } as unknown as AccountConsentDb;
  return { db, rows, createMany };
}

const current = (
  document: (typeof ACCOUNT_REQUIRED_CONSENTS)[number],
): Row => ({
  document,
  version: CONSENT_DOCUMENTS[document].version,
  action: "granted",
  createdAt: new Date("2026-10-01T10:00:00Z"),
});

describe("grantPendingAccountConsents", () => {
  it("writes every required document at the CURRENT version for a fresh account", async () => {
    const { db, createMany } = fakeDb();

    const count = await grantPendingAccountConsents(
      db,
      "u1",
      ConsentSource.registration,
    );

    expect(count).toBe(ACCOUNT_REQUIRED_CONSENTS.length);
    const data = createMany.mock.calls[0][0].data;
    expect(data.map((d: any) => d.document).sort()).toEqual(
      [...ACCOUNT_REQUIRED_CONSENTS].sort(),
    );
    for (const row of data) {
      // Sürüm katalogdan gelir, çağıran söyleyemez.
      expect(row.version).toBe(
        CONSENT_DOCUMENTS[row.document as "terms"].version,
      );
      expect(row).toMatchObject({
        userId: "u1",
        action: "granted",
        source: ConsentSource.registration,
        ipAddress: null,
        userAgent: null,
      });
    }
  });

  it("is idempotent: an up-to-date account gets no new rows", async () => {
    const { db, createMany } = fakeDb(ACCOUNT_REQUIRED_CONSENTS.map(current));

    const count = await grantPendingAccountConsents(
      db,
      "u1",
      ConsentSource.registration,
    );

    expect(count).toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("adds only the new version when a document text changed", async () => {
    const stale: Row[] = ACCOUNT_REQUIRED_CONSENTS.map((doc) =>
      doc === "terms"
        ? { ...current(doc), version: "2020-01-01" }
        : current(doc),
    );
    const { db, createMany } = fakeDb(stale);

    const count = await grantPendingAccountConsents(
      db,
      "u1",
      ConsentSource.registration,
    );

    expect(count).toBe(1);
    expect(createMany.mock.calls[0][0].data[0]).toMatchObject({
      document: "terms",
      version: CONSENT_DOCUMENTS.terms.version,
    });
  });

  it("grants only the listed documents and leaves the rest pending", async () => {
    const { db } = fakeDb();

    const count = await grantPendingAccountConsents(
      db,
      "u1",
      ConsentSource.registration,
      { only: ["terms", "privacy"] },
    );

    expect(count).toBe(2);
    const pending = await findPendingAccountConsents(db, "u1");
    expect(pending.map((p) => p.document)).toEqual(["kvkk"]);
  });

  it("a second run after a partial grant does not touch the remaining pending document", async () => {
    const { db, createMany } = fakeDb();
    await grantPendingAccountConsents(db, "u1", ConsentSource.registration, {
      only: ["terms", "privacy"],
    });
    createMany.mockClear();

    const count = await grantPendingAccountConsents(
      db,
      "u1",
      ConsentSource.registration,
      { only: ["terms", "privacy"] },
    );

    expect(count).toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });
});

describe("findPendingAccountConsents", () => {
  it("asks for the required documents of this user only", async () => {
    const { db } = fakeDb();

    await findPendingAccountConsents(db, "u9");

    expect((db as any).consentRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "u9",
          document: { in: [...ACCOUNT_REQUIRED_CONSENTS] },
        },
      }),
    );
  });
});

describe("withdrawn consents are not silently re-granted", () => {
  const withdrawn = (
    document: (typeof ACCOUNT_REQUIRED_CONSENTS)[number],
    at = "2026-10-05T10:00:00Z",
  ): Row => ({
    document,
    version: CONSENT_DOCUMENTS[document].version,
    action: "withdrawn",
    createdAt: new Date(at),
  });

  it("skipWithdrawn: en son kaydı geri çekme olan belge atlanır ve raporlanır", async () => {
    const { db, createMany } = fakeDb([
      current("terms"),
      current("privacy"),
      withdrawn("kvkk"),
    ]);

    const plan = await planAccountConsentGrant(db, "u1", {
      skipWithdrawn: true,
    });
    expect(plan.grant).toEqual([]);
    expect(plan.skippedWithdrawn).toEqual(["kvkk"]);

    const count = await grantPendingAccountConsents(
      db,
      "u1",
      ConsentSource.registration,
      { skipWithdrawn: true },
    );
    expect(count).toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("geri çekme sonradan yeniden onaylandıysa (en son kayıt granted) atlanmaz", async () => {
    const { db } = fakeDb([
      withdrawn("kvkk", "2026-10-02T10:00:00Z"),
      { ...current("kvkk"), createdAt: new Date("2026-10-03T10:00:00Z") },
      current("terms"),
      current("privacy"),
    ]);
    const plan = await planAccountConsentGrant(db, "u1", {
      skipWithdrawn: true,
    });
    expect(plan.grant).toEqual([]);
    expect(plan.skippedWithdrawn).toEqual([]);
  });

  it("yalnız geri çekilmiş belge atlanır, eksik olanlar yazılır", async () => {
    const { db, createMany } = fakeDb([withdrawn("terms")]);

    const count = await grantPendingAccountConsents(
      db,
      "u1",
      ConsentSource.registration,
      { skipWithdrawn: true },
    );

    expect(count).toBe(2);
    expect(
      createMany.mock.calls[0][0].data.map((d: any) => d.document).sort(),
    ).toEqual(["kvkk", "privacy"]);
  });

  it("seçenek verilmezse (kayıt/seed) bugünkü davranış: geri çekilmiş belge de yazılır", async () => {
    const { db } = fakeDb([withdrawn("terms")]);
    const plan = await planAccountConsentGrant(db, "u1");
    expect(plan.grant.map((p) => p.document)).toContain("terms");
  });

  it("plan hiçbir şey yazmaz (dry-run)", async () => {
    const { db, createMany } = fakeDb();
    await planAccountConsentGrant(db, "u1");
    expect(createMany).not.toHaveBeenCalled();
  });
});
