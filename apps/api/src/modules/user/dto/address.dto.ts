import {
  IsString,
  IsOptional,
  IsBoolean,
  MinLength,
  MaxLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsTrPhone } from "../../../common/validators/tr-phone";

export class CreateAddressDto {
  @ApiPropertyOptional({
    example: "Ev",
    description: "Address title/label",
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  title?: string;

  @ApiProperty({
    example: "Ahmet Yılmaz",
    description: "Full name for delivery",
  })
  @IsString()
  @MinLength(2, { message: "Ad soyad en az 2 karakter olmalıdır" })
  @MaxLength(100)
  fullName: string;

  @ApiProperty({
    example: "+905551234567",
    description: "Phone number for delivery",
  })
  @IsString()
  @IsTrPhone()
  phone: string;

  @ApiProperty({
    example: "İstanbul",
    description: "City name",
  })
  @IsString()
  @MinLength(2, { message: "Şehir en az 2 karakter olmalıdır" })
  @MaxLength(50)
  city: string;

  @ApiProperty({
    example: "Kadıköy",
    description: "District name",
  })
  @IsString()
  @MinLength(2, { message: "İlçe en az 2 karakter olmalıdır" })
  @MaxLength(50)
  district: string;

  @ApiProperty({
    example: "Caferağa Mah. Moda Cad. No:123 D:4",
    description: "Full address",
  })
  @IsString()
  @MinLength(10, { message: "Adres en az 10 karakter olmalıdır" })
  @MaxLength(500)
  address: string;

  @ApiPropertyOptional({
    example: "34710",
    description: "Postal/ZIP code",
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  zipCode?: string;

  @ApiPropertyOptional({
    example: true,
    description: "Set as default address",
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateAddressDto extends PartialType(CreateAddressDto) {}
