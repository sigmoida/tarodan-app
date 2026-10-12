import { NetsisArpsClient } from "../clients/netsis-arps.client";
import { NetsisEDocumentClient } from "../clients/netsis-edocument.client";
import { NetsisItemSlipsClient } from "../clients/netsis-item-slips.client";
import { NetsisItemsClient } from "../clients/netsis-items.client";
import { NetsisPublicClient } from "../clients/netsis-public.client";
import { NetsisQueriesClient } from "../clients/netsis-queries.client";
import { NetsisReceiptsClient } from "../clients/netsis-receipts.client";
import { NetsisTransactionsClient } from "../clients/netsis-transactions.client";
import type { NetsisHttpClient } from "../http/netsis-http.client";
import type { NetsisTransport } from "../http/netsis-transport";
import type { NetsisGateway } from "./netsis-gateway";
import { NetsisLiveGateway } from "./netsis-live.gateway";
import { NetsisStubGateway } from "./netsis-stub.gateway";

/**
 * Canlı ve stub gateway AYNI yüzeyi taşır. Derleyici `implements` ile bunu
 * zaten ister; bu sözleşme çalışma zamanında da kilitler ve — asıl önemlisi —
 * `SURFACE` tipi arayüzdeki HER yöntemi saymayı zorunlu kılar: arayüze yöntem
 * eklenip buraya eklenmezse spec derlenmez, stub'a eklenmezse spec kırılır.
 * Faturalama sağlayıcısının testleri stub'a güvenecek; stub'da olmayan bir
 * yetenek canlıda ilk kez çağrılmamalı.
 */
type Surface<T> = { [K in keyof T]-?: true };
type ResourceKey = Exclude<keyof NetsisGateway, "mode" | "ping">;

const SURFACE: { [R in ResourceKey]: Surface<NetsisGateway[R]> } = {
  arps: {
    findByCode: true,
    create: true,
    update: true,
    refreshEInvoiceFlags: true,
  },
  items: { findByCode: true, create: true, ensureServiceItem: true },
  itemSlips: {
    create: true,
    details: true,
    calculate: true,
    html: true,
    newEInvoiceNumber: true,
    newEArchiveNumber: true,
    delete: true,
  },
  eDocuments: { send: true, check: true, cancelEArchive: true, show: true },
  receipts: {
    createCollection: true,
    getCollection: true,
    createBankTransfer: true,
  },
  transactions: {
    open: true,
    commit: true,
    rollback: true,
    withTransaction: true,
  },
  publicApi: {
    ping: true,
    version: true,
    companyList: true,
    authorizedBranches: true,
  },
  queries: { select: true },
};

function liveGateway(): NetsisLiveGateway {
  const http = {} as NetsisHttpClient;
  return new NetsisLiveGateway(
    new NetsisArpsClient(http),
    new NetsisItemsClient(http),
    new NetsisItemSlipsClient(http),
    new NetsisEDocumentClient(http),
    new NetsisReceiptsClient(http),
    new NetsisTransactionsClient(http),
    new NetsisPublicClient({} as NetsisTransport),
    new NetsisQueriesClient(http),
    http,
  );
}

describe("NetsisGateway contract (live ≡ stub)", () => {
  const gateways: [string, NetsisGateway][] = [
    ["live", liveGateway()],
    ["stub", new NetsisStubGateway()],
  ];

  it.each(gateways)("%s exposes every resource method", (_name, gateway) => {
    const missing: string[] = [];
    for (const resource of Object.keys(SURFACE) as ResourceKey[]) {
      const api = gateway[resource] as unknown as Record<string, unknown>;
      for (const method of Object.keys(SURFACE[resource])) {
        if (typeof api?.[method] !== "function") {
          missing.push(`${resource}.${method}`);
        }
      }
    }
    expect(missing).toEqual([]);
    expect(typeof gateway.ping).toBe("function");
  });

  it("reports its mode", () => {
    expect(gateways.map(([, gateway]) => gateway.mode)).toEqual([
      "live",
      "stub",
    ]);
  });

  it("the surface list counts every resource of the interface", () => {
    expect(Object.keys(SURFACE).sort()).toEqual(
      [
        "arps",
        "eDocuments",
        "itemSlips",
        "items",
        "publicApi",
        "queries",
        "receipts",
        "transactions",
      ].sort(),
    );
  });
});
