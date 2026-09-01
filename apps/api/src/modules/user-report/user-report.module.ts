import { Module } from "@nestjs/common";
import { UserReportController } from "./user-report.controller";
import { UserReportService } from "./user-report.service";
import { PrismaModule } from "../../prisma";
import { NotificationModule } from "../notification/notification.module";

@Module({
  imports: [PrismaModule, NotificationModule],
  controllers: [UserReportController],
  providers: [UserReportService],
  exports: [UserReportService],
})
export class UserReportModule {}
