import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AdminRole } from "@prisma/client";
import { PrismaService } from "../../prisma";
import { AdminJwtAuthGuard } from "../auth/guards/admin-jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { AdminRoute } from "../auth/decorators/admin-route.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  AdminTestToolsService,
  AdjustAction,
  TestToolType,
} from "./admin-test-tools.service";
import { TestLaneService } from "./test-lane.service";
import { ShipmentSimulationService } from "./shipment-simulation.service";
import { CreateTestAccountDto } from "./dto/create-test-account.dto";
import { SimulateShipmentDto } from "./dto/simulate-shipment.dto";
import { StartUatRefreshDto } from "./dto/uat-refresh.dto";
import { UatRefreshService } from "./uat-refresh/uat-refresh.service";

/**
 * Admin "Test Araçları / Zaman Makinesi" — yalnız SÜPER-ADMIN.
 * Süre-bazlı akışları (boost/üyelik/iade/sipariş/teklif/takas/hold/token) manuel test eder:
 * cron tetikleme + tek kaydın tarih alanını geri/ileri alma + taşıyıcı olayı
 * simülasyonu (UAT; canlıda yalnız test şeridi) + staging'i production'ın maskeli
 * kopyasıyla yenileme (yalnız staging). Her değişiklik audit'lenir.
 */
@ApiTags("admin-test-tools")
@ApiBearerAuth()
@Controller("admin/test-tools")
@AdminRoute()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Roles(AdminRole.super_admin)
export class AdminTestToolsController {
  constructor(
    private readonly service: AdminTestToolsService,
    private readonly testLane: TestLaneService,
    private readonly simulation: ShipmentSimulationService,
    private readonly uatRefresh: UatRefreshService,
    private readonly prisma: PrismaService,
  ) {}

  // ───────────── Test şeridi (canlıda izole test hesapları) ─────────────

  @Get("lane/accounts")
  @ApiOperation({ summary: "Test şeridi hesapları" })
  listTestAccounts() {
    return this.testLane.listAccounts();
  }

  @Post("lane/accounts")
  @ApiOperation({ summary: "Test şeridi hesabı aç (doğrulanmış, adresli)" })
  async createTestAccount(
    @CurrentUser("id") adminId: string,
    @Body() dto: CreateTestAccountDto,
  ) {
    const created = await this.testLane.createAccount(dto);
    await this.writeAudit(
      adminId,
      "test_lane_account_create",
      "user",
      created.id,
      null,
      { email: created.email, isSeller: created.isSeller },
    );
    return created;
  }

  @Post("lane/reset")
  @ApiOperation({
    summary:
      "Test şeridini sıfırla: işlem kayıtları silinir, hesaplar ve ilanlar kalır",
  })
  async resetTestLane(@CurrentUser("id") adminId: string) {
    const result = await this.testLane.resetLane();
    await this.writeAudit(
      adminId,
      "test_lane_reset",
      "test_lane",
      "-",
      null,
      result,
    );
    return result;
  }

  @Get("environment")
  @ApiOperation({ summary: "Çalışılan ortam (prod uyarısı için)" })
  getEnvironment() {
    return this.service.getEnvironment();
  }

  @Get("crons")
  @ApiOperation({ summary: "Tetiklenebilir cron listesi" })
  listCrons() {
    return this.service.listCrons();
  }

  @Post("run-cron")
  @ApiOperation({ summary: "Bir cron’u kuyruğa fiş atarak tetikle" })
  async runCron(
    @CurrentUser("id") adminId: string,
    @Body() body: { key: string },
  ) {
    const res = await this.service.runCron(body?.key);
    await this.writeAudit(
      adminId,
      "test_tools_run_cron",
      "Cron",
      body?.key,
      null,
      {
        jobId: res.jobId,
        queuedAt: res.queuedAt,
      },
    );
    return res;
  }

  @Get("cron-status")
  @ApiOperation({ summary: "Tetiklenen cron fişinin akıbeti (salt okuma)" })
  getCronStatus(@Query("jobId") jobId: string) {
    return this.service.getCronStatus(jobId);
  }

  @Get("search")
  @ApiOperation({ summary: "Süre ayarlamak için kayıt ara" })
  search(@Query("type") type: TestToolType, @Query("q") q: string) {
    return this.service.search(type, q);
  }

  @Post("adjust")
  @ApiOperation({ summary: "Tek kaydın tarih alanını değiştir" })
  async adjust(
    @CurrentUser("id") adminId: string,
    @Body()
    body: {
      type: TestToolType;
      id: string;
      action: AdjustAction;
      value?: number;
    },
  ) {
    const res = await this.service.adjust(
      body.type,
      body.id,
      body.action,
      body.value ?? 0,
    );
    await this.writeAudit(
      adminId,
      "test_tools_adjust_time",
      `${res.type}:${res.field}`,
      res.id,
      { [res.field]: res.before },
      {
        [res.field]: res.after,
        ...res.related,
        action: body.action,
        value: body.value ?? 0,
      },
    );
    return res;
  }

  // ───────────── Kargo simülasyonu (UAT: dış olayı tester tetikler) ─────────────

  @Get("shipments")
  @ApiOperation({
    summary:
      "Simüle edilebilecek kolileri ara (sipariş no, iade no, takas no, PKG/takip kodu)",
  })
  @ApiResponse({
    status: 200,
    description:
      "Koliler: mevcut durum + sunulabilecek adımlar. Canlıda yalnız test şeridi.",
  })
  searchShipments(@Query("q") q: string) {
    return this.simulation.search(q);
  }

  @Post("shipments/simulate")
  @ApiOperation({
    summary:
      "Taşıyıcı olayını simüle et (kabul / teslim) — gerçek takip senkronu çekirdeğinden geçer",
  })
  @ApiResponse({
    status: 201,
    description: "Okuma uygulandı; kolinin önceki ve sonraki durumu döner",
  })
  async simulateShipment(
    @CurrentUser("id") adminId: string,
    @Body() dto: SimulateShipmentDto,
  ) {
    const res = await this.simulation.simulate(dto.kind, dto.id, dto.step);
    await this.writeAudit(
      adminId,
      "test_tools_simulate_shipment",
      dto.kind,
      dto.id,
      {
        reference: res.before.reference,
        status: res.before.status,
        ownerStatus: res.before.ownerStatus,
      },
      {
        step: dto.step,
        applied: res.applied,
        status: res.after.status,
        ownerStatus: res.after.ownerStatus,
        isTest: res.after.isTest,
      },
    );
    return res;
  }

  // ───────────── Staging'i production'dan maskeli yenile (docs/UAT_REFRESH.md) ─────────────

  @Get("uat-refresh")
  @ApiOperation({
    summary: "Staging yenileme düğmesinin durumu + son 10 koşu",
  })
  @ApiResponse({
    status: 200,
    description:
      "UatRefreshStatus. Canlıda available=false, unavailableReason=production ve geçmiş boş.",
  })
  getUatRefreshStatus() {
    return this.uatRefresh.getStatus();
  }

  @Post("uat-refresh")
  @ApiOperation({
    summary:
      "Staging veritabanını production'ın maskeli kopyasıyla değiştir (GitHub workflow'u tetikler)",
  })
  @ApiResponse({ status: 201, description: "Kuyruğa alınan koşu" })
  @ApiResponse({ status: 403, description: "Canlı dağıtımda reddedilir" })
  @ApiResponse({ status: 409, description: "Kuyrukta/koşan bir yenileme var" })
  @ApiResponse({
    status: 503,
    description: "GitHub tetikleyicisi yapılandırılmamış",
  })
  async startUatRefresh(
    @CurrentUser("id") adminId: string,
    @Body() dto: StartUatRefreshDto,
  ) {
    const run = await this.uatRefresh.start(adminId, dto);
    await this.writeAudit(
      adminId,
      "uat_refresh_start",
      "uat_refresh_run",
      run.id,
      null,
      {
        dryRun: run.dryRun,
        state: run.state,
      },
    );
    return run;
  }

  /** AuditLog.adminUserId = AdminUser.id (User.id değil); çöz ve yaz. Hata ana akışı bozmaz. */
  private async writeAudit(
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    oldValue: unknown,
    newValue: unknown,
  ): Promise<void> {
    try {
      const adminUser = await this.prisma.adminUser.findFirst({
        where: { userId, isActive: true },
        select: { id: true },
      });
      if (!adminUser) return;
      await this.prisma.auditLog.create({
        data: {
          adminUserId: adminUser.id,
          action,
          entityType,
          entityId: entityId ?? "-",
          oldValue: oldValue == null ? undefined : (oldValue as object),
          newValue: newValue == null ? undefined : (newValue as object),
        },
      });
    } catch {
      // audit başarısızlığı işlemi bozmasın
    }
  }
}
