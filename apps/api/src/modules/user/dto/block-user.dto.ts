import { IsOptional, IsString, MaxLength } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class BlockUserDto {
  @ApiPropertyOptional({
    description: "Engelleme gerekçesi (yalnız admin'e gösterilir)",
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
