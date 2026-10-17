import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { NetsisConfig } from "../../config/netsis";
import { CacheService } from "../cache/cache.service";
import { NETSIS_CONFIG } from "./helpers/netsis.constants";
import { NetsisClientFacade } from "./netsis-client.facade";
import { NetsisModule } from "./netsis.module";

/** Uygulamadaki global CacheModule'ün yerine — Redis'e bağlanmaz. */
@Global()
@Module({
  providers: [{ provide: CacheService, useValue: {} }],
  exports: [CacheService],
})
class FakeCacheModule {}

describe("NetsisModule", () => {
  const config = (mode: NetsisConfig["mode"]): NetsisConfig => ({
    enabled: true,
    mode,
    baseUrl: "https://netsis.test",
    username: "u",
    password: "p",
    dbName: "d",
    dbUser: "du",
    dbPassword: "dp",
    dbType: "vtMSSQL",
    branchCode: "0",
    timeoutMs: 15_000,
    tokenSafetySeconds: 60,
  });

  const compile = async (mode: NetsisConfig["mode"]) => {
    const moduleRef = await Test.createTestingModule({
      imports: [FakeCacheModule, NetsisModule],
    })
      .overrideProvider(NETSIS_CONFIG)
      .useValue(config(mode))
      .compile();
    return moduleRef.get(NetsisClientFacade);
  };

  it("resolves every provider and serves the stub in stub mode", async () => {
    const facade = await compile("stub");
    expect(facade.mode).toBe("stub");
  });

  it("serves the live gateway when NETSIS_MODE is live (no network at boot)", async () => {
    const facade = await compile("live");
    expect(facade.mode).toBe("live");
  });
});
