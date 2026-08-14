import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CreateRefundRequestDto } from "./dto/create-refund-request.dto";
import { RefundService } from "./refund.service";

@ApiTags("refund-requests")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class RefundController {
  constructor(private readonly refundService: RefundService) {}

  @Post("orders/:orderId/refund-requests")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Alıcı sipariş için iade talebi oluşturur" })
  async createRefundRequest(
    @Param("orderId", new ParseUUIDPipe()) orderId: string,
    @CurrentUser("id") userId: string,
    @Body() dto: CreateRefundRequestDto,
  ) {
    return this.refundService.createRefundRequest(orderId, userId, dto);
  }

  @Get("refund-requests/me")
  @ApiOperation({ summary: "Alıcının kendi iade taleplerini listeler" })
  async myRefundRequests(@CurrentUser("id") userId: string) {
    return this.refundService.listForBuyer(userId);
  }

  @Get("refund-requests/seller")
  @ApiOperation({ summary: "Satıcıya gelen iade taleplerini listeler" })
  async sellerRefundRequests(@CurrentUser("id") userId: string) {
    return this.refundService.listForSeller(userId);
  }

  @Get("refund-requests/:id")
  @ApiOperation({ summary: "İade talebi detayı (alıcı, satıcı veya admin)" })
  async getRefundRequest(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser("id") userId: string,
  ) {
    return this.refundService.getById(id, userId);
  }

  @Post("refund-requests/:id/cancel")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Alıcı iade talebini iptal eder" })
  async cancelRefundRequest(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser("id") userId: string,
  ) {
    return this.refundService.cancelRefundRequest(id, userId);
  }
}
