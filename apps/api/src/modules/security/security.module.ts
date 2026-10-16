import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { SecurityController } from "./security.controller";
import { SecurityService } from "./security.service";
import { PrismaModule } from "../../prisma";
// Oturum iptallerinde push token'ları da düşer. Yaprak modül: NotificationModule
// WebSocketModule üzerinden bu modüle bağlı olduğu için onu içe aktaramayız.
import { PushTokenModule } from "../notification/push-token/push-token.module";

@Module({
  imports: [PrismaModule, ConfigModule, PushTokenModule],
  controllers: [SecurityController],
  providers: [SecurityService],
  exports: [SecurityService],
})
export class SecurityModule {}
