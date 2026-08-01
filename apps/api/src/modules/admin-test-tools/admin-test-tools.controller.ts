import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
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

/**
 * Admin "Test Araçları / Zaman Makinesi" — yalnız SÜPER-ADMIN.
 * Süre-bazlı akışları (boost/üyelik/iade/sipariş/teklif/takas/hold/token) manuel test eder:
 * cron tetikleme + tek kaydın tarih alanını geri/ileri alma. Her değişiklik audit'lenir.
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
    private readonly prisma: PrismaService,
  ) {}

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
      { [res.field]: res.after, action: body.action, value: body.value ?? 0 },
    );
    return res;
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
