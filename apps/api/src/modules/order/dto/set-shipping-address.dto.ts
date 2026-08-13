import { IsString, IsOptional, IsNotEmpty } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsTrPhone } from "../../../common/validators/tr-phone";

export class SetShippingAddressDto {
  @ApiProperty({ example: "Ad Soyad" })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiProperty({ example: "+905551234567" })
  @IsString()
  @IsTrPhone()
  phone: string;

  @ApiProperty({ example: "İstanbul" })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty({ example: "Kadıköy" })
  @IsString()
  @IsNotEmpty()
  district: string;

  @ApiProperty({ example: "Mahalle, sokak, no" })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiPropertyOptional({ example: "34000" })
  @IsOptional()
  @IsString()
  zipCode?: string;
}
