import {
  MODULE_METADATA,
  OPTIONAL_DEPS_METADATA,
  PARAMTYPES_METADATA,
} from "@nestjs/common/constants";
import { BoostTimelineModule } from "../../product/boost-timeline/boost-timeline.module";
import { BoostTimelineService } from "../../product/boost-timeline/boost-timeline.service";
import { PaymentModule } from "../payment.module";
import { PaymentRefundService } from "./payment-refund.service";

/**
 * CONTRACT: a refund of a boost order stops its boost in the finalize
 * transaction (`BoostTimelineService.stopForRefund`). The dependency was
 * once `@Optional()`: broken wiring would have booted fine and then sent the
 * money back while the boost kept running. It is required now, and this
 * spec keeps it so: required in the constructor, and resolvable in
 * `PaymentModule` through `BoostTimelineModule`.
 */
describe("PaymentRefundService boost wiring", () => {
  it("injects BoostTimelineService as a required dependency", () => {
    const params: unknown[] =
      Reflect.getMetadata(PARAMTYPES_METADATA, PaymentRefundService) ?? [];
    const index = params.indexOf(BoostTimelineService);
    expect(index).toBeGreaterThanOrEqual(0);
    const optional: number[] =
      Reflect.getMetadata(OPTIONAL_DEPS_METADATA, PaymentRefundService) ?? [];
    expect(optional).not.toContain(index);
  });

  it("PaymentModule provides the refund service and imports the boost timeline", () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, PaymentModule),
    ).toContain(PaymentRefundService);
    expect(
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, PaymentModule),
    ).toContain(BoostTimelineModule);
    expect(
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, BoostTimelineModule),
    ).toContain(BoostTimelineService);
  });
});
