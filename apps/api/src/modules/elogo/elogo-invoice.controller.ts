import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Res,
  HttpStatus,
} from "@nestjs/common";
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
} from "@nestjs/swagger";
import { Response } from "express";
import { CurrentUser } from "../auth/decorators";
import { ElogoInvoicingService } from "./elogo-invoicing.service";

/**
 * Kullanıcının kendi e-Arşiv/e-Fatura gelir belgeleri (komisyon/hizmet/üyelik/boost/takas/iade).
 * JwtAuthGuard global (APP_GUARD) → tüm uçlar oturum ister; @CurrentUser ile sahibe kısıtlı.
 */
@ApiTags("elogo-invoices")
@ApiBearerAuth()
@Controller("elogo/invoices")
export class ElogoInvoiceController {
  constructor(private readonly invoicing: ElogoInvoicingService) {}

  @Get()
  @ApiOperation({ summary: "Kullanıcının e-Arşiv faturaları (liste)" })
  async list(@CurrentUser("id") userId: string) {
    return this.invoicing.listForUser(userId);
  }

  @Get("by-order/:orderId")
  @ApiOperation({
    summary:
      'Bir siparişe ait kullanıcının e-Arşiv faturası (yoksa null) — "Faturayı İndir" butonu için',
  })
  async byOrder(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @CurrentUser("id") userId: string,
  ) {
    return this.invoicing.findOrderInvoiceForUser(orderId, userId);
  }

  @Get(":id/pdf")
  @ApiOperation({
    summary: "e-Arşiv fatura PDF (S3 presigned redirect veya canlı stream)",
  })
  @ApiProduces("application/pdf")
  async pdf(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser("id") userId: string,
    @Res() res: Response,
  ) {
    const r = await this.invoicing.getInvoiceDownload(id, userId);
    if (r.url) {
      // Presigned S3 URL (public) → app doğrudan açar/indirir.
      res.json({ url: r.url, invoiceNumber: r.invoiceNumber });
      return;
    }
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${r.invoiceNumber}.pdf"`,
      "Content-Length": r.buffer!.length,
    });
    res.status(HttpStatus.OK).send(r.buffer);
  }
}
