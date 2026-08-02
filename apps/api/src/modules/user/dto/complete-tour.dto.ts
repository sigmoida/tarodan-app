import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsInt, Max, Min } from "class-validator";
import {
  MAX_ONBOARDING_TOUR_VERSION,
  ONBOARDING_TOUR_KEYS,
  type OnboardingTourKey,
} from "../user-preferences.constants";

/**
 * Bir tanıtım turunun tamamlandığını işaretler. Tur anahtarı ve sürümü ONBOARDING_TOURS
 * haritasından doğrulanır; bilinmeyen anahtar ya da turun kendi sürümünden yüksek bir
 * değer reddedilir (sürüm doğrulaması servistedir, çünkü tur başına farklıdır).
 */
export class CompleteTourDto {
  @ApiProperty({
    enum: ONBOARDING_TOUR_KEYS,
    example: ONBOARDING_TOUR_KEYS[0],
    description: "Onboarding tour key",
  })
  @IsIn(ONBOARDING_TOUR_KEYS)
  tour!: OnboardingTourKey;

  @ApiProperty({
    example: 1,
    minimum: 1,
    maximum: MAX_ONBOARDING_TOUR_VERSION,
    description: "Completed tour version",
  })
  @IsInt()
  @Min(1)
  @Max(MAX_ONBOARDING_TOUR_VERSION)
  version!: number;
}
