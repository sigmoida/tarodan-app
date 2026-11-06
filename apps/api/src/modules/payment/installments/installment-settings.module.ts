import { Module } from "@nestjs/common";
import { InstallmentSettingsService } from "./installment-settings.service";

/**
 * The installment switch and minimum amount on their own: a leaf module (the
 * service needs only the global Prisma), so the consent module can read the
 * switch for the version of the distance sales text without importing the
 * payment module (which imports consent). One instance for every reader.
 */
@Module({
  providers: [InstallmentSettingsService],
  exports: [InstallmentSettingsService],
})
export class InstallmentSettingsModule {}
