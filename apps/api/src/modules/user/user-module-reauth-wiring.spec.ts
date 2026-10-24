import { Controller, Delete, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ScheduleModule } from "@nestjs/schedule";
import { ModulesContainer } from "@nestjs/core";
import { STATIC_CONTEXT } from "@nestjs/core/injector/constants";
import { Test } from "@nestjs/testing";
import { PrismaModule } from "../../prisma/prisma.module";
import { BullRootModule } from "../../workers/bull-root.module";
import { MonitoringModule } from "../../monitoring/monitoring.module";
import { CacheModule } from "../cache/cache.module";
import { AccountLaneModule } from "../account-lane/account-lane.module";
import { OutboxModule } from "../outbox/outbox.module";
import { LedgerModule } from "../ledger/ledger.module";
import { MailRoutingModule } from "../mail-routing/mail-routing.module";
import { I18nModule } from "../i18n/i18n.module";
import { SentryModule } from "../sentry/sentry.module";
import { ReauthGuard } from "../auth/reauth/reauth.guard";
import { RequireReauth } from "../auth/reauth/require-reauth.decorator";
import { UserModule } from "./user.module";

/**
 * `DELETE /users/me` carries `@RequireReauth`, so `ReauthGuard` is resolved in
 * UserModule's scope: its `ReauthService` must come from an imported module
 * (AuthModule exports it) and the import must not form a cycle. Nest's
 * preview mode resolves every provider, controller and guard dependency of
 * the real module graph without instantiating anything, so this runs with no
 * Postgres, Redis or env file. The global infrastructure modules stand in for
 * the ones AppModule registers. The module is never closed: preview mode
 * builds no instances, so the destroy hooks would have nothing to stop.
 */
const GLOBAL_INFRASTRUCTURE = [
  ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
  EventEmitterModule.forRoot(),
  ScheduleModule.forRoot(),
  PrismaModule,
  CacheModule,
  AccountLaneModule,
  OutboxModule,
  LedgerModule,
  MailRoutingModule,
  I18nModule,
  BullRootModule,
  SentryModule,
  MonitoringModule,
];

const compileInPreview = (feature: unknown) =>
  Test.createTestingModule({
    imports: [...GLOBAL_INFRASTRUCTURE, feature as never],
  }).compile({ preview: true });

describe("UserModule step-up wiring", () => {
  it("resolves ReauthGuard for DELETE /users/me (no DI gap, no import cycle)", async () => {
    const moduleRef = await compileInPreview(UserModule);

    const userModule = [...moduleRef.get(ModulesContainer).values()].find(
      (module) => module.metatype === UserModule,
    );
    const guard = userModule?.injectables.get(ReauthGuard);
    expect(guard?.isDependencyTreeStatic()).toBe(true);
    expect(guard?.getInstanceByContextId(STATIC_CONTEXT).isResolved).toBe(true);
  });

  it("would fail to resolve the guard without AuthModule (the check is real)", async () => {
    @Controller("probe")
    class ProbeController {
      @Delete()
      @RequireReauth({ required: "setting", flow: "account_delete" })
      remove() {
        // a route stub: only its guard matters
      }
    }
    @Module({ controllers: [ProbeController] })
    class ProbeModule {}

    await expect(compileInPreview(ProbeModule)).rejects.toThrow(
      /ReauthService/,
    );
  });
});
