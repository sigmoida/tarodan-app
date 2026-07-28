import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import { IS_PUBLIC_KEY } from "../auth/decorators/public.decorator";

describe("Health readiness contract", () => {
  it("includes worker, outbox and business configuration readiness", async () => {
    const service = new HealthService({} as any, {} as any, {} as any);
    jest.spyOn(service as any, "checkPostgresql").mockResolvedValue({
      status: "healthy",
    });
    jest.spyOn(service as any, "checkRedis").mockResolvedValue({
      status: "healthy",
    });

    const result = await service.checkReadiness();

    expect(result.checks).toEqual(
      expect.objectContaining({
        worker: true,
        outbox: true,
        businessConfig: true,
      }),
    );
  });

  it("does not expose detailed infrastructure health as a public endpoint", () => {
    expect(
      Reflect.getMetadata(
        IS_PUBLIC_KEY,
        HealthController.prototype.detailedCheck,
      ),
    ).not.toBe(true);
  });
});
