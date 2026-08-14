import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  Res,
  Req,
  HttpStatus,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiProduces,
} from "@nestjs/swagger";
import { Request, Response } from "express";
import { InvoiceService } from "./invoice.service";
import { JwtAuthGuard } from "../auth/guards";
import { CurrentUser, Public } from "../auth/decorators";
import { i18nMessage } from "../i18n";

@ApiTags("invoices")
@Controller("invoices")
export class InvoiceController {
  private static readonly PAYMENT_CAPABILITY_HEADER = "x-payment-capability";

  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private hasPaymentCapability(req: Request, paymentId: string): boolean {
    const raw =
      req.headers[InvoiceController.PAYMENT_CAPABILITY_HEADER] ?? null;
    const token = Array.isArray(raw) ? raw[0] : raw;
    if (!token) return false;
    try {
      const secret =
        this.configService.get<string>("PAYMENT_CAPABILITY_SECRET") ||
        this.configService.getOrThrow<string>("JWT_SECRET");
      const decoded = this.jwtService.verify(token, { secret }) as {
        sub?: string;
        type?: string;
      };
      return decoded.type === "payment_capability" && decoded.sub === paymentId;
    } catch {
      return false;
    }
  }

  private assertPaymentCapability(req: Request, paymentId: string): void {
    if (!this.hasPaymentCapability(req, paymentId)) {
      throw new ForbiddenException(
        i18nMessage("server.invoice.paymentCapabilityInvalid"),
      );
    }
  }

  /**
   * Get invoices for current user
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get user invoices" })
  async getUserInvoices(
    @CurrentUser("id") userId: string,
    @Query("type") type: "buyer" | "seller" = "buyer",
  ) {
    return this.invoiceService.getUserInvoices(userId, type);
  }

  /**
   * Get invoice by order ID (Authenticated)
   */
  @Get("order/:orderId")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get invoice by order ID" })
  async getByOrderId(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @CurrentUser("id") userId: string,
  ) {
    return this.invoiceService.getByOrderId(orderId, userId);
  }

  /**
   * Get invoice by order ID - PUBLIC (For guests, requires paymentId verification)
   */
  @Get("order/:orderId/public")
  @Public()
  @ApiOperation({
    summary:
      "Get invoice by order ID (Public/Guest with paymentId verification)",
  })
  async getByOrderIdPublic(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Query("paymentId") paymentId: string,
    @Req() req: Request,
  ) {
    if (!paymentId) {
      throw new BadRequestException("paymentId gereklidir");
    }
    this.assertPaymentCapability(req, paymentId);
    return this.invoiceService.getByOrderId(orderId, null, paymentId, true);
  }

  /**
   * Generate invoice for order — yalnız siparişin tarafı (alıcı/satıcı).
   * Güvenlik (#63): eskiden userId almadan generateForOrder çağırıyordu → IDOR
   * (herhangi bir oturumlu kullanıcı başka siparişin fatura PII/PDF'ini üretip
   * okuyabiliyordu). Artık sahiplik guard'lı generateForOrderAsUser'dan geçer.
   */
  @Post("generate/:orderId")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Generate invoice for order (only the order buyer or seller)",
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: "Not a party to this order",
  })
  async generateInvoice(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @CurrentUser("id") userId: string,
  ) {
    return this.invoiceService.generateForOrderAsUser(orderId, userId);
  }

  /**
   * Download invoice PDF by invoice ID (Authenticated)
   */
  @Get("download/:id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Download invoice as PDF" })
  @ApiProduces("application/pdf")
  @ApiResponse({ status: HttpStatus.OK, description: "PDF file stream" })
  async downloadInvoice(
    @Param("id", ParseUUIDPipe) invoiceId: string,
    @CurrentUser("id") userId: string,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.invoiceService.downloadInvoice(
      invoiceId,
      userId,
    );

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="fatura-${invoiceId}.pdf"`,
      "Content-Length": pdfBuffer.length,
    });

    res.status(HttpStatus.OK).send(pdfBuffer);
  }

  /**
   * Download invoice PDF by invoice ID - PUBLIC (For guests, requires paymentId verification)
   */
  @Get("download/:id/public")
  @Public()
  @ApiOperation({
    summary:
      "Download invoice as PDF (Public/Guest with paymentId verification)",
  })
  @ApiProduces("application/pdf")
  @ApiResponse({ status: HttpStatus.OK, description: "PDF file stream" })
  async downloadInvoicePublic(
    @Param("id", ParseUUIDPipe) invoiceId: string,
    @Query("paymentId") paymentId: string,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    if (!paymentId) {
      throw new BadRequestException("paymentId gereklidir");
    }
    this.assertPaymentCapability(req, paymentId);
    const pdfBuffer = await this.invoiceService.downloadInvoice(
      invoiceId,
      null,
      paymentId,
      true,
    );

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="fatura-${invoiceId}.pdf"`,
      "Content-Length": pdfBuffer.length,
    });

    res.status(HttpStatus.OK).send(pdfBuffer);
  }
}
