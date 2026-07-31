import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma";
import { SiteAccessPinService } from "./site-access-pin.service";
import { SiteAccessController } from "./site-access.controller";

@Module({
  imports: [PrismaModule],
  controllers: [SiteAccessController],
  providers: [SiteAccessPinService],
  exports: [SiteAccessPinService],
})
export class SiteAccessModule {}
