import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Patch,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { UPLOAD_MULTER_OPTIONS } from "../../../common/upload/multer-options";
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
} from "@nestjs/swagger";
import { SellerDocumentType } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { SellerDocumentService } from "./seller-document.service";
import {
  AppealSellerDocumentDto,
  CreateCorporateStakeholderDto,
  UpdateCorporateApplicationDto,
} from "../dto";

/**
 * Kurumsal satıcı başvuru belgeleri: kullanıcı kendi belgelerini yükler/listeler.
 * Kayıt + e-posta doğrulama sonrası (businessStatus=pending) bu ekrandan kullanılır.
 */
@ApiTags("seller-documents")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("users/me/seller-documents")
export class SellerDocumentController {
  constructor(private readonly service: SellerDocumentService) {}

  @Get()
  @ApiOperation({ summary: "Kendi kurumsal başvuru belgelerini listele" })
  async list(@CurrentUser("id") userId: string) {
    return this.service.listMyDocuments(userId);
  }

  @Post()
  @ApiOperation({ summary: "Kurumsal başvuru belgesi yükle/değiştir" })
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file", UPLOAD_MULTER_OPTIONS))
  async upload(
    @CurrentUser("id") userId: string,
    @Body("documentType") documentType: SellerDocumentType,
    @Body("stakeholderId") stakeholderId: string | undefined,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.uploadDocument(
      userId,
      documentType,
      stakeholderId,
      file,
    );
  }

  @Get("application")
  @ApiOperation({ summary: "Kendi kurumsal başvurusunu getir" })
  getApplication(@CurrentUser("id") userId: string) {
    return this.service.getMyApplication(userId);
  }

  @Patch("application")
  @ApiOperation({ summary: "Kurumsal başvurunun ikinci aşamasını güncelle" })
  updateApplication(
    @CurrentUser("id") userId: string,
    @Body() dto: UpdateCorporateApplicationDto,
  ) {
    return this.service.updateMyApplication(userId, dto);
  }

  @Post("application/stakeholders")
  @ApiOperation({ summary: "Şirket sahibi veya ortağı ekle" })
  addStakeholder(
    @CurrentUser("id") userId: string,
    @Body() dto: CreateCorporateStakeholderDto,
  ) {
    return this.service.addStakeholder(userId, dto);
  }

  @Post("application/submit")
  @ApiOperation({ summary: "Kurumsal başvuruyu nihai incelemeye gönder" })
  submit(@CurrentUser("id") userId: string) {
    return this.service.submitForFinalReview(userId);
  }

  @Post(":id/appeal")
  @ApiOperation({ summary: "Belge kararına itiraz et" })
  appeal(
    @CurrentUser("id") userId: string,
    @Param("id") documentId: string,
    @Body() dto: AppealSellerDocumentDto,
  ) {
    return this.service.appealDocument(userId, documentId, dto.note);
  }
}
