import { Module } from "@nestjs/common";
import { ModulesContainer } from "@nestjs/core";
import { STATIC_CONTEXT } from "@nestjs/core/injector/constants";
import { Test } from "@nestjs/testing";
import { PrismaModule } from "../../prisma/prisma.module";
import { SentryModule } from "../sentry/sentry.module";
import { InstallmentSettingsModule } from "../payment/installments/installment-settings.module";
import { InstallmentSettingsService } from "../payment/installments/installment-settings.service";
import { ConsentModule } from "./consent.module";
import { ConsentService } from "./consent.service";
import { DistanceSalesConsentService } from "./distance-sales-consent.service";

/**
 * The distance sales version follows the installment switch, so
 * `ConsentService` needs `InstallmentSettingsService`. ConsentModule stays a
 * leaf: it gets the service from the `InstallmentSettingsModule` leaf, not
 * from PaymentModule (which imports ConsentModule). Nest's preview mode
 * resolves the dependency tree without instantiating anything, so this runs
 * with no Postgres, Redis or env file; only the global Prisma and Sentry
 * modules stand in for AppModule's.
 */
const compileInPreview = (feature: unknown) =>
  Test.createTestingModule({
    imports: [PrismaModule, SentryModule, feature as never],
  }).compile({ preview: true });

const providerOf = (
  moduleRef: Awaited<ReturnType<typeof compileInPreview>>,
  metatype: unknown,
  token: unknown,
) =>
  [...moduleRef.get(ModulesContainer).values()]
    .find((module) => module.metatype === metatype)
    ?.providers.get(token as never);

describe("ConsentModule wiring", () => {
  it("resolves ConsentService and the distance sales service with only the global modules (a leaf, no import cycle)", async () => {
    const moduleRef = await compileInPreview(ConsentModule);

    for (const token of [ConsentService, DistanceSalesConsentService]) {
      const provider = providerOf(moduleRef, ConsentModule, token);
      expect(provider?.isDependencyTreeStatic()).toBe(true);
      expect(provider?.getInstanceByContextId(STATIC_CONTEXT).isResolved).toBe(
        true,
      );
    }
    // The switch reader is the leaf module's single provider.
    expect(
      providerOf(
        moduleRef,
        InstallmentSettingsModule,
        InstallmentSettingsService,
      ),
    ).toBeDefined();
    expect(
      providerOf(moduleRef, ConsentModule, InstallmentSettingsService),
    ).toBeUndefined();
  });

  it("would fail to resolve ConsentService without the installment settings leaf (the check is real)", async () => {
    @Module({ providers: [ConsentService] })
    class ProbeModule {}

    await expect(compileInPreview(ProbeModule)).rejects.toThrow(
      /InstallmentSettingsService/,
    );
  });
});
