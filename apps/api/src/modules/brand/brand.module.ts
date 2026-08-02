import { Module } from "@nestjs/common";
import { BrandService } from "./brand.service";
import { BrandController } from "./brand.controller";
import { StorageModule } from "../storage/storage.module";

@Module({
  imports: [StorageModule],
  controllers: [BrandController],
  providers: [BrandService],
  exports: [BrandService],
})
export class BrandModule {}
