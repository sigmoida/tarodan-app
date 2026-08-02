import { CorporateIdentityType, SellerDocumentStatus } from "@prisma/client";
import {
  IsEnum,
  IsIBAN,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from "class-validator";

export class UpdateCorporateApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  companyType?: string;

  @IsOptional()
  @IsString()
  @Length(10, 11)
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  taxOffice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  companyCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  companyDistrict?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  bankAccountHolder?: string;

  @IsOptional()
  @IsIBAN()
  iban?: string;
}

export class CreateCorporateStakeholderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  fullName!: string;

  @IsEnum(CorporateIdentityType)
  identityType!: CorporateIdentityType;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  identityNumber?: string;
}

export class AppealSellerDocumentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  note!: string;
}

export class ReviewSellerDocumentDto {
  @IsEnum(SellerDocumentStatus)
  status!: SellerDocumentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
