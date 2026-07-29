import { MODULE_METADATA } from "@nestjs/common/constants";
import { WorkerModule } from "./worker.module";

describe("WorkerModule payment safety", () => {
  it("does not register the legacy PaymentWorker that bypasses canonical money flows", () => {
    const providers =
      (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, WorkerModule) as Array<{
        name?: string;
      }>) ?? [];

    expect(providers.map((provider) => provider?.name)).not.toContain(
      "PaymentWorker",
    );
  });
});
