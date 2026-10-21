import { ConsentAction, ConsentSource } from "@prisma/client";
import {
  CONSENT_DOCUMENTS,
  GATEWAY_CLIENT_IP_HEADER,
  isDraftConsentVersion,
} from "@tarodan/types";
import { requestIdMiddleware } from "../../common/context/request-context";
import { ConsentService } from "./consent.service";
import {
  PLATFORM_SERVICE_CONSENT_DOCUMENTS,
  PlatformServiceConsentService,
  platformServiceConsentsAccepted,
} from "./platform-service-consent.service";

/** Runs `fn` inside a real HTTP request context (the evidence fields). */
function withRequest<T>(
  req: { ip?: string; headers: Record<string, string> },
  fn: () => Promise<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    requestIdMiddleware(
      req as never,
      { setHeader: () => undefined } as never,
      () => {
        fn().then(resolve, reject);
      },
    );
  });
}

function make(rows: Array<{ document: string }> = []) {
  const prisma = {
    consentRecord: { findMany: jest.fn().mockResolvedValue(rows) },
  };
  const service = new PlatformServiceConsentService(
    prisma as never,
    new ConsentService(prisma as never),
  );
  return { service, prisma };
}

describe("platformServiceConsentsAccepted", () => {
  it.each([
    [{ preInformationAccepted: true, withdrawalWaiverAccepted: true }, true],
    [{ preInformationAccepted: true, withdrawalWaiverAccepted: false }, false],
    [{ preInformationAccepted: false, withdrawalWaiverAccepted: true }, false],
    [{ preInformationAccepted: true }, false],
    [{ withdrawalWaiverAccepted: true }, false],
    [{}, false],
  ])("%p -> %p", (input, expected) => {
    expect(platformServiceConsentsAccepted(input)).toBe(expected);
  });
});

describe("PlatformServiceConsentService.recordForOrder", () => {
  it("writes both documents with the current versions, bound to the order, through the caller's transaction", async () => {
    const { service, prisma } = make();
    const tx = {
      consentRecord: {
        createMany: jest
          .fn()
          .mockImplementation(({ data }: { data: unknown[] }) =>
            Promise.resolve({ count: data.length }),
          ),
      },
    };

    await withRequest(
      {
        ip: "10.0.0.3",
        headers: {
          [GATEWAY_CLIENT_IP_HEADER]: "85.105.10.20",
          "user-agent": "Mozilla/5.0 test",
        },
      },
      () =>
        service.recordForOrder(tx as never, {
          orderId: "order-1",
          userId: "seller-1",
        }),
    );

    expect(tx.consentRecord.createMany).toHaveBeenCalledTimes(1);
    const rows = tx.consentRecord.createMany.mock.calls[0][0].data;
    expect(rows).toEqual(
      PLATFORM_SERVICE_CONSENT_DOCUMENTS.map((document) =>
        expect.objectContaining({
          document,
          version: CONSENT_DOCUMENTS[document].version,
          action: ConsentAction.granted,
          source: ConsentSource.checkout,
          userId: "seller-1",
          guestEmail: null,
          visitorId: null,
          orderId: "order-1",
          checkoutGroupId: null,
          // The browser's IP from the gateway header, not the gateway's.
          ipAddress: "85.105.10.20",
          userAgent: "Mozilla/5.0 test",
        }),
      ),
    );
    // Nothing goes through the root client: the rows commit with the order.
    expect(prisma.consentRecord).not.toHaveProperty("createMany");
  });

  describe("the version stamped on each row", () => {
    afterEach(() => jest.restoreAllMocks());

    const recordedVersions = async (version: string) => {
      for (const document of PLATFORM_SERVICE_CONSENT_DOCUMENTS) {
        jest.replaceProperty(CONSENT_DOCUMENTS[document], "version", version);
      }
      const { service } = make();
      const createMany = jest
        .fn()
        .mockImplementation(({ data }: { data: unknown[] }) =>
          Promise.resolve({ count: data.length }),
        );
      await service.recordForOrder({ consentRecord: { createMany } } as never, {
        orderId: "order-1",
        userId: "seller-1",
      });
      const rows = createMany.mock.calls[0][0].data as Array<{
        version: string;
      }>;
      return rows.map((row) => row.version);
    };

    it("keeps the -draft suffix, so the evidence never passes a draft off as the signed text", async () => {
      const versions = await recordedVersions("2026-10-21-draft");

      expect(versions).toEqual(["2026-10-21-draft", "2026-10-21-draft"]);
      expect(versions.every(isDraftConsentVersion)).toBe(true);
    });

    it("stamps the signed version once the catalogue drops the suffix", async () => {
      const versions = await recordedVersions("2026-11-01");

      expect(versions).toEqual(["2026-11-01", "2026-11-01"]);
      expect(versions.some(isDraftConsentVersion)).toBe(false);
    });
  });

  it("records exactly the two platform service documents", () => {
    expect([...PLATFORM_SERVICE_CONSENT_DOCUMENTS]).toEqual([
      "platform_service_sales",
      "withdrawal_waiver",
    ]);
  });
});

describe("PlatformServiceConsentService.isRecordedForOrder", () => {
  it("is true only with a granted row of both documents for the order", async () => {
    const { service, prisma } = make([
      { document: "platform_service_sales" },
      { document: "withdrawal_waiver" },
    ]);

    await expect(service.isRecordedForOrder("order-1")).resolves.toBe(true);
    expect(prisma.consentRecord.findMany).toHaveBeenCalledWith({
      where: {
        orderId: "order-1",
        document: { in: ["platform_service_sales", "withdrawal_waiver"] },
        action: ConsentAction.granted,
      },
      select: { document: true },
    });
  });

  it.each([
    [[{ document: "platform_service_sales" }]],
    [[{ document: "withdrawal_waiver" }]],
    [[]],
  ])("is false when a document is missing (%p)", async (rows) => {
    const { service } = make(rows);

    await expect(service.isRecordedForOrder("order-1")).resolves.toBe(false);
  });
});
