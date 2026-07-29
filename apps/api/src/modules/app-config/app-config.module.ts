import { Module } from "@nestjs/common";
import { AppConfigController } from "./app-config.controller";
import { AppConfigService } from "./app-config.service";
import { PrismaModule } from "../../prisma";

@Module({
  imports: [PrismaModule],
  controllers: [AppConfigController],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
