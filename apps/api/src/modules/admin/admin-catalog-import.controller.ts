import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import { AdminJwtAuthGuard } from "../auth/guards/admin-jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { AdminRoute } from "../auth/decorators/admin-route.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AdminRole } from "@prisma/client";
import { UPLOAD_MULTER_OPTIONS } from "../../common/upload/multer-options";
import { CatalogImportService } from "./catalog-import/catalog-import.service";
import { CatalogImportTemplateService } from "./catalog-import/catalog-import-template.service";
import {
  CATALOG_IMPORT_LIMITS,
  type CatalogImportResource,
} from "./catalog-import/catalog-import.types";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Tek dosya, küçük gövde: ürün içe aktarmasının çoklu-dosya ayarına ihtiyaç yok.
 * `fileSize`'a +1 bayt eklenir ki tam sınırdaki dosya kabul edilsin
 * (`UPLOAD_MULTER_OPTIONS` ile aynı gerekçe).
 */
const WORKBOOK_UPLOAD_OPTIONS = {
  ...UPLOAD_MULTER_OPTIONS,
  limits: {
    fileSize: CATALOG_IMPORT_LIMITS.maxFileBytes + 1,
    files: 1,
    fields: 0,
    parts: 2,
  },
};

/**
 * Katalog toplu içe aktarma uçları.
 *
 * DİKKAT — route'lar bilinçli olarak `:resource` PARAMETRELİ DEĞİL. `RolesGuard`
 * izin anahtarını URL'in `/admin/` sonrasındaki İLK segmentinden çözüyor
 * (`PERMISSION_MAP`: brands → "brands", car-models → "car_models"). Ortak bir
 * `/admin/catalog/imports/:resource` yolu segmenti "catalog" yapar, haritada
 * bulunamaz ve fail-closed kural gereği super_admin dışında herkes 403 alırdı.
 * Literal yollar sayesinde izin matrisi hiç değişmeden doğru çalışır.
 */
@ApiTags("admin")
@Controller("admin")
@AdminRoute()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminCatalogImportController {
  constructor(
    private readonly catalogImport: CatalogImportService,
    private readonly templates: CatalogImportTemplateService,
  ) {}

  // ==================== BRANDS ====================

  @Get("brands/import-schema")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Marka içe aktarma kolon şeması" })
  getBrandImportSchema() {
    return this.catalogImport.getSchema("brands");
  }

  @Get("brands/import-template")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Marka içe aktarma Excel şablonu" })
  async downloadBrandImportTemplate(@Res() res: Response) {
    return this.sendTemplate(res, "brands");
  }

  @Post("brands/bulk-import")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Excel'den toplu marka ekle" })
  @UseInterceptors(FileInterceptor("workbook", WORKBOOK_UPLOAD_OPTIONS))
  async bulkImportBrands(
    @CurrentUser("id") adminId: string,
    @UploadedFile() workbook: Express.Multer.File,
  ) {
    return this.catalogImport.import(adminId, "brands", workbook);
  }

  // ==================== MANUFACTURERS ====================

  @Get("manufacturers/import-schema")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Üretici içe aktarma kolon şeması" })
  getManufacturerImportSchema() {
    return this.catalogImport.getSchema("manufacturers");
  }

  @Get("manufacturers/import-template")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Üretici içe aktarma Excel şablonu" })
  async downloadManufacturerImportTemplate(@Res() res: Response) {
    return this.sendTemplate(res, "manufacturers");
  }

  @Post("manufacturers/bulk-import")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Excel'den toplu üretici ekle" })
  @UseInterceptors(FileInterceptor("workbook", WORKBOOK_UPLOAD_OPTIONS))
  async bulkImportManufacturers(
    @CurrentUser("id") adminId: string,
    @UploadedFile() workbook: Express.Multer.File,
  ) {
    return this.catalogImport.import(adminId, "manufacturers", workbook);
  }

  // ==================== CAR MODELS ====================

  @Get("car-models/import-schema")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Araç modeli içe aktarma kolon şeması" })
  getCarModelImportSchema() {
    return this.catalogImport.getSchema("car-models");
  }

  @Get("car-models/import-template")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @ApiOperation({ summary: "Araç modeli içe aktarma Excel şablonu" })
  async downloadCarModelImportTemplate(@Res() res: Response) {
    return this.sendTemplate(res, "car-models");
  }

  @Post("car-models/bulk-import")
  @Roles(AdminRole.super_admin, AdminRole.admin, AdminRole.moderator)
  @HttpCode(HttpStatus.OK)
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Excel'den toplu araç modeli ekle" })
  @UseInterceptors(FileInterceptor("workbook", WORKBOOK_UPLOAD_OPTIONS))
  async bulkImportCarModels(
    @CurrentUser("id") adminId: string,
    @UploadedFile() workbook: Express.Multer.File,
  ) {
    return this.catalogImport.import(adminId, "car-models", workbook);
  }

  private async sendTemplate(
    res: Response,
    resource: CatalogImportResource,
  ): Promise<void> {
    const buffer = await this.templates.build(resource);
    res.setHeader("Content-Type", XLSX_MIME);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${this.templates.filename(resource)}"`,
    );
    res.send(buffer);
  }
}
