import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { MembershipTierType } from '@prisma/client';

/** Admin: kullanıcının üyelik kademesini değiştirir (ödeme yok, admin override). */
export class AdminChangeMembershipDto {
  @IsEnum(MembershipTierType)
  tierType: MembershipTierType;

  @IsOptional()
  @IsIn(['monthly', 'yearly'])
  billingPeriod?: 'monthly' | 'yearly';
}
