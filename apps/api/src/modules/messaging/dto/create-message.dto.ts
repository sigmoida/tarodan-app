import {
  IsString,
  IsUUID,
  IsOptional,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import { Transform } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateThreadDto {
  @ApiProperty({
    description: "ID of the user to start a conversation with",
    example: "uuid-recipient-id",
  })
  @IsUUID("4", { message: "Geçerli bir kullanıcı ID giriniz" })
  @ValidateIf((o) => !o.participantId)
  recipientId?: string;

  @ApiPropertyOptional({
    description: "Alias for recipientId (for backward compatibility)",
    example: "uuid-participant-id",
  })
  @IsUUID("4", { message: "Geçerli bir kullanıcı ID giriniz" })
  @ValidateIf((o) => !o.recipientId)
  participantId?: string;

  @ApiPropertyOptional({
    description: "Product ID if this conversation is about a specific product",
    example: "uuid-product-id",
  })
  @IsOptional()
  @IsUUID("4", { message: "Geçerli bir ürün ID giriniz" })
  productId?: string;

  @ApiPropertyOptional({
    description: "Initial message content (optional)",
    example: "Merhaba, bu ürün hakkında bilgi almak istiyorum.",
  })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: "Mesaj en az 1 karakter olmalıdır" })
  @MaxLength(1000, { message: "Mesaj en fazla 1000 karakter olabilir" })
  message?: string;

  /**
   * Get the effective recipient ID (handles participantId alias)
   */
  getRecipientId(): string {
    return this.recipientId || this.participantId || "";
  }
}

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  content: string;

  @ApiPropertyOptional({
    description: "Product this message is about (per-message context)",
    example: "uuid-product-id",
  })
  @IsOptional()
  @IsUUID("4", { message: "Geçerli bir ürün ID giriniz" })
  productId?: string;
}

export class MessageModerateDto {
  @IsString()
  action: "approve" | "reject";

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
