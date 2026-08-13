import { IsEnum, IsIn, IsOptional } from "class-validator";
import { MembershipTierType } from "@prisma/client";

/** Admin: kullanıcının üyelik kademesini değiştirir (ödeme yok, admin override). */
export class AdminChangeMembershipDto {
  @IsEnum(MembershipTierType)
  tierType: MembershipTierType;

  @IsOptional()
  @IsIn(["monthly", "yearly"])
  billingPeriod?: "monthly" | "yearly";
}

/**
 * Katman güncelleme DTO'su TEK kaynak: membership modülündeki sınıf. Eskiden
 * buradaki kopya farklı kurallar uyguluyordu (maxImagesPerListing tavansız,
 * fiyat tavanı yok) — iki admin rotası aynı gövdeye farklı cevap veriyordu.
 */
export { UpdateMembershipTierDto } from "../../membership/dto/membership.dto";
