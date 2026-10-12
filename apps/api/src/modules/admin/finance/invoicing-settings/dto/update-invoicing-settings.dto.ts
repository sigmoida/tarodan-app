import { IsObject } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * `PUT /admin/invoicing/settings`. Şekil burada (düz nesne), anahtar/değer
 * kuralları `NetsisInvoiceSettingsService`te denetlenir — sağlayıcının
 * ayrıştırıcısıyla aynı kural, ikinci bir kopya yok.
 */
export class UpdateInvoicingSettingsDto {
  @ApiProperty({
    example: {
      "netsis.serial.earchive": "EAR",
      "netsis.cari.autoCreateCorporate": true,
    },
    description: "Ayar anahtarı → değer (metin ya da mantıksal)",
  })
  @IsObject()
  values: Record<string, unknown>;
}
