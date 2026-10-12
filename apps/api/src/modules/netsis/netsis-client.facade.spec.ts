import { ServiceUnavailableException } from "@nestjs/common";
import type { NetsisConfig } from "../../config/netsis";
import { NetsisStubGateway } from "./gateway/netsis-stub.gateway";
import { NetsisClientFacade } from "./netsis-client.facade";

describe("NetsisClientFacade", () => {
  const config = (enabled: boolean): NetsisConfig => ({
    enabled,
    mode: "stub",
    baseUrl: "",
    username: "",
    password: "",
    dbName: "",
    dbUser: "",
    dbPassword: "",
    dbType: "vtMSSQL",
    branchCode: "0",
    timeoutMs: 15_000,
    tokenSafetySeconds: 60,
  });

  it("delegates every resource and ping to the selected gateway", async () => {
    const gateway = new NetsisStubGateway();
    const facade = new NetsisClientFacade(gateway, config(true));

    expect(facade.enabled).toBe(true);
    expect(facade.mode).toBe("stub");
    expect(facade.arps).toBe(gateway.arps);
    expect(facade.items).toBe(gateway.items);
    expect(facade.itemSlips).toBe(gateway.itemSlips);
    expect(facade.eDocuments).toBe(gateway.eDocuments);
    expect(facade.receipts).toBe(gateway.receipts);
    expect(facade.transactions).toBe(gateway.transactions);
    expect(facade.publicApi).toBe(gateway.publicApi);
    expect(facade.queries).toBe(gateway.queries);
    await expect(facade.ping()).resolves.toMatchObject({ mode: "stub" });
  });

  it("refuses every call with a localized 503 while disabled", () => {
    const facade = new NetsisClientFacade(
      new NetsisStubGateway(),
      config(false),
    );

    expect(facade.enabled).toBe(false);
    // Mod okunabilir kalır (teşhis için); iş yapan her yüzey kapalı.
    expect(facade.mode).toBe("stub");
    for (const access of [
      () => facade.arps,
      () => facade.items,
      () => facade.itemSlips,
      () => facade.eDocuments,
      () => facade.receipts,
      () => facade.transactions,
      () => facade.publicApi,
      () => facade.queries,
      () => facade.ping(),
    ]) {
      let error: unknown;
      try {
        access();
      } catch (e: unknown) {
        error = e;
      }
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getResponse()).toEqual({
        i18nKey: "server.netsis.disabled",
      });
    }
  });
});
