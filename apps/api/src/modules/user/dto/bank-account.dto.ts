import { IsString, IsOptional, Length, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsTrIban } from "../../../common/validators/tr-iban";
import { NormalizeTckn } from "../../../common/validators/legal-identity";

export class UpsertBankAccountDto {
  @ApiProperty({
    example: "Ahmet Yılmaz",
    description: "IBAN sahibinin ad soyadı veya şirket ünvanı",
  })
  @IsString()
  @Length(2, 150, { message: "Hesap sahibi adı 2-150 karakter olmalıdır" })
  accountHolder: string;

  @ApiProperty({
    example: "TR330006100519786457841326",
    description: "Türk IBAN numarası (TR + 24 rakam)",
  })
  // Regex tek başına rastgele 24 rakamı geçirir; mod-97 checksum sunucuda da
  // zorunlu (web'deki isValidIban'ın simetriği) — hata payout gününe kalmasın.
  @IsString()
  @IsTrIban({ message: "Geçerli bir TR IBAN numarası giriniz (TR + 24 rakam)" })
  iban: string;

  // ESKİ ALAN — web formu artık sormuyor; TCKN'nin tek kaynağı üyenin yasal
  // kimliği (`User.nationalId`, kimlik kapısı). Mobil uyumluluk için kabul
  // edilir. Doğrulama BİLEREK serviste (`UserBankService.resolveBankTckn`):
  // formunu GET yanıtıyla dolduran istemci kayıtlı eski değeri geri gönderir;
  // o değer bugünkü kurala uymasa bile IBAN güncellemesini engellememeli.
  // Yalnız YENİ bir değer ortak kuralla doğrulanır ve üyenin beyanıyla
  // karşılaştırılır. Gönderilmezse (`null`/boş dahil) mevcut değer korunur.
  @ApiPropertyOptional({
    example: "10000000146",
    description:
      "ESKİ: TC Kimlik Numarası. Yeni değer geçerli bir TCKN olmalı ve " +
      "üyenin yasal kimliğindeki numarayla aynı olmalı; kayıtlı değeri aynen " +
      "geri göndermek serbesttir; gönderilmezse mevcut değer korunur.",
    deprecated: true,
  })
  @IsOptional()
  @IsString()
  @NormalizeTckn()
  tcKimlikNo?: string;

  @ApiPropertyOptional({
    example: "1234567890",
    description: "Vergi numarası (kurumsal satıcılar için)",
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  taxId?: string;
}

export class BankAccountResponseDto {
  id: string;
  accountHolder: string;
  iban: string;
  tcKimlikNo?: string;
  taxId?: string;
  createdAt: Date;
  updatedAt: Date;
}
