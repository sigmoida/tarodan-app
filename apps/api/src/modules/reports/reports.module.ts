import { Module } from "@nestjs/common";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import { PrismaModule } from "../../prisma";
import { WebSocketModule } from "../websocket/websocket.module";

@Module({
  imports: [PrismaModule, WebSocketModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
